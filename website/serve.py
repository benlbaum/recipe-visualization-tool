"""Serve the built Mise app and its website importer using only the standard library."""
import argparse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import ipaddress
import json
import mimetypes
from pathlib import Path
import threading
from urllib.parse import unquote, urlsplit

from import_recipe import handle

DIST = Path(__file__).resolve().parents[1] / 'dist'
PRIVATE = tuple(map(ipaddress.ip_network, ('10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16')))


class Server(ThreadingHTTPServer):
    def __init__(self, address, network):
        self.network = network
        self.imports = threading.BoundedSemaphore(3)
        super().__init__(address, Handler)
        host, port = self.server_address
        self.hosts = {f'{host}:{port}'}
        if ipaddress.ip_address(host).is_loopback:
            self.hosts.add(f'localhost:{port}')

    def verify_request(self, request, address):
        return ipaddress.ip_address(address[0]) in self.network


class Handler(BaseHTTPRequestHandler):
    def setup(self):
        super().setup()
        self.connection.settimeout(15)

    def respond(self, status, value, mime='application/json; charset=utf-8'):
        data = value if isinstance(value, bytes) else json.dumps(value, ensure_ascii=True, allow_nan=False).encode()
        self.send_response(status)
        self.send_header('Content-Type', mime)
        self.send_header('Content-Length', str(len(data)))
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Security-Policy', "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'")
        self.end_headers()
        if self.command != 'HEAD':
            self.wfile.write(data)

    def allowed(self):
        host = self.headers.get('Host')
        if host not in self.server.hosts or self.headers.get('Origin', 'http://' + host) != 'http://' + host:
            self.respond(403, {'error': 'Open Mise at the address printed by the server.'})
            return False
        return True

    def do_GET(self):
        if not self.allowed():
            return
        route = unquote(urlsplit(self.path).path)
        if route == '/api/health':
            return self.respond(200, {'app': 'Mise', 'websiteImport': True})
        candidate = (DIST / (route.lstrip('/') or 'index.html')).resolve()
        if not candidate.is_relative_to(DIST) or not candidate.is_file():
            return self.respond(404, {'error': 'File not found.'})
        mime = mimetypes.guess_type(candidate.name)[0] or 'application/octet-stream'
        return self.respond(200, candidate.read_bytes(), mime)

    do_HEAD = do_GET

    def do_POST(self):
        if not self.allowed():
            return
        if self.path != '/api/import':
            return self.respond(404, {'error': 'Unknown route.'})
        if self.headers.get('X-Mise-Import') != '1' or self.headers.get_content_type() != 'application/json':
            return self.respond(403, {'error': 'Use the import form in Mise.'})
        if self.headers.get('Transfer-Encoding'):
            return self.respond(400, {'error': 'A content length is required.'})
        if not self.server.imports.acquire(blocking=False):
            return self.respond(429, {'error': 'Three imports are in progress. Try again shortly.'})
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if not 0 < size <= 3_000_000:
                return self.respond(413, {'error': 'Import body is too large or empty.'})
            self.respond(200, handle(json.loads(self.rfile.read(size))))
        except (ValueError, RecursionError, TimeoutError) as error:
            self.respond(422, {'error': str(error)})
        finally:
            self.server.imports.release()


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--lan', metavar='ADDRESS/PREFIX', help='Ethernet or Wi-Fi IPv4 address and subnet, e.g. 192.168.1.20/24')
    parser.add_argument('--port', type=int, default=8767)
    args = parser.parse_args()
    interface = ipaddress.IPv4Interface(args.lan or '127.0.0.1/32')
    if args.lan and not any(interface.network.subnet_of(net) for net in PRIVATE):
        parser.error('--lan requires a private LAN address and subnet.')
    if not (DIST / 'index.html').is_file():
        parser.error('Run npm run build before starting Mise.')
    with Server((str(interface.ip), args.port), interface.network) as server:
        print(f'Mise is ready at http://{interface.ip}:{server.server_port}/', flush=True)
        server.serve_forever()
