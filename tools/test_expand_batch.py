import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import expand_batch as batch


class BatchTests(unittest.TestCase):
    def test_metadata_mismatch_prevents_download(self):
        with patch.object(batch.extract, 'download') as download:
            result = batch.work({'id': 1, 'ar': 'خطأ'}, {1: {'wordAr': 'صحيح', 'video': 'reference.mp4'}})
            self.assertEqual(result['status'], 'source_metadata_mismatch')
            download.assert_not_called()

    def test_missing_hands_not_added(self):
        with patch.object(batch.extract, 'download', return_value=Path('local.mp4')), patch.object(batch.extract, 'extract', return_value=({'fr': [None] * 10}, 2)):
            result = batch.work({'id': 1, 'ar': 'مرجع'}, {1: {'wordAr': 'مرجع', 'video': 'reference.mp4'}})
            self.assertEqual(result['status'], 'technical_check_failed')

    def test_good_extraction_stays_unreviewed_in_staging(self):
        with patch.object(batch, 'STAGE', Path('staging-test')), patch.object(Path, 'write_text') as write, patch.object(batch.extract, 'download', return_value=Path('local.mp4')), patch.object(batch.extract, 'extract', return_value=({'fr': [[1]] * 10, 'fps': 15}, 10)):
            result = batch.work({'id': 1, 'ar': 'مرجع'}, {1: {'wordAr': 'مرجع', 'video': 'reference.mp4'}})
            self.assertEqual(result['review_status'], 'not_reviewed')
            write.assert_called_once()
            self.assertEqual(result['status'], 'staged_needs_visual_and_linguistic_review')


if __name__ == '__main__':
    unittest.main()
