"""Conservative schema.org microdata reader with exact HTML source spans.

Uses explicit item properties only: no visual-layout or site-specific guessing.
This is not a browser DOM repair engine; fallback imports always request review.
"""
from collections import defaultdict
from dataclasses import dataclass, field
from html.parser import HTMLParser
from urllib.parse import urljoin

from text_utils import html_text


@dataclass
class Element:
    tag: str
    attrs: dict
    start: int
    inner: int
    end: int
    close: int
    children: list = field(default_factory=list)


class MicrodataParser(HTMLParser):
    VOID = {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'}

    def __init__(self, html):
        super().__init__(convert_charrefs=False)
        self.html = html
        self.lines, position = [], 0
        for line in html.split('\n'):
            self.lines.append(position)
            position += len(line) + 1
        self.root = Element('', {}, 0, 0, len(html), len(html))
        self.stack, self.elements, self.ids, self.expansions = [self.root], [], {}, 0
        self.feed(html)
        self.close()

    def source_offset(self):
        line, column = self.getpos()
        return self.lines[line - 1] + column

    def handle_starttag(self, tag, attrs):
        if len(self.elements) >= 50000 or len(self.stack) > 200:
            raise ValueError('HTML contains too many or too deeply nested elements to import safely.')
        start = self.source_offset()
        inner = start + len(self.get_starttag_text())
        # Common optional end tags. Other malformed structures remain explicit
        # in the retained HTML instead of silently pretending to be browser DOM.
        if tag in ('li', 'p') and self.stack[-1].tag == tag:
            node = self.stack.pop()
            node.close = node.end = start
        node = Element(tag, dict(attrs), start, inner, len(self.html), len(self.html))
        self.stack[-1].children.append(node)
        self.elements.append(node)
        if node.attrs.get('id'):
            self.ids.setdefault(node.attrs['id'], node)
        if tag in self.VOID:
            node.close = node.end = inner
        else:
            self.stack.append(node)

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if self.stack[-1].tag == tag:
            node = self.stack.pop()
            node.close = node.end = node.inner

    def handle_endtag(self, tag):
        for i in range(len(self.stack) - 1, 0, -1):
            if self.stack[i].tag == tag:
                start = self.source_offset()
                end = self.html.find('>', start)
                for node in self.stack[i:]:
                    node.close = start
                    node.end = end + 1 if end >= 0 else len(self.html)
                del self.stack[i:]
                break

    def properties(self, root, warnings):
        pending = list(root.children)
        for ident in (root.attrs.get('itemref') or '').split():
            if ident in self.ids:
                pending.append(self.ids[ident])
            else:
                warnings.append(f'Microdata itemref {ident!r} was not found; review the source.')
        seen, result = {id(root)}, []
        while pending:
            node = pending.pop()
            if id(node) in seen:
                continue
            seen.add(id(node))
            if node.attrs.get('itemprop'):
                result.append(node)
            if 'itemscope' not in node.attrs:
                pending.extend(node.children)
        return sorted(result, key=lambda x: x.start)

    def evidence(self, node):
        return {'start': node.start, 'end': node.end,
                'html': self.html[node.start:node.end]}

    def value(self, node, base_url, path, sources, warnings, active):
        self.expansions += 1
        if self.expansions > 10000:
            raise ValueError('Microdata expands to too many properties to import safely.')
        sources[path] = self.evidence(node)
        if 'itemscope' in node.attrs:
            return self.item(node, base_url, path, sources, warnings, active)
        if node.tag == 'meta':
            return node.attrs.get('content', '')
        if node.tag in ('data', 'meter'):
            return node.attrs.get('value', '')
        if node.tag == 'time' and 'datetime' in node.attrs:
            return node.attrs['datetime']
        url_attr = ('src' if node.tag in ('audio', 'embed', 'iframe', 'img', 'source', 'track', 'video')
                    else 'href' if node.tag in ('a', 'area', 'link')
                    else 'data' if node.tag == 'object' else None)
        if url_attr:
            value = node.attrs.get(url_attr, '')
            return urljoin(base_url, value) if value else ''
        sources[path]['textHtml'] = self.html[node.inner:node.close]
        return html_text(sources[path]['textHtml'], display=False)

    def item(self, root, base_url, path, sources, warnings, active=()):
        if id(root) in active or len(active) > 40:
            warnings.append('Cyclic or deeply nested microdata was retained as source HTML; review it manually.')
            return {}
        active = (*active, id(root))
        result = {}
        types = (root.attrs.get('itemtype') or '').split()
        if types:
            result['@type'] = types[0] if len(types) == 1 else types
        if root.attrs.get('itemid'):
            result['@id'] = urljoin(base_url, root.attrs['itemid'])
        groups = defaultdict(list)
        for node in self.properties(root, warnings):
            for prop in dict.fromkeys(node.attrs['itemprop'].split()):
                # Only schema.org URI names are abbreviated; other vocabularies
                # must never be mistaken for recipe properties.
                for prefix in ('http://schema.org/', 'https://schema.org/'):
                    if prop.startswith(prefix):
                        prop = prop[len(prefix):]
                        break
                groups[prop].append(node)
        for prop, nodes in groups.items():
            # Repeating recipe fields are always arrays, even for a single item.
            array = len(nodes) > 1 or prop in ('recipeIngredient', 'ingredients', 'recipeInstructions', 'itemListElement')
            values = [self.value(node, base_url, f'{path}.{prop}' + (f'[{i}]' if array else ''),
                                 sources, warnings, active) for i, node in enumerate(nodes)]
            result[prop] = values if array else values[0]
        return result


def read_microdata(html, base_url):
    parser = MicrodataParser(html)
    for index, node in enumerate(parser.elements):
        if 'itemscope' not in node.attrs:
            continue
        if not any(t.rstrip('/') in ('http://schema.org/Recipe', 'https://schema.org/Recipe')
                   for t in (node.attrs.get('itemtype') or '').split()):
            continue
        path = f'microdata[{index}]$'
        sources, warnings = {path: parser.evidence(node)}, []
        value = parser.item(node, base_url, path, sources, warnings)
        yield value, path, sources, warnings
