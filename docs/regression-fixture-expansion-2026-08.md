<!-- markdownlint-disable-file MD013 MD043 -->

# Regression fixture expansion experiment — August 2026

> Historical campaign record: counts and failure descriptions below reflect the corpus at the
> time of this expansion. See [OCR regression testing](regression-testing.md) for the current
> 125-case corpus, production model, and gate behavior.

This experiment expands clean-scan end-to-end coverage in batches of five to eight. Each batch is imported
from Scryfall, visually reviewed, enabled in the offline fixture catalog, and run through the
targeted regression harness before the next batch starts.

Passing cases remain enabled and blocking. If a case fails, its catalog and case entries are
disabled without weakening the expected card identity or score thresholds. The failure and likely
cause are recorded below for focused follow-up work.

Vintage-era cards are intentionally excluded because they require the separate recognition flow
tracked by issue #157.

## Coverage summary

The 77-card campaign spans:

- 40 sets, from the first Modern-era Mirrodin block through recent Universes Beyond and showcase
  releases
- all eight importer color categories: white, blue, black, red, green, multicolor, colorless, and
  land
- eight primary card categories, including artifacts, creatures, enchantments, instants, lands,
  planeswalkers, sorceries, and a planar phenomenon
- six layouts: normal, saga, meld, planar, flip, and split
- six treatments: normal, borderless, extended-art, full-art, showcase, and textless
- common, uncommon, rare, and mythic rarity

## Initial batch results

| Batch     | Coverage target                                    | Imported | Passed | Disabled | Notes                                                                  |
| --------- | -------------------------------------------------- | -------: | -----: | -------: | ---------------------------------------------------------------------- |
| 1         | Final Fantasy treatments (`FIN`)                   |        5 |      3 |        2 | Borderless, normal, full-art, extended-art, and meld coverage          |
| 2         | Lord of the Rings treatments (`LTR`)               |        5 |      4 |        1 | Extended-art, showcase Saga, full-art, and normal frames               |
| 3         | Doctor Who, Fallout, Warhammer 40K, Jurassic World |        5 |      2 |        3 | Includes planar, full-art, extended-art, and textured franchise frames |
| 4         | Mirrodin block (`MRD`, `DST`, `5DN`)               |        5 |      4 |        1 | First-generation Modern frames across five colors/types                |
| 5         | Kamigawa and Ravnica blocks (`BOK`–`DIS`)          |        5 |      4 |        1 | Includes an original Kamigawa flip layout                              |
| 6         | Time Spiral through Zendikar (`PLC`–`ZEN`)         |        5 |      3 |        2 | Showcase, split, textless, land, and artifact frames                   |
| 7         | Tarkir through Oath (`KTK`–`OGW`)                  |        5 |      4 |        1 | Land, artifact, planeswalker, creature, and instant coverage           |
| 8         | Amonkhet through Ravnica Allegiance (`AKH`–`RNA`)  |        5 |      3 |        2 | Normal Saga plus two generations of split-card frames                  |
| 9         | Recent showcase era (`NEO`–`WOE`)                  |        5 |      4 |        1 | Extended-art, meld, showcase, full-art, and normal artifact frames     |
| 10        | Return to Ravnica red frames (`RTR`)               |        8 |      8 |        0 | All passed; OCR confidence 56–79 and name scores 0.8–1.0               |
| 11        | Khans and Origins balanced frames (`KTK`, `ORI`)   |        8 |      8 |        0 | All 8 colors, 7 types, 4 rarities; OCR confidence 68–80                |
| 12        | Zendikar-era balanced frames (`ZEN`, `WWK`, `ROE`) |        8 |      6 |        2 | Seven colors/types and four rarities; two ROE title OCR failures       |
| 13        | Lorwyn-era balanced frames (`MOR`, `SHM`)          |        8 |      6 |        2 | All 8 colors and 6 types; two legible-title OCR failures               |
| **Total** | **Thirteen non-vintage cohorts**                   |   **77** | **59** |   **18** | **All images and metadata visually reviewed**                          |

## Recovered follow-up cases

The 18 cases below were the historical failures found during ingestion. They now pass together and
are enabled after the reviewed multi-candidate, soft-title, rotated-title, and card-face alias
changes. The original failure evidence remains here to document what each regression protects.

