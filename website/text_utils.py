"""Plain display text is derived separately; callers retain the source value."""
from html.parser import HTMLParser


class TextParser(HTMLParser):
    BLOCKS = {'p', 'div', 'li', 'ul', 'ol', 'br', 'h1', 'h2', 'h3', 'h4', 'tr'}

    def __init__(self, display=True):
        super().__init__(convert_charrefs=True)
        self.parts, self.hidden, self.display = [], [], display

    def handle_starttag(self, tag, attrs):
        if self.display and tag in ('script', 'style'):
            self.hidden.append(tag)
        if self.display and tag in self.BLOCKS and not self.hidden:
            self.parts.append('\n')

    def handle_endtag(self, tag):
        if self.hidden and tag == self.hidden[-1]:
            self.hidden.pop()
        if self.display and tag in self.BLOCKS and not self.hidden:
            self.parts.append('\n')

    def handle_data(self, data):
        if not self.hidden:
            self.parts.append(data)


def plain_text(value):
    return '\n'.join(' '.join(line.split()) for line in value.splitlines() if line.strip())


def html_text(value, display=True):
    parser = TextParser(display)
    parser.feed(value)
    parser.close()
    result = ''.join(parser.parts)
    if not display:
        return result
    return plain_text(result)
