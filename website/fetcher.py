"""Bounded public-web fetcher with DNS pinning and redirect validation."""
import concurrent.futures
from email.message import Message
from html.parser import HTMLParser
import http.client
import ipaddress
import socket
import ssl
import time
import zlib
from urllib.parse import quote, urlsplit, urlunsplit, urljoin

MAX_BYTES = 2_000_000
MAX_REDIRECTS = 4
TIMEOUT = 10
DNS_POOL = concurrent.futures.ThreadPoolExecutor(max_workers=4)
TRANSLATION_PREFIXES = (ipaddress.ip_network('64:ff9b::/96'), ipaddress.ip_network('64:ff9b:1::/48'))


class FetchError(ValueError):
    pass


class EncodingParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.charset = None

    def handle_starttag(self, tag, attrs):
        if tag != 'meta' or self.charset:
            return
        attrs = dict(attrs)
        if attrs.get('charset'):
            self.charset = attrs['charset'].strip()
        elif (attrs.get('http-equiv') or '').lower() == 'content-type' and attrs.get('content'):
            message = Message()
            message['Content-Type'] = attrs['content']
            self.charset = message.get_content_charset()


def decode_html(data, header_charset=None):
    """Honor explicit encodings, never substitute replacement characters."""
    if data.startswith(b'\xef\xbb\xbf'):
        charset = 'utf-8-sig'
    elif data.startswith((b'\xff\xfe', b'\xfe\xff')):
        charset = 'utf-16'
    elif header_charset:
        charset = header_charset
    else:
        parser = EncodingParser()
        # HTML encoding declarations must occur near the start of the document.
        parser.feed(bytes(data[:1024]).decode('ascii', errors='ignore'))
        charset = parser.charset or 'utf-8'
    try:
        return data.decode(charset)
    except (LookupError, UnicodeError) as e:
        raise FetchError('Page encoding could not be decoded losslessly. Try saved UTF-8 HTML.') from e


def public_ip(address):
    ip = ipaddress.ip_address(address.split('%')[0])
    return (ip.is_global and not ip.is_multicast and not ip.is_reserved
            and not ip.is_loopback and not ip.is_link_local
            and not (isinstance(ip, ipaddress.IPv6Address) and (ip.ipv4_mapped or ip.sixtofour or ip.teredo
                     or any(ip in prefix for prefix in TRANSLATION_PREFIXES))))


def validate_url(url):
    if not isinstance(url, str) or len(url) > 4096 or any(ord(c) <= 32 or ord(c) == 127 for c in url) or '\\' in url:
        raise FetchError('Enter a valid public HTTP or HTTPS URL.')
    try:
        p = urlsplit(url)
        if p.scheme not in ('http', 'https') or not p.hostname or p.username is not None or p.password is not None:
            raise FetchError('Only public HTTP/HTTPS URLs without credentials are supported.')
        host = p.hostname.encode('idna').decode('ascii').lower().rstrip('.')
        port = p.port if p.port is not None else (443 if p.scheme == 'https' else 80)
        if port != (443 if p.scheme == 'https' else 80):
            raise FetchError('Only the standard HTTP and HTTPS ports are supported.')
        if '%' in host or host == 'localhost' or host.endswith(('.localhost', '.local', '.internal')):
            raise FetchError('Local network addresses are not allowed.')
        authority = f'[{host}]' if ':' in host else host
        # Encode international paths without double-encoding existing escapes.
        path = quote(p.path or '/', safe="/%:@!$&'()*+,;=-._~")
        query = quote(p.query, safe="/?%:@!$&'()*+,;=-._~")
        return urlunsplit((p.scheme, authority, path, query, '')), host, port
    except (ValueError, UnicodeError) as e:
        raise FetchError(str(e)) from e


def resolve_public(host, port):
    future = DNS_POOL.submit(socket.getaddrinfo, host, port, 0, socket.SOCK_STREAM)
    try:
        records = future.result(timeout=TIMEOUT)
    except (OSError, concurrent.futures.TimeoutError) as e:
        future.cancel()
        raise FetchError('Could not resolve the website. Check internet access or paste saved HTML.') from e
    addresses = list(dict.fromkeys(record[4][0] for record in records))
    if not addresses or any(not public_ip(ip) for ip in addresses):
        raise FetchError('URL resolves to a private, reserved, or non-public address.')
    return addresses


