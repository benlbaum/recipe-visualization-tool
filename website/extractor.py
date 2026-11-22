"""Source-preserving schema.org Recipe extraction. No remote scripts execute."""
from html.parser import HTMLParser
import hashlib
import json
from datetime import datetime, timezone
from urllib.parse import urljoin

from microdata import read_microdata
from text_utils import html_text, plain_text

MAX_ENTRIES = 4000
MAX_RECIPES = 100


class ExtractionError(ValueError):
    pass


class NoRecipe(ExtractionError):
    pass


class SchemaParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=False)
        self.active, self.parts, self.blocks = False, [], []

    def handle_starttag(self, tag, attrs):
        if tag == 'script' and (dict(attrs).get('type') or '').split(';')[0].strip().lower() == 'application/ld+json':
            self.active, self.parts = True, []

    def handle_data(self, data):
        if self.active:
            self.parts.append(data)

    def handle_endtag(self, tag):
        if tag == 'script' and self.active:
            self.blocks.append(''.join(self.parts))
            self.active = False

    def close(self):
        super().close()
        if self.active:
            self.blocks.append(''.join(self.parts))
            self.active = False


def has_type(value, expected):
    types = value.get('@type', [])
    if isinstance(types, str):
        types = [types]
    if not isinstance(types, list):
        return False
    return any(isinstance(t, str) and t in (expected, 'schema:' + expected,
               'http://schema.org/' + expected, 'https://schema.org/' + expected) for t in types)


def objects(value, path='$', depth=0):
    if depth > 50:
        raise ExtractionError('Structured data is nested too deeply.')
    if isinstance(value, dict):
        yield value, path
        for key, child in value.items():
            yield from objects(child, f'{path}.{key}', depth + 1)
    elif isinstance(value, list):
        for i, child in enumerate(value):
            yield from objects(child, f'{path}[{i}]', depth + 1)


def find_recipes(value, path='$', depth=0):
    for node, source_path in objects(value, path, depth):
        if has_type(node, 'Recipe'):
            yield node, source_path


def source_text(value):
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        for key in ('text', 'name'):
            if isinstance(value.get(key), str):
                return value[key]
    return json.dumps(value, ensure_ascii=False)


def warn(warnings, message):
    if message not in warnings:
        warnings.append(message)


class References:
    """Resolve document-local @id stubs; never fetch linked resources or contexts."""
    def __init__(self, documents, base_url):
        self.index, self.base_url = {}, base_url
        self.used_paths = set()
        for document, path in documents:
            for node, node_path in objects(document, path):
                ident = node.get('@id')
                if isinstance(ident, str) and set(node) - {'@id', '@type', '@context'}:
                    self.index.setdefault(urljoin(base_url, ident), []).append((node, node_path))

    def resolve(self, value, path, warnings, active=()):
        if not (isinstance(value, dict) and isinstance(value.get('@id'), str)
                and not set(value) - {'@id', '@type', '@context'}):
            return value, path, active
        ident = urljoin(self.base_url, value['@id'])
        if ident in active:
            warn(warnings, 'A cyclic JSON-LD @id reference could not be expanded; inspect the retained source.')
            return value, path, active
        matches = self.index.get(ident, [])
        if len(matches) != 1:
            reason = 'ambiguous' if matches else 'unresolved'
            warn(warnings, f'An {reason} JSON-LD @id reference was kept without guessing: {value["@id"]}')
            return value, path, active
        resolved, target_path = matches[0]
        self.used_paths.add(target_path)
        return resolved, target_path, (*active, ident)


def instructions(value, path, section='', depth=0, resolver=None, warnings=None, active=(), reference_path=None):
    if depth > 40:
        raise ExtractionError('Instructions are nested too deeply or contain a reference cycle.')
    warnings = warnings if warnings is not None else []
    original_path = path
    if resolver:
        value, path, active = resolver.resolve(value, path, warnings, active)
    if path != original_path:
        reference_path = reference_path or original_path
    if isinstance(value, list):
        for i, item in enumerate(value):
            yield from instructions(item, f'{path}[{i}]', section, depth + 1, resolver, warnings, active, reference_path)
    elif isinstance(value, dict):
        child = value.get('itemListElement')
        if child is not None:
            name = value.get('name', section)
            name = source_text(name) if not isinstance(name, str) else name
            yield from instructions(child, path + '.itemListElement', name, depth + 1, resolver, warnings, active, reference_path)
        elif 'item' in value:
            yield from instructions(value['item'], path + '.item', section, depth + 1, resolver, warnings, active, reference_path)
        else:
            if not any(isinstance(value.get(k), str) and value[k].strip() for k in ('text', 'name')):
                warn(warnings, 'An instruction has no readable text; its raw value was retained for review.')
            yield entry(value, path, section, reference_path)
    elif value is not None:
        # Do not split on punctuation: alternatives and method choices stay intact.
        if not isinstance(value, str) or not value.strip():
            warn(warnings, 'An instruction has no readable text; its raw value was retained for review.')
        yield entry(value, path, section, reference_path)


