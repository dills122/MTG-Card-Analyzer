# OCR training pilot: August 2026

## Decision

Do not promote either initial fine-tuned candidate. Both candidates introduced blocking regressions
against the bundled English control. Expand the reviewed corpus before another tuning experiment.

## Inputs

- Base: pinned official `tessdata_best` English model.
- Corpus: five reviewed name-line crops; deterministic split of four train and one evaluation line.
- Seed: `20260808`.
- Runtime: pinned offline `tesstrain` container, 4 CPUs, 4 GB memory.
- Candidates: 500 iterations and a less-aggressive 100-iteration checkpoint experiment.

The Attunement sample was approved with concern and retains that provenance in the training-data
manifest. Meletis Charlatan and Mindstab Thrull were rejected and excluded.

## Regression results

All models ran through the same 125-case offline regression corpus.

| Model                   |   Total | Blocking | Non-blocking failures | Decision |
| ----------------------- | ------: | -------: | --------------------: | -------- |
| Bundled control         | 124/125 |  118/118 |                   1/7 | Control  |
| 100-iteration candidate | 121/125 |  117/118 |                   3/7 | Reject   |
| 500-iteration candidate | 121/125 |  116/118 |                   2/7 | Reject   |

The 100-iteration candidate regressed `Yavimaya Coast` plus two disabled vintage fixtures. The
500-iteration candidate regressed `War Room`, `Yavimaya Coast`, and one disabled vintage fixture.
Neither candidate improved a fixture that failed under the control.

The candidates were about 10 MB smaller and had lower measured runtime, but runtime and size do not
override the zero-blocking-regression promotion gate.

## Next corpus batch

Batch 002 contains 20 disabled, unreviewed M10/M15 source fixtures selected with seed `20260809`.
The pool covers eight color categories, seven card types, and four rarities while keeping one normal
layout/style. This targets title-bar and character breadth without introducing split, textless, or
alternate-frame noise. Its generated review sheet remains under the ignored
`artifacts/training-review/batch-002/` directory.

Only explicitly approved crops may be promoted. After promotion, rerun a short bounded checkpoint
experiment first and require all 118 blocking fixtures to pass before considering longer training.