### `fin-569-choco-seeker-of-paradise-1ce688fa-scryfall`

- Expected: `Choco, Seeker of Paradise`
- OCR result: `SEEKEROIPAMDISE` at 64 confidence
- Likely cause: the stylized borderless title treatment and long three-part name caused the core
  title crop to omit `Choco` and collapse the remaining words.
- Follow-up: inspect title-region selection and spacing recovery for borderless nameplates.

### `fin-585-laughing-mad-9268ccdb-scryfall`

- Expected: `Laughing Mad`
- OCR result: `MY` at 54 confidence
- Likely cause: preprocessing on the red frame selected a low-information title variant even though
  the source title is visually legible.
- Follow-up: compare alternate threshold/inversion variants and selection confidence for red frames.

### `ltr-567-book-of-mazarbul-ff4812a7-scryfall`

- Expected: `Book of Mazarbul`
- OCR result: `MAZARBUL` at 71 confidence
- Likely cause: the parchment showcase Saga title bar and decorative scroll ends caused the core crop
  to retain only the last word.
- Follow-up: evaluate wider title crops or partial-name recovery for showcase Saga frames.

### `pip-1068-war-room-a6535fc5-scryfall`

- Expected: `War Room`
- OCR result: empty text at 0 confidence
- Likely cause: the low-contrast gray Fallout title bar did not survive any current preprocessing
  variant, causing result-schema validation to stop the case before matching.
- Follow-up: inspect adaptive contrast/thresholding for desaturated franchise frames and preserve a
  diagnostic result when OCR returns empty text.

### `who-605-unleash-the-flux-8e3c04ad-scryfall`

- Expected: `Unleash the Flux`
- OCR result: `NL` at 58 confidence
- Likely cause: planar cards are stored in landscape orientation while the production title regions
  assume an upright portrait card.
- Follow-up: add layout-aware rotation before title-region extraction.

### `40k-321-the-swarmlord-1a87e989-scryfall`

- Expected: `The Swarmlord`
- OCR result: `NESWUNOM` at 47 confidence
- Likely cause: the textured dark-gold Warhammer frame and white display lettering degraded character
  segmentation in the wide title crop.
- Follow-up: compare frame-specific grayscale and threshold variants for textured Universes Beyond
  cards.

### `5dn-78-screaming-fury-7e8488b6-scryfall`

- Expected: `Screaming Fury`
- OCR result: `SCREAMIN` at 66 confidence
- Likely cause: the wide crop on the saturated 2004 red frame clipped the final character and
  discarded the lower-confidence second word.
- Follow-up: compare title-region width and multi-word result selection on early-Modern red frames.

### `sok-145-sasaya-orochi-ascendant-sasaya-s-essence-d224c50f-scryfall`

- Expected: `Sasaya, Orochi Ascendant // Sasaya's Essence`
- OCR result: `SACRA OROCHI ASCENDANT EL` at 61 confidence
- Likely cause: OCR approximated the upright face, but fuzzy matching compared it with the full
  compound flip-card name including the upside-down face.
- Follow-up: index and match individual face names while preserving the compound print identity.

### `ala-250-rafiq-of-the-many-2e181878-scryfall`

- Expected: `Rafiq of the Many`
- OCR result: `RAFIQ LHT' MAN` at 52 confidence
- Likely cause: the ornate black-and-gold showcase nameplate and display font distorted both short
  connecting words.
- Follow-up: preserve low-confidence connecting words when the surrounding title tokens align.

### `plc-114-rough-tumble-0c93c9a0-scryfall`

- Expected: `Rough // Tumble`
- OCR result: `RM` at 56 confidence
- Likely cause: the split card presents both names sideways, outside portrait title regions; the
  catalog also stores a compound face name.
- Follow-up: rotate and extract each split half, then match face names before resolving the print.

### `bfz-227-slab-hammer-18c64671-scryfall`

- Expected: `Slab Hammer`
- OCR result: `SLAB ILAPER` at 64 confidence
- Likely cause: the textured silver artifact nameplate merged the capital `H` and repeated vertical
  strokes in `Hammer`.
