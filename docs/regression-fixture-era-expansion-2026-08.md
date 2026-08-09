<!-- markdownlint-disable-file MD013 -->

# Regression release-year expansion — August 2026

This follow-up expands the offline clean-scan end-to-end corpus before the next
release. The baseline contained 125 enabled cases. An audit against Scryfall's
[Sets API](https://scryfall.com/docs/api/sets) found no enabled print from 1993,
1995, 1997 through 2002, 2013, or 2021.

## Selection policy

- Select one English paper print from each targeted set through Scryfall's
  [Card Search API](https://scryfall.com/docs/api/cards/search).
- Use the existing balanced importer with explicit seeds so every candidate can
  be reproduced.
- Exclude every print already present in the manifest, including disabled OCR
  training inputs, to keep the regression corpus separate from training data.
- Visually verify each downloaded image and its Scryfall identity before
  enabling it.
- Keep passing cases enabled and blocking. Disable misses without changing the
  expected name, print identity, or score thresholds.

## Results

| Cohort    | Target sets                                                                        | Candidates | Enabled | Disabled |
| --------- | ---------------------------------------------------------------------------------- | ---------: | ------: | -------: |
| 1993–1998 | `ARN`, `LEA`, `ATQ`, `HML`, `ICE`, `CHR`, `TMP`, `VIS`, `WTH`, `USG`, `STH`, `EXO` |         12 |       8 |        4 |
| 1999–2002 | `MMQ`, `UDS`, `ULG`, `INV`, `NEM`, `PCY`, `ODY`, `APC`, `PLS`, `ONS`, `TOR`, `JUD` |         12 |       9 |        3 |
| 2013      | `THS`, `M14`, `GTC`, `DGM`                                                         |          4 |       4 |        0 |
| 2021      | `KHM`, `MID`, `STX`, `VOW`                                                         |          4 |       4 |        0 |
| 2024      | `BLB`, `DSK`, `OTJ`, `MKM`                                                         |          4 |       4 |        0 |
| 2025      | `TLA`, `TDM`, `DFT`, `EOE`                                                         |          4 |       4 |        0 |
| **Total** | **40 distinct sets**                                                               |     **40** |  **33** |    **7** |

All 33 enabled candidates passed together as blocking fixtures. The seven
disabled candidates produced no name match with the pinned LSTM model:

- `Pyramids` (`ARN`)
- `Blue Elemental Blast` (`LEA`)
- `Wall of Kelp` (`HML`)
- `Flux` (`WTH`)
- `Sunken Field` (`PCY`)
- `Illusion // Reality` (`APC`)
- `Glarecaster` (`ONS`)

The enabled suite now contains 158 cases. Every previously missing release year
has at least one passing blocking fixture, while the disabled candidates remain
available as explicit evidence for future OCR improvements.

## Full-corpus verification

The cold-cache run passed 156 of 158 enabled cases and all 151 blocking cases.
The only failures are the two pre-existing non-blocking vintage fixtures. The
new cohort passed 33 of 33 together and introduced no blocking regression.
