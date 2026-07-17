# Drive-repair closeout — 117 unique NEEDS_REVIEW

**Status:** CLOSED · 2026-07-17  
**Scope:** Drive-repair track only. No further Drive actions.

## Unique owner queue (canonical)

| Group                  |       N | Notes                                    |
| ---------------------- | ------: | ---------------------------------------- |
| journal/sign           |      10 | `cco_journal_sign` — not Drive           |
| quarantine / no-source |       2 | includes overlap asset below             |
| no_drive_id            |       2 |                                          |
| GetAccept stubs        |      88 | Curatiio metadata, no PDF                |
| b5 manual              |      15 | 14 `missing_date` + 1 zero_byte soft_dup |
| **Unique total**       | **117** |                                          |

Arithmetic check: `10 + 2 + 2 + 88 + 15 = 117`.

## Overlap — never double-count

| Field                  | Value                                                  |
| ---------------------- | ------------------------------------------------------ |
| assetId                | `56292872-4bc2-4ec9-89b8-a93d66908935`                 |
| file                   | `IMG_8579.HEIC`                                        |
| Counts in              | **quarantine / no-source only**                        |
| Must not also count in | b5 manual                                              |
| Partition              | `b3` quarantine (`drive_source_missing_during_import`) |
| Evidence               | `ownBlob=false`, `fileSize=0`, checksum empty-file     |

The same filename also has soft_dup twin `2ef2c760-e766-4914-8c58-236d6ae4bb87`, which **does** count in b5 (15).

**Forbidden sum:** `14 + 88 + 16 = 118` (double-counts the quarantine HEIC).

## Closed tracks

- b1: 40 482 DUPLICATE
- b3 `source_ok`: 2 504 VISIBLE (reattach)
- Drive-repair: done

## Next

Owner decisions **per group**, never mass-auto. Surfaces: `/admin#cco`, `/drive-import-review.html`, `/cco-import-review.html` (GetAccept), `/photo-review.html`.
