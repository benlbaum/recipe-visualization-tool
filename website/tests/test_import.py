import http.client
from contextlib import closing
import ipaddress
import json
from pathlib import Path
import sys
import threading
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from import_recipe import import_page
from fetcher import public_ip, validate_url
from serve import Server

URL = 'https://example.org/recipe'
RAW = {'@type': 'Recipe', 'name': 'Soup', 'recipeIngredient': ['½ tsp salt', '3 cups water'],
       'recipeInstructions': [{'@type': 'HowToSection', 'name': 'Broth', 'itemListElement': [
           {'@type': 'HowToStep', 'text': 'Simmer gently.', 'performTime': 'PT5M'}]}],
       'nutrition': {'calories': '10 kcal'}, 'recipeYield': '3 bowls', 'totalTime': 'PT20M'}


def ld(data):
    return '<script type="application/ld+json">' + json.dumps(data) + '</script>'


class WebsiteTests(unittest.TestCase):
    def test_only_public_website_destinations(self):
        self.assertTrue(public_ip('8.8.8.8'))
        for addr in ['127.0.0.1', '192.168.1.1', '::1', '64:ff9b::1']:
            self.assertFalse(public_ip(addr))
        for url in ['file:///tmp/recipe', 'https://localhost/recipe', 'http://example.org:0/test']:
            with self.assertRaises(ValueError):
                validate_url(url)

    def test_multiple_cards_local_references_and_method_sections(self):
        page = ld({'@graph': [{**RAW, 'image': {'@id': '#photo'}, 'author': {'@id': '#writer'}},
                              {'@id': '#photo', 'contentUrl': '/soup.jpg'}, {'@id': '#writer', 'name': 'A cook'},
                              {**RAW, 'name': 'Stew'}]})
        with patch('import_recipe.fetch_public', return_value=(page, URL)) as fetch:
            cards = import_page('https://example.org/old-link')
        fetch.assert_called_once()
        self.assertEqual([c['title'] for c in cards], ['Soup', 'Stew'])
        self.assertEqual(cards[0]['url'], URL)
        self.assertEqual(cards[0]['ingredients'], RAW['recipeIngredient'])
        self.assertEqual(cards[0]['steps'], [{'section': 'Broth', 'text': 'Simmer gently.', 'duration': 'PT5M'}])
        self.assertEqual(cards[0]['image'], 'https://example.org/soup.jpg')
        self.assertEqual(cards[0]['published']['author']['name'], 'A cook')
        self.assertEqual(cards[0]['published']['nutrition'], RAW['nutrition'])

    def test_microdata_and_strings_containing_lists(self):
        html = '<article itemscope itemtype="https://schema.org/Recipe"><h1 itemprop="name">Toast</h1>' \
               '<p itemprop="recipeIngredient">2 slices bread</p><p itemprop="recipeInstructions">Toast until golden.</p></article>'
        self.assertEqual(import_page(URL, html)[0]['steps'][0]['text'], 'Toast until golden.')
        card = import_page(URL, ld({**RAW, 'recipeInstructions': '<ol><li>Heat.</li><li>Serve.</li></ol>'}))[0]
        self.assertEqual([s['text'] for s in card['steps']], ['Heat.', 'Serve.'])

    def test_visible_recipe_and_notes(self):
        html = '<h1>Soup</h1><h2>Ingredients</h2><ul><li>2 cups stock</li></ul>' \
               '<h2>Method</h2><ol><li>Heat the stock.</li></ol><h2>Notes</h2><p>Freezes well.</p>'
        card = import_page(URL, html)[0]
        self.assertEqual(card['ingredients'], ['2 cups stock'])
        self.assertEqual(card['steps'][0]['text'], 'Heat the stock.')
        self.assertEqual(card['published']['recipeNotes'], ['Freezes well.'])
        self.assertEqual(import_page(URL, ld(RAW) + html)[0]['published']['recipeNotes'], ['Freezes well.'])
        with self.assertRaisesRegex(ValueError, 'individual recipe'):
            import_page(URL, html + html)

    def test_empty_or_unreadable_recipe(self):
        for page in ['<h1>Blog</h1>', ld({**RAW, 'recipeInstructions': ''}), ld({**RAW, 'recipeIngredient': []})]:
            with self.assertRaisesRegex(ValueError, 'both ingredients and directions'):
                import_page(URL, page)

    def test_same_origin_api(self):
        server = Server(('127.0.0.1', 0), ipaddress.ip_network('127.0.0.1/32'))
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            host, port = server.server_address
            for origin, expected in [(f'http://{host}:{port}', 200), ('https://example.org', 403)]:
                with closing(http.client.HTTPConnection(host, port)) as connection:
                    connection.request('POST', '/api/import', json.dumps({'url': URL, 'html': ld(RAW)}),
                                       {'Origin': origin, 'Content-Type': 'application/json', 'X-Mise-Import': '1'})
                    response = connection.getresponse()
                    self.assertEqual(response.status, expected)
                    if expected == 200:
                        self.assertEqual(json.load(response)['recipes'][0]['title'], 'Soup')
        finally:
            server.shutdown()
            server.server_close()
            thread.join()
