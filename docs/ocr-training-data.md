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

### Promote an approved pair

Place the files under `training/ocr/ground-truth/`:

```text
training/ocr/ground-truth/mtg-0001.png
training/ocr/ground-truth/mtg-0001.gt.txt
```

Then add the pair to `training/ocr/manifest.json` with exact hashes:

```json
{
    "id": "mtg-0001",
    "image": "ground-truth/mtg-0001.png",
    "transcription": "ground-truth/mtg-0001.gt.txt",
    "imageSha256": "<64 lowercase hex characters>",
    "transcriptionSha256": "<64 lowercase hex characters>",
    "reviewed": true,
    "source": {
        "kind": "card-image",
        "reference": "capture-batch-2026-08/card-0001",
        "license": "owned-capture"
    }
}
```

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

## Promotion path

Training completion is not promotion. Package the selected checkpoint as `eng.traineddata`, add it
to a reviewed OCR candidate manifest with exact provenance and SHA-256, run the full regression
corpus, and compare it to the bundled control with `pnpm regression:compare`. A candidate with any
blocking regression does not replace the production model, even if aggregate accuracy improves.