- Follow-up: compare artifact-frame threshold variants and character normalization for merged stems.

### `grn-230-status-statue-44614c6d-scryfall`

- Expected: `Status // Statue`
- OCR result: `EH1` at 56 confidence
- Likely cause: both split-card titles are sideways and outside the portrait title regions.
- Follow-up: share layout-aware rotation and per-face extraction with the Rough // Tumble fix.

### `akh-213-insult-injury-eeac671f-scryfall`

- Expected: `Insult // Injury`
- OCR result: `INSULT` at 67 confidence
- Likely cause: the upright aftermath face was extracted perfectly, but matching only indexed the
  compound two-face name.
- Follow-up: index individual split/aftermath face names and resolve them back to the compound print.

### `neo-261-thundersteel-colossus-b7d49f9c-scryfall`

- Expected: `Thundersteel Colossus`
- OCR result: `HUMANELM` at 74 confidence
- Likely cause: the long title on the silver Vehicle frame was heavily merged and the wrong compact
  interpretation won despite high reported OCR confidence.
- Follow-up: revisit confidence calibration and wide-title selection on silver artifact frames.

### `roe-41-puncturing-light-e52d260a-scryfall`

- Expected: `Puncturing Light`
- OCR result: `MEL` at 42 confidence from `name-core`; `name-wide` returned `M3` at 58 and
  `top-band` returned no normalized text at 75.
- Match result: zero name and print candidates; runtime 1,326.29 ms.
- Likely cause: current hard-threshold preprocessing leaves the title visually recognizable but
  merges the small serif glyphs enough that Tesseract cannot segment any title region.
- Follow-up: add a soft/non-threshold title variant or adjust segmentation for high-contrast white
  Rise of the Eldrazi nameplates.

### `roe-1-all-is-dust-62dba377-scryfall`

- Expected: `All Is Dust`
- OCR result: selected `ALLLSDIIST` at 70 confidence from `name-core`; `name-wide` returned
  `ALLLSDUST '` at 39, while `top-band` found exact `ALL IS DUST` at 67.
- Match result: zero name and print candidates; runtime 1,730.08 ms.
- Likely cause: OCR candidate scoring favored the higher-confidence core crop and its region bonus
  over the exact top-band text, which also received a multiline penalty.
- Follow-up: rank OCR candidates with catalog/name-match evidence or preserve viable alternate title
  candidates through name resolution.

### `mor-43-negate-5a501252-scryfall`

- Expected: `Negate`
- OCR result: selected `N52 LI` at 61 confidence from `name-core`; `name-wide` returned no
  normalized text at 95 and `top-band` returned empty text at 0.
- Match result: zero name and print candidates; runtime 1,199.25 ms.
- Likely cause: current hard-threshold preprocessing leaves the short Morningtide title visibly
  recognizable but thickens its serif glyphs enough that Tesseract hallucinates digits or returns
  blank text. The blank wide crop's 95 confidence also shows poor confidence calibration.
- Follow-up: test a soft title variant and alternate segmentation for short early-Modern names, and
  discount high-confidence blank OCR results.

### `shm-205-firespout-13454f69-scryfall`

- Expected: `Firespout`
- OCR result: selected `ESPOUT` at 56 confidence from `top-band`; `name-core` returned `RM` at 55
  and `name-wide` returned no normalized text at 47.
- Match result: zero name and print candidates; runtime 1,248.91 ms.
- Likely cause: the Shadowmoor hybrid nameplate and adjacent hybrid mana symbols disrupt the hard
  title variants; the widest crop preserves only the title suffix and fuzzy matching cannot recover
  the full name.
- Follow-up: evaluate a soft title variant for hybrid frames and suffix-aware recovery when a long,
  distinctive title fragment survives.

## Final verification

Baseline before imports: 42/47 cases passed overall and all 40/40 blocking cases passed. The five
failures were the existing non-blocking vintage cases tracked by issue #157.

After the OCR recovery work, 123/124 enabled cases pass overall and all 117/117 blocking cases pass.
All 18 failures discovered by this campaign are enabled and passing. The only remaining failure is
the pre-existing non-blocking vintage `Island` case tracked by issue #157. The full run used no
application persistence, image-hash cache, or OCR cache.
