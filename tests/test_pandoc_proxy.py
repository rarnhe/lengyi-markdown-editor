"""Stdlib-only regression tests for optional Pandoc endpoints. No npm/pip."""
import base64
import http.client
import importlib.util
import json
import os
import shutil
import struct
import threading
import unittest
import zipfile
import zlib
from http.server import HTTPServer
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('lengyi_proxy', ROOT / 'web-to-md-proxy.py')
proxy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(proxy)


class PandocProxyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = HTTPServer(('127.0.0.1', 0), proxy.Handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=3)

    def request(self, method, endpoint, payload=None, headers=None):
        conn = http.client.HTTPConnection('127.0.0.1', self.server.server_port, timeout=10)
        all_headers = {
            'Host': '127.0.0.1:' + str(proxy.PORT),
            'Origin': 'null'
        }
        if headers:
            all_headers.update(headers)
        body = json.dumps(payload).encode('utf-8') if payload is not None else None
        if body is not None:
            all_headers['Content-Type'] = 'application/json'
        try:
            conn.request(method, endpoint, body=body, headers=all_headers)
            response = conn.getresponse()
            data = response.read()
            return response.status, dict(response.getheaders()), data
        finally:
            conn.close()

    def test_status_hidden_when_pandoc_missing(self):
        with patch.object(proxy, 'pandoc_binary', return_value=None):
            status, headers, raw = self.request('GET', '/pandoc/status')
        self.assertEqual(status, 200)
        self.assertEqual(headers.get('Access-Control-Allow-Origin'), 'null')
        data = json.loads(raw)
        self.assertFalse(data['available'])
        self.assertIsNone(data['token'])

    def test_status_returns_token_only_when_executable(self):
        with patch.object(proxy, 'pandoc_binary', return_value='/usr/bin/pandoc'):
            status, _, raw = self.request('GET', '/pandoc/status')
        self.assertEqual(status, 200)
        result = json.loads(raw)
        self.assertTrue(result['available'])
        self.assertEqual(result['token'], proxy.PANDOC_TOKEN)

    def test_untrusted_origin_and_rebinding_host_rejected(self):
        for headers in [
            {'Origin': 'https://untrusted.example'},
            {'Host': 'attacker.example:' + str(proxy.PORT)}
        ]:
            status, _, _ = self.request('GET', '/pandoc/status', headers=headers)
            self.assertEqual(status, 403)
            status, _, _ = self.request(
                'POST', '/pandoc/export', {'markdown': '# Test'},
                headers={**headers, 'X-Lengyi-Token': proxy.PANDOC_TOKEN}
            )
            self.assertEqual(status, 403)

    def test_bad_token_malformed_payload_and_size_rejected(self):
        status, _, _ = self.request('POST', '/pandoc/export', {'markdown': '# a'})
        self.assertEqual(status, 403)
        with patch.object(proxy, 'pandoc_binary', return_value='/usr/bin/pandoc'):
            status, _, _ = self.request('POST', '/pandoc/export', {'wrong': 1}, {
                'X-Lengyi-Token': proxy.PANDOC_TOKEN
            })
        self.assertEqual(status, 400)
        status, _, _ = self.request('POST', '/pandoc/export', {'markdown': ''}, {
            'X-Lengyi-Token': proxy.PANDOC_TOKEN, 'Content-Type': 'text/plain'
        })
        self.assertEqual(status, 415)

    def test_preflight_and_docx_response(self):
        status, headers, _ = self.request('OPTIONS', '/pandoc/export', None, {
            'Access-Control-Request-Private-Network': 'true'
        })
        self.assertEqual(status, 204)
        self.assertEqual(headers.get('Access-Control-Allow-Private-Network'), 'true')
        self.assertIn('X-Lengyi-Token', headers.get('Access-Control-Allow-Headers', ''))
        with patch.object(proxy, 'pandoc_binary', return_value='/usr/bin/pandoc'), \
             patch.object(proxy, 'pandoc_to_docx', return_value=b'PK\x03\x04DOCX') as convert:
            status, headers, result = self.request(
                'POST', '/pandoc/export', {'markdown': '# Hello'}, {
                    'X-Lengyi-Token': proxy.PANDOC_TOKEN
                }
            )
        self.assertEqual(status, 200)
        self.assertIn('wordprocessingml.document', headers['Content-Type'])
        self.assertEqual(result, b'PK\x03\x04DOCX')
        convert.assert_called_once_with('# Hello', '/usr/bin/pandoc')

    def test_original_fetch_endpoint_untouched(self):
        with patch.object(proxy, 'fetch_url', return_value='<html>Hello</html>'):
            status, headers, raw = self.request(
                'GET', '/fetch?url=https%3A%2F%2Fexample.com'
            )
        self.assertEqual(status, 200)
        self.assertEqual(headers['Access-Control-Allow-Origin'], '*')
        self.assertTrue(json.loads(raw)['success'])

    def test_real_pandoc_embeds_base64_png_in_docx(self):
        executable = proxy.pandoc_binary()
        if not executable:
            self.skipTest('pandoc is not installed on this test runner')
        width, height = 5, 3
        pixels = b''.join(b'\0' + (b'\xff\0\0' * width) for _ in range(height))
        def chunk(name, data):
            return (struct.pack('>I', len(data)) + name + data +
                    struct.pack('>I', zlib.crc32(name + data) & 0xffffffff))
        png = (b'\x89PNG\r\n\x1a\n' +
               chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0)) +
               chunk(b'IDAT', zlib.compress(pixels)) + chunk(b'IEND', b''))
        markdown = '# Picture\n\n![red](data:image/png;base64,' + base64.b64encode(png).decode() + ')'
        output = proxy.pandoc_to_docx(markdown, executable)
        import io
        with zipfile.ZipFile(io.BytesIO(output)) as archive:
            media = [x for x in archive.namelist() if x.startswith('word/media/')]
            self.assertTrue(media, 'Base64 image must be embedded in DOCX')
            self.assertEqual(archive.read(media[0]), png)


if __name__ == '__main__':
    unittest.main()