def entry(value, path, section=None, reference_path=None):
    text = source_text(value)
    result = {'text': text, 'displayText': html_text(text), 'sourcePath': path, 'raw': value}
    if section is not None:
        result.update(section=section, displaySection=html_text(section))
    if reference_path:
        result['referencePath'] = reference_path
    return result


def normalize(recipe, path, provenance, resolver=None, sources=None):
    warnings = []
    raw_ingredients = recipe.get('recipeIngredient', recipe.get('ingredients', []))
    ingredient_key = 'recipeIngredient' if 'recipeIngredient' in recipe else 'ingredients'
    ingredient_path = f'{path}.{ingredient_key}'
    original_ingredient_path = ingredient_path
    if resolver:
        raw_ingredients, ingredient_path, _ = resolver.resolve(raw_ingredients, ingredient_path, warnings)
    if isinstance(raw_ingredients, dict) and 'itemListElement' in raw_ingredients:
        raw_ingredients = raw_ingredients['itemListElement']
        ingredient_path += '.itemListElement'
    was_list = isinstance(raw_ingredients, list)
    if not was_list:
        raw_ingredients = [raw_ingredients]
        warn(warnings, 'Ingredients were not a list; retained as a single source entry. Review before mapping.')
    if len(raw_ingredients) > MAX_ENTRIES:
        raise ExtractionError('Too many ingredient entries to import safely.')
    ingredients = []
    for i, value in enumerate(raw_ingredients):
        item_path = f'{ingredient_path}[{i}]' if was_list else ingredient_path
        reference_path = None
        if ingredient_path != original_ingredient_path and not ingredient_path.startswith(original_ingredient_path + '.'):
            reference_path = original_ingredient_path
        if resolver:
            value, resolved_path, _ = resolver.resolve(value, item_path, warnings)
            if resolved_path != item_path:
                reference_path = item_path
                item_path = resolved_path
        ingredients.append({'id': f'i{i+1}', **entry(value, item_path, reference_path=reference_path)})
        if not isinstance(value, str) or not value.strip():
            warn(warnings, 'An ingredient is not a nonempty text value; inspect its retained raw value before mapping.')
    steps = []
    for step in instructions(recipe.get('recipeInstructions'), path + '.recipeInstructions', resolver=resolver, warnings=warnings):
        if len(steps) >= MAX_ENTRIES:
            raise ExtractionError('Too many instruction entries to import safely.')
        step['id'] = f's{len(steps)+1}'
        steps.append(step)
    if not ingredients:
        warn(warnings, 'No ingredients found in the published structured data.')
    if not steps:
        warn(warnings, 'No instructions found in the published structured data.')
    if sources:
        for item in ingredients + steps:
            # Microdata values already have textContent/attribute entity decoding.
            # Parsing them again would erase literal escaped angle-bracket text.
            item['displayText'] = plain_text(item['text'])
            if 'section' in item:
                item['displaySection'] = plain_text(item['section'])
            if item['sourcePath'] in sources:
                item['sourceHtml'] = sources[item['sourcePath']]['html']
            text_path = item['sourcePath']
            if isinstance(item['raw'], dict):
                for key in ('text', 'name'):
                    if isinstance(item['raw'].get(key), str):
                        text_path += '.' + key
                        break
            if 'textHtml' in sources.get(text_path, {}):
                item['displayText'] = html_text(sources[text_path]['textHtml'])
    if any(s['displayText'] != s['text'] for s in ingredients + steps):
        warn(warnings, 'Display text decodes HTML markup/entities and normalizes whitespace; original text and raw source remain unchanged.')
    warn(warnings, 'Imported order is source order, not a dependency graph. Ingredient links and parallel work need review.')
    title = source_text(recipe.get('name', 'Untitled recipe'))
    title_display = html_text(title)
    if sources:
        title_source = sources.get(path + '.name', {})
        title_display = html_text(title_source['textHtml']) if 'textHtml' in title_source else plain_text(title)
    published = dict(recipe)
    if resolver:
        for key in ('author', 'image', 'nutrition', 'publisher'):
            if key in recipe:
                value = recipe[key]
                if isinstance(value, list):
                    published[key] = [resolver.resolve(v, path + '.' + key, warnings)[0] for v in value]
                else:
                    published[key] = resolver.resolve(value, path + '.' + key, warnings)[0]
    return {'title': title, 'titleDisplay': title_display, 'ingredients': ingredients,
            'steps': steps, 'metadata': {k: recipe[k] for k in ('author', 'recipeYield', 'prepTime', 'cookTime', 'totalTime', 'dateModified') if k in recipe},
            'provenance': {**provenance, 'schemaPath': path}, 'rawRecipe': recipe, 'published': published, 'warnings': warnings,
            'graph': {'nodes': [{'id': s['id'], 'label': s.get('displaySection') or f'Step {i+1}', 'stepIds': [s['id']],
                                 'ingredientIds': [], 'dependsOn': [], 'lane': 'Source order', 'column': i,
                                 'reviewed': False} for i, s in enumerate(steps)],
                      'note': 'No dependencies inferred. Connect steps in Review & edit.'}}


