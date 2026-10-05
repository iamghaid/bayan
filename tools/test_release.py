"""Release regressions: preserve the project target and held motion decisions."""
import json
import unittest
from pathlib import Path
from unittest.mock import patch

from deploy_release import verify_project
from prepare_interface_release import release_catalog


class ReleaseTests(unittest.TestCase):
    def test_held_and_invalid_motions_are_excluded(self):
        rows = [
            {'id': 1, 'frames': 10, 'schema_errors': []},
            {'id': 2, 'frames': 10, 'technical_preflight': 'hold_contact_review'},
            {'id': 3, 'frames': 0},
            {'id': 4, 'frames': 10, 'schema_errors': ['invalid_frame_schema']},
        ]
        self.assertEqual([row['id'] for row in release_catalog(rows)], [1])

    def test_correct_project_is_accepted(self):
        expected = {'projectId': 'selected-project', 'orgId': 'selected-team'}
        with patch.object(Path, 'is_file', return_value=True), \
                patch.object(Path, 'read_text', return_value=json.dumps(expected)):
            verify_project(Path('release'), expected)

    def test_other_project_is_rejected(self):
        other = {'projectId': 'other', 'orgId': 'selected-team'}
        with patch.object(Path, 'is_file', return_value=True), \
                patch.object(Path, 'read_text', return_value=json.dumps(other)):
            with self.assertRaisesRegex(ValueError, 'different Vercel project'):
                verify_project(Path('release'), {'projectId': 'selected', 'orgId': 'selected-team'})

    def test_unlinked_output_is_rejected(self):
        with patch.object(Path, 'is_file', return_value=False):
            with self.assertRaisesRegex(ValueError, 'Link the prepared output'):
                verify_project(Path('release'), {'projectId': 'selected', 'orgId': 'team'})


if __name__ == '__main__':
    unittest.main()
