import json
import threading
import unittest
import urllib.error
import urllib.request
import shutil
import uuid
from pathlib import Path
from unittest.mock import patch
from functools import partial
from http.server import ThreadingHTTPServer

import motion_review_server as review


class ReviewServerTests(unittest.TestCase):
    def setUp(self):
        # Synthetic bytes test HTTP ranges without depending on local source footage.
        workspace_tmp = Path(__file__).resolve().parents[1] / 'output' / 'test-fixtures'
        workspace_tmp.mkdir(parents=True, exist_ok=True)
        root = (workspace_tmp / ('review-' + uuid.uuid4().hex)).resolve()
        self.assertEqual(root.parent, workspace_tmp.resolve())
        root.mkdir()
        self.addCleanup(shutil.rmtree, root)
        (root / 'sshi_motion/src').mkdir(parents=True)
        (root / 'sshi_motion/src/1.mp4').write_bytes(b'x' * 64)
        catalog = root / 'catalog.json'
        catalog.write_text(json.dumps([{'id':1,'reference_present':True,'schema_errors':[]}, {'id':2,'reference_present':False,'schema_errors':['no_frames']}]), encoding='utf-8')
        self.root_patch = patch.object(review, 'ROOT', root)
        self.catalog_patch = patch.object(review, 'CATALOG', catalog)
        self.root_patch.start()
        self.catalog_patch.start()
        self.addCleanup(self.root_patch.stop)
        self.addCleanup(self.catalog_patch.stop)

    def test_catalog_reference_ranges_and_private_paths(self):
        server = ThreadingHTTPServer(('127.0.0.1', 0), partial(review.Handler, directory=str(review.ROOT)))
        worker = threading.Thread(target=server.serve_forever, daemon=True)
        worker.start()
        base = f'http://127.0.0.1:{server.server_port}'
        try:
            with urllib.request.urlopen(base + '/api/catalog') as response:
                items = json.load(response)
            expected = json.loads(review.CATALOG.read_text(encoding='utf-8'))
            self.assertEqual(items, expected)
            self.assertEqual(len(items), 2)
            self.assertEqual(len({item['id'] for item in items}), len(items))
            # Failed extractions remain in the audit catalog, ahead of valid rows.
            playable = [item for item in items if item['reference_present'] and not item['schema_errors']]
            self.assertTrue(playable)
            ident = playable[0]['id']
            request = urllib.request.Request(base + f'/reference/{ident}.mp4', headers={'Range':'bytes=0-31'})
            with urllib.request.urlopen(request) as response:
                self.assertEqual(response.status, 206)
                self.assertEqual(len(response.read()), 32)
            for item in items:
                if not item['reference_present']:
                    with self.assertRaises(urllib.error.HTTPError) as error:
                        urllib.request.urlopen(base + f"/reference/{item['id']}.mp4")
                    self.assertEqual(error.exception.code, 404)
                    error.exception.close()
            for path in ['/tools/.gemini_key', '/sshi_motion/src/197.mp4', '/coverage/expansion/staging_qa.json', '/reference/9999999.mp4', '/%2e%2e/tools/approved.json']:
                with self.assertRaises(urllib.error.HTTPError) as error:
                    urllib.request.urlopen(base + path)
                self.assertEqual(error.exception.code, 404)
                error.exception.close()
        finally:
            server.shutdown()
            server.server_close()
            worker.join()


if __name__ == '__main__':
    unittest.main()