def _json_document(block):
    # Recognize a common script envelope without changing the retained script.
    content = block.strip().lstrip('\ufeff').strip()
    if content.startswith('<!--') and content.endswith('-->'):
        content = content[4:-3].strip()
    def invalid_constant(value):
        raise ValueError('Non-standard JSON constant: ' + value)
    return json.loads(content, parse_constant=invalid_constant)


def extract(html, source_url, final_url=None):
    parser = SchemaParser()
    parser.feed(html)
    parser.close()
    recipes, warnings, documents, candidates = [], [], [], []
    provenance = {'requestedUrl': source_url, 'finalUrl': final_url or source_url,
                  'fetchedAt': datetime.now(timezone.utc).isoformat(), 'method': 'schema.org Recipe JSON-LD',
                  'htmlSha256': hashlib.sha256(html.encode('utf-8')).hexdigest(),
                  'htmlHashEncoding': 'UTF-8 encoding of decoded HTML text'}
    for block_index, block in enumerate(parser.blocks):
        try:
            document = _json_document(block)
            block_path = f'script[{block_index}]$'
            found = list(find_recipes(document, block_path))
            documents.append((document, block_path))
            candidates.extend((recipe, path, block_index) for recipe, path in found)
        except (ValueError, RecursionError):
            warn(warnings, f'JSON-LD block {block_index + 1} was malformed or too deeply nested and could not be read.')
    resolver = References(documents, final_url or source_url)
    for recipe, path, block_index in candidates:
        # A typed @id pointer is not a second recipe when its full definition exists.
        if not set(recipe) - {'@id', '@type', '@context'} and isinstance(recipe.get('@id'), str):
            if resolver.index.get(urljoin(resolver.base_url, recipe['@id'])):
                continue
        if len(recipes) >= MAX_RECIPES:
            raise ExtractionError('Too many recipe candidates to import safely.')
        resolver.used_paths.clear()
        result = normalize(recipe, path, provenance, resolver)
        # Retain exact JSON-LD scripts used by the recipe and locally resolved refs.
        used = {block_index}
        source_paths = resolver.used_paths | {item['sourcePath'] for item in result['ingredients'] + result['steps']}
        for source_path in source_paths:
            if source_path.startswith('script['):
                used.add(int(source_path.split(']', 1)[0][7:]))
        result['provenance']['sourceBlocks'] = [{'index': i, 'text': parser.blocks[i]} for i in sorted(used)]
        recipes.append(result)
    if not recipes:
        for recipe, path, sources, fallback_warnings in read_microdata(html, final_url or source_url):
            if len(recipes) >= MAX_RECIPES:
                raise ExtractionError('Too many recipe candidates to import safely.')
            micro_provenance = {**provenance, 'method': 'schema.org Recipe microdata', 'sourceElements': sources}
            result = normalize(recipe, path, micro_provenance, sources=sources)
            result['warnings'] = ['Imported explicit HTML microdata because no Recipe JSON-LD was found. Review the source markup and ordering.'] + fallback_warnings + result['warnings']
            recipes.append(result)
    if not recipes:
        raise NoRecipe('No structured recipe found.')
    for recipe in recipes:
        recipe['warnings'] = warnings + recipe['warnings']
    return recipes
