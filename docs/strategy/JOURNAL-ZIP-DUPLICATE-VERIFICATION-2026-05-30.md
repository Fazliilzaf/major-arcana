# Duplicate Journal Zip Verification — READ-ONLY

*Genererad: 2026-05-30T11:30:55.816Z · Mode: read_only*

> Inget flyttas. Inget raderas. Inget packas upp. Endast metadata + checksum.

## TL;DR

Tidigare antagande "41.2 GB patient-data pga dubbla kopior" var **felaktigt**.
`MA-Archive/journal-zips/` är **symlinks** (78 st, vardera ~163 bytes), inte fysiska kopior.
Faktisk patient-zip-fotavtryck: **28.2GB** (21 filer i Primary).

## Kategorier

| Kategori | Antal |
|---|--:|
| identical_duplicates (symlinks valid) | 21 |
| same_name_different_checksum | 0 |
| only_in_primary | 0 |
| only_in_archive (regular file, ej symlink) | 0 |
| broken_archive_symlinks | 57 |
| missing_checksum | 0 |

## Disk-användning

| Komponent | Storlek |
|---|--:|
| Primary zip-filer (21 st) | 28.2GB |
| Archive symlinks (78 st × ~163 bytes) | 12.4KB |
| **Total disk** | **28.2GB** |

## Broken symlinks — historiska zippar saknas i Primary

57 symlinks pekar på filer som **inte längre finns** i Primary-mappen.
Detta är **inte** en current radering — det är ett indikation på att äldre exports (2020-2025) har städats bort eller flyttats.

**Möjliga källor:**
- Google Drive Takeout-arkivet (originalkällan)
- Annan lokal mapp / extern disk
- Möjligen borta för gott

## Rekommendationer (väntar på owner-godkännande)

- INGENTING raderas i denna körning — owner-mandat.
- identical_duplicates: symlinks, INTE fysiska dubbletter. Behåll båda. Disk-fotavtryck = 0 utöver Primary.
- broken_archive_symlinks: 57 historiska zip-referenser (2020-2025) vars original saknas i Primary. Kan ha raderats efter export. Undersök Google Drive Takeout-källan.
- only_in_primary (2 st): CSV-export + .command-fil — inte zip-data, ej dubblett-relevant.
- Inga same_name_different_checksum-fall — symlinks garanterar bit-exakt match.
- Permanent radering av brutna symlinks kräver explicit owner-bekräftelse i separat körning.

## Nästa steg

1. Owner reviewar rapporten.
2. Owner bestämmer om broken symlinks ska:
   a) Återupplivas (om originalfiler hittas i Drive Takeout)
   b) Tas bort som broken-references (separat owner-godkännande)
   c) Lämnas som de är (low-priority cleanup)
3. Permanent radering kräver explicit owner-bekräftelse i ny körning.
