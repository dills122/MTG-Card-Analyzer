<!-- markdownlint-disable-file MD013 -->

# Regression edge-layout expansion — August 2026

This campaign targets card layouts that bypass the ordinary horizontal title bar or put multiple
names, faces, or treatments on one print. The baseline contained 174 enabled cases; twelve reviewed
cases expand the blocking corpus to 186. One additional reviewed limitation remains disabled.

## Selection policy

- Use explicit Scryfall layout and treatment filters rather than broad balanced imports.
- Keep every import reproducible with a recorded seed and a two-to-four-page request bound.
- Include one true back-face image without importing both faces of the same print into the catalog.
- Preserve importer-generated thresholds; add the exact Scryfall print ID to every expectation.
- Visually inspect every image, then run the cohort with cold OCR, image hashes, and application
  state before enabling passing cases.
- Leave a miss disabled with its original label instead of weakening the expectation.

## Coverage

| Edge family          | Selected fixtures                                                | Detection pressure                                                               |
| -------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Transform and Battle | `Pyretic Prankster`, `Invasion of Vryn`, `Jin-Gitaxias`          | Compound face aliases, full-art frames, and a title rotated 90 degrees           |
| Modal and back face  | `Turntimber Symbiosis`, `Jorn, God of Winter`, `Village Reavers` | Modal DFC iconography, long compound labels, and face-to-canonical-name recovery |
| Multi-name frames    | `Curious Pair`, `Scavenger Regent`                               | Adventure inset title and a reversible print with a three-part canonical name    |
| Horizontal cards     | `Besieged Viking Village`, `Nothing Can Stop Me Now`             | Landscape Plane and Scheme title placement                                       |
| Atypical art         | `Pouncing Shoreshark`, textless `Lightning Bolt`                 | Comic showcase/mutate frame and an art-dominant textless treatment               |

The disabled `Tevesh Szat, Doom of Fools` fixture preserves a difficult full-art planeswalker title
as a reviewed future target.

## Reproducible imports

The cohort used importer seeds `22401`, `22402`, `22403`, `22404`, `22409`, and `22410` with the
following filters:

- `MOM` transform cards, including Battles
- `ZNR` and `KHM` modal double-faced cards
- `ARC`, `OARC`, and `WHO` Plane and Scheme cards
- `ELD`, `WOE`, and `TDM` Adventure-layout results
- 2011–2025 full-art or textless treatments
- the back face of a `MID` transform card

The importer recorded the selected face in both catalog and expected metadata. The back-face run
rejects prints without a second Scryfall face image.

## Targeted results

The first 13-case cold-cache run passed 12 cases and verified all twelve passing exact prints by
Scryfall ID, set, and collector number. It used three worker shards and completed in 28.39 seconds
of wall time. The only miss was `Tevesh Szat, Doom of Fools`, whose art-integrated full-art title
produced no normalized OCR text after the bounded fallback path.

Notable recovery paths:

- `Invasion of Vryn` resolved its rotated Battle title at 48% OCR confidence in 15.14 seconds.
- full-art `Jin-Gitaxias` resolved from `JINGITAXIAS` at 12% OCR confidence.
- the actual back image read `VILLAGE REAVERS` and mapped it to the canonical compound card name.
- both landscape cards and the reversible three-name card returned exact name and print matches.

## Full-corpus verification

The complete 186-case cold-cache gate passed 184 cases overall and all 179 blocking cases, with no
blocking runtime violations. Its wall runtime was 354.99 seconds. The only failures were the
pre-existing non-blocking Mirage `Island` and `Illumination` fixtures. All twelve newly enabled
cases passed in the expanded catalog, so the added compound names and exact print references
introduced no candidate ambiguity.
