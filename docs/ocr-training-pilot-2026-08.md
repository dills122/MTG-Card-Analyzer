<!-- markdownlint-disable MD013 MD043 -->

# OCR training pilot: August 2026

## Decision

Do not promote any candidate from the first two corpus batches. Every candidate introduced blocking
regressions against the bundled English control. Expand frame diversity before another tuning
experiment.

## Inputs

- Base: pinned official `tessdata_best` English model.
- Batch 001 corpus: five reviewed name-line crops; deterministic split of four train and one
  evaluation line.
- Batch 002 corpus: 22 reviewed name-line crops; deterministic split of 19 train and three
  evaluation lines.
- Seed: `20260808`.
- Runtime: pinned offline `tesstrain` container, 4 CPUs, 4 GB memory.
- Candidates: batch 001 at 100 and 500 iterations; batch 002 at 25 and 100 iterations.

The Attunement sample was approved with concern and retains that provenance in the training-data
manifest. Meletis Charlatan and Mindstab Thrull were rejected and excluded.

## Regression results

All models ran through the same 125-case offline regression corpus.

| Model                   |   Total | Blocking | Non-blocking failures | Decision |
| ----------------------- | ------: | -------: | --------------------: | -------- |
| Bundled control         | 124/125 |  118/118 |                   1/7 | Control  |
| 100-iteration candidate | 121/125 |  117/118 |                   3/7 | Reject   |
| 500-iteration candidate | 121/125 |  116/118 |                   2/7 | Reject   |

Batch 002 added 17 approved M10/M15 samples and excluded three rejected crops. Four positive quality
notes remain attached as ordinary approvals rather than concerns.

| Batch 002 model         |   Total | Blocking | Non-blocking failures | Decision |
| ----------------------- | ------: | -------: | --------------------: | -------- |
| 25-iteration candidate  | 122/125 |  117/118 |                   2/7 | Reject   |
| 100-iteration candidate | 122/125 |  117/118 |                   2/7 | Reject   |

The 100-iteration candidate regressed `Yavimaya Coast` plus two disabled vintage fixtures. The
500-iteration candidate regressed `War Room`, `Yavimaya Coast`, and one disabled vintage fixture.
Neither candidate improved a fixture that failed under the control.

Both batch 002 candidates regressed disabled `Illumination` and blocking `Yavimaya Coast`, with no
fixture improvements. Reducing the iteration count from 100 to 25 did not change the pass set. The
candidates were about 10 MB smaller and had lower measured runtime, but runtime and size do not
override the zero-blocking-regression promotion gate.

## Next corpus batch

The repeated failures identify a narrower data gap: the corpus needs reviewed vintage-frame and
modern full-art title examples acquired separately from the enabled regression fixtures. Keep the
M10/M15 normal-frame lines, add those missing frame families, then rerun a short bounded checkpoint.
All 118 blocking fixtures must pass before considering longer training.

## Later production model migration

On 2026-08-09, a separate stock-model bakeoff replaced the original Pre-4.0 legacy-only production
archive with the pinned official `tessdata_best` English LSTM model. That model passed all 118
blocking fixtures and 123 of 125 fixtures overall. It did not come from the 22-line custom corpus,
so this migration does not change the rejection decision above: the reviewed corpus remains ready
for a future, more diverse fine-tuning experiment and no custom checkpoint has been promoted.
