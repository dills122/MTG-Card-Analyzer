<!-- markdownlint-disable MD013 -->

# OCR training data

The custom OCR corpus is review-first. The repository currently contains a pinned, empty draft at
`training/ocr/manifest.json`; it defines the base model and validation contract without pretending
that unreviewed samples are ready to train.

Tesseract's supported `tesstrain` workflow consumes single-line PNG or TIFF images paired with a
plain-text transcription whose filename replaces the image extension with `.gt.txt`. Its training
Makefile supports a fixed random seed and train/evaluation ratio, and `START_MODEL` selects the model
to fine-tune. See the official [`tesstrain` README](https://github.com/tesseract-ocr/tesstrain) and
[Tesseract training guide](https://tesseract-ocr.github.io/tessdoc/).

## Corpus rules

- Add a tightly cropped, single-line card-name image, not a full card or multi-line text block.
- Use `.png` or `.tif`; pair `sample.png` with `sample.gt.txt`.
- Store exactly one non-empty UTF-8/NFC transcription line. One final newline is allowed; leading,
  trailing, embedded newline, and control characters are rejected.
- Record SHA-256 for both files. The validator fails on changed bytes instead of silently accepting a
  relabeled or regenerated sample.
- Record whether the source is a real card image or synthetic, a stable source reference, and its
  license. Set `reviewed: true` only after a human checks the crop and exact transcription.
- Do not derive training samples from enabled regression fixtures. Those fixtures are the acceptance
  gate; training on them would hide overfitting. Acquire separate captures or use a reviewed,
  training-only source pool.
- Keep generated checkpoints, downloaded upstream repositories, and local training output outside
  the committed corpus. Only reviewed line pairs, their manifest, and an intentionally selected final
  candidate belong in Git.

The manifest pins `tessdata_best` revision
`e12c65a915945e4c28e237a9b52bc4a8f39a0cec` as the float fine-tuning base. `tessdata_fast` is an
integer runtime model and is not a valid fine-tuning base according to Tesseract's training guidance.

## Add a reviewed pair

### Stage a local review batch

The staging command can crop the production `name-core` region from disabled regression candidates.
It refuses enabled fixtures, placeholder labels, compound card names without face-specific ground
truth, duplicate IDs, oversized batches, and an existing batch directory. Output stays under the
ignored `artifacts/training-review/` directory and every sample remains `reviewed: false`.

```bash
pnpm training:review:stage \
    --batch batch-001 \
    --case fin-569-choco-seeker-of-paradise-1ce688fa-scryfall \
    --case fin-585-laughing-mad-9268ccdb-scryfall
```

The review manifest records hashes, source fixture IDs, the crop region, and the rights/provenance
basis. Staging does not grant or assert ownership of card imagery. The default note references
Wizards' [Fan Content Policy](https://company.wizards.com/en/legal/fancontentpolicy) and labels the
output as unofficial, noncommercial, review-only local material. Do not commit or promote a crop
until its use, transcription, and visual quality are explicitly reviewed.

### Promote a reviewed batch

Promote a staged batch only after explicitly classifying every sample. `--approve-note` preserves a
positive quality note while keeping the decision as approved. `--concern` is an approval that marks
the decision as approved-with-concern. Both require notes that remain attached to the sample in the
committed manifest. Rejected samples stay in the ignored review batch and are never copied into the
corpus.

```bash
pnpm training:review:promote \
    --batch-dir artifacts/training-review/batch-001 \
    --approve mtg-0001-pending \
    --approve-note "mtg-0002-pending=Excellent clean title crop" \
    --concern "mtg-0003-pending=Crop is usable but should be replaced later" \
    --reject mtg-0004-pending
```

The command rechecks staged hashes, rejects missing, duplicate, overlapping, or unknown decisions,
copies approved image/transcription pairs under `training/ocr/ground-truth/`, and atomically updates
`training/ocr/manifest.json`. If validation or readiness fails, it rolls back copied files and leaves
the manifest unchanged. The fixed ratio must still produce at least one training and one evaluation
line from the approved set.

Validate structure, paths, file sizes, hashes, encoding, transcription shape, provenance, and the
pinned base model:

```bash
pnpm training:data:check
```

The draft may contain zero samples while the source pool is being assembled. Before training, set
the manifest status to `reviewed` and run the readiness gate:

```bash
pnpm training:data:check --require-ready
```

The readiness gate requires every sample to be reviewed and the fixed `trainRatio` to produce at
least one training and one evaluation line. The current seed is `20260808` and the ratio is `0.9`;
these values must be passed unchanged to `tesstrain` so repeated list generation is deterministic.

## Fine-tune a candidate

Training runs in a pinned Linux container because the official `tesstrain` workflow requires GNU
Make 4.2 or newer and Tesseract 5.3 or newer. The container pins its Ubuntu base digest, official
`tesstrain` revision, `langdata_lstm` revision, and `tessdata_best` English model hash. Network
access is available only while building that image. The training container itself runs offline,
read-only, without Linux capabilities, and with explicit CPU, memory, process, and temporary-file
limits.

Build the image once:

```bash
pnpm training:image:build
```

Inspect the exact command without creating a run directory:

```bash
pnpm training:run --run mtg-001 --dry-run
```

Start fine-tuning after the readiness gate passes:

```bash
pnpm training:run \
    --run mtg-001 \
    --max-iterations 10000 \
    --cpus 4 \
    --memory-gb 4
```

Pass `--build-image` to rebuild the pinned image first. Run IDs are unique and output directories
are never overwritten. Each run copies only manifest-listed ground-truth pairs into
`artifacts/training-runs/<run>/ground-truth/`, records exact sample hashes and hyperparameters in
`training-plan.json`, and preserves checkpoints and logs on failure. A successful run packages the
final float model as `candidate/eng.traineddata` beside a regression candidate manifest. These
generated artifacts remain ignored until a candidate is explicitly reviewed and selected.

The implementation follows the official [`tesstrain` requirements and Makefile variables](https://github.com/tesseract-ocr/tesstrain#usage),
including `START_MODEL`, `MAX_ITERATIONS`, `RANDOM_SEED`, `RATIO_TRAIN`, and `PSM`. Tesseract's
official [training guide](https://tesseract-ocr.github.io/tessdoc/tess5/TrainingTesseract-5.html)
describes fine-tuning as the appropriate small-domain adaptation path and warns that training from
scratch without a representative corpus is likely to overfit.

The first bounded real-training experiment and its rejection evidence are recorded in
[`ocr-training-pilot-2026-08.md`](./ocr-training-pilot-2026-08.md).

## Promotion path

Training completion is not promotion. Package the selected checkpoint as `eng.traineddata`, add it
to a reviewed OCR candidate manifest with exact provenance and SHA-256, run the full regression
corpus, and compare it to the bundled control with `pnpm regression:compare`. A candidate with any
blocking regression does not replace the production model, even if aggregate accuracy improves.
