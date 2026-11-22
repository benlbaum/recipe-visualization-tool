"""Convert publisher recipe cards into a compact, source-attributed import."""
import base64
from html.parser import HTMLParser
import json
import re
import sys
from urllib.parse import urljoin

from extractor import extract, NoRecipe, normalize
from fetcher import fetch_public, validate_url, MAX_BYTES
from text_utils import html_text


class RecipeLists(HTMLParser):
    """Fallback for pages with visible Ingredients and Directions headings."""
    sections = {'ingredients': 'recipeIngredient', 'instructions': 'recipeInstructions',
                'directions': 'recipeInstructions', 'method': 'recipeInstructions', 'steps': 'recipeInstructions',
                'preparation': 'recipeInstructions', 'notes': 'recipeNotes', 'recipe notes': 'recipeNotes'}
    skip = {'script', 'style', 'nav', 'footer', 'aside', 'noscript', 'template'}

    def __init__(self):
        super().__init__()
        self.recipe = {'recipeIngredient': [], 'recipeInstructions': [], 'recipeNotes': []}
        self.tag, self.parts, self.section, self.blocked = '', [], '', []
        self.level = 0
        self.subheading = ''
        self.multiple = False

    def handle_starttag(self, tag, attrs):
        if tag in self.skip:
            self.blocked.append(tag)
        if self.blocked:
            return
        if re.fullmatch(r'h[1-6]', tag) or (not self.tag and (tag == 'title' or self.section and tag in ('li', 'p'))):
            self.tag, self.parts = tag, []
        if self.tag and tag == 'br':
            self.parts.append('\n')

    def handle_data(self, data):
        if self.tag and not self.blocked:
            self.parts.append(data)

    def handle_endtag(self, tag):
        if self.blocked:
            if self.blocked[-1] == tag:
                self.blocked.pop()
            return
        if not self.tag or tag != self.tag:
            return
        value = ' '.join(''.join(self.parts).split())
        self.tag, self.parts = '', []
        if not value:
            return
        if tag in ('h1', 'title') and (tag == 'h1' or 'name' not in self.recipe):
            self.recipe['name'] = value
        if re.fullmatch(r'h[1-6]', tag):
            section = self.sections.get(value.casefold().rstrip(':').strip())
            if section == 'recipeIngredient' and self.recipe['recipeInstructions'] and self.recipe['recipeIngredient']:
                self.multiple = True
            if section or int(tag[1]) <= self.level:
                self.section, self.level, self.subheading = section, int(tag[1]), ''
            elif self.section:
                self.subheading = value
        elif self.section:
            self.recipe[self.section].append(f'{self.subheading} — {value}' if self.subheading else value)


def web_url(value, base):
    if isinstance(value, list):
        return next((url for item in value if (url := web_url(item, base))), '')
    if isinstance(value, dict):
        value = value.get('contentUrl') or value.get('url') or value.get('@id')
    if not isinstance(value, str) or not value.strip():
        return ''
    try:
        return validate_url(urljoin(base, value))[0]
    except ValueError:
        return ''


def compact(item, url):
    raw = item['published']
    steps = []
    for entry in item['steps'] + item['ingredients']:
        raw_value = entry['raw']
        if not isinstance(raw_value, str) and not (isinstance(raw_value, dict) and
                any(isinstance(raw_value.get(k), str) and raw_value[k].strip() for k in ('text', 'name'))):
            return None
    for step in item['steps']:
        value = step['raw']
        duration = (value.get('performTime') or value.get('totalTime')) if isinstance(value, dict) else None
        # A single string can hold an entire list. Keep structured HowToStep entries intact.
        parts = step['displayText'].splitlines() if isinstance(value, str) else [step['displayText']]
        steps.extend({'text': text, 'section': step.get('displaySection', ''), 'duration': duration}
                     for text in parts if text.strip())
    return {'title': item['titleDisplay'], 'url': url, 'method': item['provenance']['method'],
            'image': web_url(raw.get('image'), url),
            'ingredients': [text for i in item['ingredients'] for text in i['displayText'].splitlines() if text.strip()],
            'steps': steps, 'description': html_text(raw['description']) if isinstance(raw.get('description'), str) else '',
            'published': raw}


def import_page(url, html=None):
    url = validate_url(url)[0]
    if html is None:
        html, url = fetch_public(url)
    elif not isinstance(html, str) or len(html.encode('utf-8')) > MAX_BYTES:
        raise ValueError('Saved HTML must be under 2 MB.')
    try:
        items = extract(html, url)
    except NoRecipe:
        items = []
    cards = [card for item in items if (card := compact(item, url)) and card['ingredients'] and card['steps']]
    if not cards or (len(cards) == 1 and not (cards[0]['published'].get('recipeNotes') or cards[0]['published'].get('notes'))):
        parser = RecipeLists()
        parser.feed(html)
        parser.close()
        raw = parser.recipe
        if not cards and raw['recipeIngredient'] and raw['recipeInstructions']:
            if parser.multiple:
                raise ValueError('This page contains several ingredient lists. Open the individual recipe or print page.')
            cards.append(compact(normalize(raw, '$', {'method': 'Ingredients and directions on the page'}), url))
        elif len(cards) == 1 and raw['recipeNotes'] and not parser.multiple:
            cards[0]['published']['recipeNotes'] = raw['recipeNotes']
    if not cards:
        raise ValueError('Could not find a recipe with both ingredients and directions. Try the recipe’s own page or its print view.')
    return cards


def handle(request):
    if not isinstance(request, dict):
        raise ValueError('Expected a recipe URL.')
    if request.get('photo') is True:
        data, mime = fetch_public(request.get('url'), image=True)
        return {'photo': f'data:{mime};base64,' + base64.b64encode(data).decode('ascii')}
    return {'recipes': import_page(request.get('url'), request.get('html'))}


if __name__ == '__main__':
    # The desktop app uses the same importer over a local pipe.
    try:
        result = handle(json.loads(sys.stdin.buffer.read(3_000_001)))
    except (ValueError, OSError, RecursionError) as error:
        result = {'error': str(error)}
    sys.stdout.buffer.write(json.dumps(result, ensure_ascii=True, allow_nan=False).encode('ascii'))
