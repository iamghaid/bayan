# Four-pass avatar review — 2026-10-05

No new motion batch was added during this review. No linguistic approvals were issued.

## Motion 589: preliminary visual rejection

Actual Saudi GLB rendered locally, sampled at eight timestamps over 5.68 seconds using tools/avatarcheck.html?motion=589&staged=1&sheet=1. This diagnostic run did not enable the review-page position guard. Source footage was not compared in this pass.

1. Joints: issue. Around 0.80 s the raised hand/wrist appears sharply bent and unnatural. Temporal smoothness does not resolve the pose.
2. Clarity: issue. Around 2.42–4.03 s overlapping hands obscure individual finger shapes in the frontal view.
3. Source fidelity: pending. No claim that these poses represent the correct sign. Review the original reference and linguistic context before changing handshapes or intentional contact.
4. Depth: pending full geometry review. The eight frontal samples do not visibly place a hand behind the back, but cannot exclude hidden intersections between samples. Mid-motion finger overlap needs closer inspection; an intentional contact must not be removed blindly.

Numeric wrist check: finite quaternions, zero steps exceeding 25 degrees, maximum step 11.26 degrees. This passed technical threshold coexists with visible defects. It is not a quality approval.

The review UI now stores four independent statuses with each note and the motion hash. Existing notes remain compatible. All unreviewed passes default to pending. This review covers one sampled clip, not the entire 2,145-motion union.
