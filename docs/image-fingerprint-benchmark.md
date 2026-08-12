# Image fingerprint mode benchmark

This benchmark compares the hashing modes available in `image-fingerprint@0.1.1` against the
project's reviewed local card corpus. It is intended to choose a production default for card-print
ranking, not to make a universal claim about perceptual-hash quality.

## Run it

```bash
pnpm benchmark:fingerprints
```

The command is offline and deterministic apart from runtime measurements. It uses the enabled
catalog in `test/regression/fixtures/manifest.json`, writes transformed images only to a temporary
directory, removes that directory on success or failure, and prints a JSON report.

## Method

The 2026-08-11 run used 151 enabled reference prints. A deterministic 34-print sample was tested
with eight queries per print: exact, good-photo, average-photo, poor-lighting, blur, rotation,
cropping, and low-resolution. Each of the 272 resulting full-card queries ranked against all 151
reference prints. This is stricter than production, where OCR first limits candidates to printings
of one card name.

The manifest currently contains only two names with multiple enabled printings: `Unsummon` and
`Island`. Their four source prints produced 32 set-symbol queries across the same eight variants,
ranked only against the other printing of the same name. The small set-symbol cohort is useful
directional evidence, but it is not large enough to support fine threshold tuning.

All modes used 256-bit fingerprints:

- Blockhash v1, 16 bits per side, precise method, historical `image-hash@7` decoding
- Blockhash v1, 16 bits per side, precise method, normalized decoding
- PDQ v1 with normalized decoding

## Results

| Mode                          |    Full-card top 1 | Full-card mean margin | Set-symbol top 1 | Set-symbol mean margin |
| ----------------------------- | -----------------: | --------------------: | ---------------: | ---------------------: |
| Blockhash, historical decoder |   270/272 (99.26%) |                0.1534 |   30/32 (93.75%) |             **0.3340** |
| Blockhash, normalized decoder |   270/272 (99.26%) |                0.1534 |   30/32 (93.75%) |             **0.3340** |
| **PDQ, normalized decoder**   | **272/272 (100%)** |            **0.2702** |   30/32 (93.75%) |                 0.3235 |

PDQ recovered both poor-lighting full-card cases that tied under Blockhash and increased the mean
gap between the correct print and the closest wrong print by 76%. It tied both Blockhash modes on
set-symbol top-1 accuracy. Blockhash's set-symbol margin was 0.0105 higher, but that result covers
only four source prints and all modes missed two cropped-symbol queries.

The three passes took 109.6, 108.6, and 112.1 seconds respectively on the test machine. Those
end-to-end timings include Jimp transformation and temporary PNG work and should not be read as an
isolated algorithm microbenchmark.

## Decision

Use normalized PDQ v1 as the production default. Store the full versioned fingerprint record and
compare it using Hamming distance plus the package's explicit starting policy (`maxDistance: 31`,
`minQuality: 50`). When no candidate satisfies that conservative policy, the existing bounded
closest-candidate fallback may still rank comparable PDQ records.

Legacy raw Blockhash values are recognized as historical records but are intentionally
non-comparable with PDQ. A scan that encounters only legacy cache rows falls through to the remote
comparison path and stores fresh PDQ records; no destructive cache migration is required.

## Limits and next evidence

The synthetic variants measure controlled robustness, not arbitrary handheld framing or
perspective distortion. The package's own MTG calibration likewise warns that unrectified camera
frames are not reliable standalone PDQ inputs. Keep the application's crop and normalization path,
and repeat this benchmark after adding real captures or additional names with multiple reviewed
print references. Do not weaken regression expectations to accommodate a hash-mode change.
