import unittest

from staging_audit import check_motion


class StagingAuditTests(unittest.TestCase):
    def test_valid_schema_is_not_linguistic_approval(self):
        motion = {'id': 1, 'fps': 15, 'asp': 1, 'fr': [[[0]*27, [0]*4, [0]*63, 0, 0]]}
        result = check_motion(motion, 1)
        self.assertEqual(result['schema_errors'], [])
        self.assertEqual(result['tracked_ratio'], 1)
        self.assertNotIn('approved', result)

    def test_invalid_hand_size_detected(self):
        motion = {'id': 1, 'fps': 15, 'asp': 1, 'fr': [[[0]*27, [0]*4, [0]*62, 0, 0]]}
        self.assertIn('invalid_frame_schema', check_motion(motion, 1)['schema_errors'])

    def test_missing_frames_and_invalid_fps(self):
        errors = check_motion({'id': 2, 'fps': 0, 'asp': 0, 'fr': []}, 1)['schema_errors']
        self.assertEqual(set(errors), {'id_mismatch', 'invalid_fps', 'invalid_aspect', 'no_frames'})


if __name__ == '__main__':
    unittest.main()
