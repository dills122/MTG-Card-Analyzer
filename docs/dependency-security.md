# Production dependency security

This note records the release-readiness remediation for the production dependency audit run on
2026-08-09. It is evidence for dependency choices and input controls, not an advisory ignore list.

## Audit baseline and disposition

The baseline `pnpm audit --prod` reported nine advisories: six high, two moderate, and one low.
The remediated lockfile reports no known production vulnerabilities.

| Dependency path                                                      | Runtime reachability                                                                                                                                                                 | Disposition                                                                                                                                                                                                             |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Direct `image-size` ICNS/JXL/HEIF parsers                            | Reachable from the untrusted local path supplied to `scan`, before OCR                                                                                                               | Removed. `src/image-processing/util.mjs` now recognizes only JPEG, PNG, GIF, and BMP with bounded parsers whose loops advance monotonically over a capped buffer. Unsupported signatures are rejected before Jimp runs. |
| `tesseract.js > babel-eslint > eslint > ... > flatted`               | Not reachable from OCR. `src/image-analysis/extract-text.mjs` imports the Tesseract worker API; it never imports or invokes Babel ESLint, ESLint caches, `flat-cache`, or `flatted`. | The regression-qualified Tesseract 3.0.3 engine/model pair remains exactly pinned. A version-scoped pnpm override forces vulnerable `flatted` releases to 3.4.2 without changing OCR code or the WASM engine.           |
| `tesseract.js > babel-eslint > eslint > minimatch > brace-expansion` | Not reachable from OCR for the same reason; the subtree is legacy package tooling.                                                                                                   | A version-scoped override replaces only vulnerable 4.x/5.0.0-5.0.8 releases with 5.0.9. OCR behavior remains covered by the cold-cache regression gate.                                                                 |
| `jimp > @jimp/core > file-type`                                      | Reachable when local or remote images are decoded.                                                                                                                                   | Jimp moved from 0.22.12 to 1.6.1, which resolves `file-type` 21.3.4. Application preflight additionally rejects non-allowlisted image signatures and validates dimensions before `Jimp.fromBuffer`.                     |
| `jimp > plugin-print > ... > follow-redirects`                       | The application never invokes Jimp font or print APIs, but the vulnerable package was present in the production graph.                                                               | Jimp 1.6.1 removes this dependency path. Remote set-symbol downloads now use native fetch with manual same-origin redirects, capped bodies, HTTPS, approved origins, and a deadline.                                    |
| `jimp > plugin-print > ... > min-document`                           | The application never invokes the browser font/DOM helpers, but the vulnerable package was present in the production graph.                                                          | Jimp 1.6.1 removes this dependency path.                                                                                                                                                                                |

## Image-input invariants

All production local image decoding used by OCR and set-symbol cropping goes through one boundary:

- read from one open file descriptor into at most 32 MiB, rejecting files that change size during
  the read;
- recognize JPEG, PNG, GIF, or BMP from magic bytes, not filename extensions;
- reject dimensions over 12,000 pixels on either axis or 40 megapixels before decoding;
- apply Jimp's JPEG limits of 40 megapixels and 256 MiB in addition to the preflight;
- verify decoded dimensions exactly match the validated header.

Remote set-symbol images additionally require HTTPS on `cards.scryfall.io` or
`img.scryfall.com`, remain on the original origin across at most three manual redirects, time out
after 15 seconds, and stream at most 16 MiB. These controls prevent cross-origin forwarding of the
Scryfall request headers and bound work even when `Content-Length` is absent or false.

Perceptual hashing receives only the already-validated buffer form, so `image-hash` cannot reopen a
user-controlled path or perform its own unbounded fetch. Direct library users should use
`imageProcessing.util.readImage` or `readImageInput` before handing image data to any lower-level
decoder.

## Residual risk

There are no residual npm advisories in the production lockfile. Tesseract.js 3.0.3 is older than
the current upstream major, but it remains intentionally pinned because the bundled OCR model and
158-case cold-cache regression corpus were qualified against that engine. Its audited legacy
tooling nodes are patched by version-scoped overrides and are not imported by the OCR execution
path. A future Tesseract major upgrade should be treated as an OCR-model promotion and must pass
the full regression comparison policy in `docs/regression-testing.md`.

The expanded regression corpus also exposed a deterministic Tesseract 3 WASM abort when one worker
was reused beyond the first large case cohort. The fixtures immediately after the abort passed with
a fresh worker, so the regression runner now terminates and recreates its worker after at most 40
cases. Recognition remains sequential, cache-free, and adaptively reset before every crop; the
fixed lifecycle adds an explicit heap/work budget without changing the production engine or model.

Jimp still ships format codecs the application does not accept, including TIFF. That code remains
installed but is not reachable through the application image boundary because validation rejects
its signature before `Jimp.fromBuffer` is called. The focused tests lock in rejection of the
ICNS, JXL, and HEIF advisory signatures, excessive dimensions, excessive local and remote byte
counts, and cross-origin redirects.