class PinnedConnection(http.client.HTTPConnection):
    def __init__(self, host, port, addresses, secure, deadline):
        self.default_port = 443 if secure else 80
        super().__init__(host, port, timeout=TIMEOUT)
        self.addresses, self.secure, self.deadline = addresses, secure, deadline

    def connect(self):
        # Connect to the validated numeric IP; never resolve the hostname again.
        for address in self.addresses:
            remaining = self.deadline - time.monotonic()
            if remaining <= 0:
                raise TimeoutError('Website connection timed out.')
            try:
                self.sock = socket.create_connection((address, self.port), min(self.timeout, remaining))
                break
            except OSError:
                if address == self.addresses[-1]:
                    raise
        if self.secure:
            try:
                context = ssl.create_default_context()
                # Match stdlib HTTPSConnection's HTTP/1.1 TLS negotiation.
                context.set_alpn_protocols(['http/1.1'])
                if context.post_handshake_auth is not None:
                    context.post_handshake_auth = True
                self.sock = context.wrap_socket(self.sock, server_hostname=self.host)
            except Exception:
                self.sock.close()
                raise


def fetch_public(url, *, image=False):
    limit = 4_000_000 if image else MAX_BYTES
    start = time.monotonic()
    visited = []
    for redirect in range(MAX_REDIRECTS + 1):
        url, host, port = validate_url(url)
        if url in visited:
            raise FetchError('Website has a redirect loop.')
        visited.append(url)
        addresses = resolve_public(host, port)
        p = urlsplit(url)
        connection = PinnedConnection(host, port, addresses, p.scheme == 'https', start + 30)
        try:
            connection.request('GET', urlunsplit(('', '', p.path, p.query, '')), headers={
                'User-Agent': 'MiseRecipePlanner/1.0',
                'Accept': 'image/jpeg,image/png,image/webp' if image else 'text/html,application/xhtml+xml',
                'Accept-Encoding': 'gzip' if not image else 'identity', 'Connection': 'close'})
            response = connection.getresponse()
            if response.status in (301, 302, 303, 307, 308):
                location = response.getheader('Location')
                if not location or redirect == MAX_REDIRECTS:
                    raise FetchError('Too many redirects or missing redirect destination.')
                target = urljoin(url, location)
                if p.scheme == 'https' and urlsplit(target).scheme != 'https':
                    raise FetchError('Refused an HTTPS-to-HTTP downgrade.')
                url = target
                continue
            if response.status != 200:
                raise FetchError(f'The website returned HTTP {response.status}. Try its printable recipe link or import saved HTML.')
            content_type = response.headers.get_content_type()
            allowed = ('image/jpeg', 'image/png', 'image/webp') if image else ('text/html', 'application/xhtml+xml')
            if content_type not in allowed:
                raise FetchError('The website did not return a supported photo.' if image else 'The website did not return a recipe page.')
            encoding = response.getheader('Content-Encoding', 'identity').lower().strip()
            if encoding not in ('identity', '', 'gzip'):
                raise FetchError('Unsupported website encoding. Try importing saved HTML.')
            length = response.getheader('Content-Length')
            if length and (not length.isdigit() or int(length) > limit):
                raise FetchError('This download exceeds the import size limit.')
            data = bytearray()
            while True:
                if time.monotonic() - start > 30:
                    raise FetchError('Recipe download exceeded the time limit.')
                chunk = response.read1(min(65536, limit + 1 - len(data)))
                if not chunk:
                    break
                data.extend(chunk)
                if len(data) > limit:
                    raise FetchError('This download exceeds the import size limit.')
            if length and len(data) != int(length):
                raise FetchError('Website sent an incomplete HTML page. Try again or use saved HTML.')
            if encoding == 'gzip':
                decoder = zlib.decompressobj(16 + zlib.MAX_WBITS)
                data = decoder.decompress(data, limit + 1)
                if len(data) > limit or not decoder.eof or decoder.unused_data:
                    raise FetchError('Compressed download is incomplete or exceeds the size limit.')
            if image:
                return bytes(data), content_type
            return decode_html(data, response.headers.get_content_charset()), url
        except (OSError, http.client.HTTPException, zlib.error) as e:
            raise FetchError('Could not download this page securely. Check internet access or paste saved HTML.') from e
        finally:
            connection.close()
    raise FetchError('Too many redirects.')
