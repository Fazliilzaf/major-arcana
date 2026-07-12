# AI/OCR-policy — ägar-beslut 2026-07-13

**Beslutsfattare:** Fazli (owner) · **Föredragande:** Claude · **Kontext:** CFO-CM-NULAGE-OCH-PLAN §7.2

## Beslut

**Extern AI (OpenAI, gpt-4o-mini) är godkänd för företagets leverantörsunderlag:**
kvitton, leverantörsfakturor, orderbekräftelser, resedokument och abonnemangskvitton —
via `cmAiExtractor` (CM-intaget) och framtida CF.10-OCR på samma villkor.

## Villkor (icke förhandlingsbara)

1. **Patientdata går ALDRIG till extern AI.** Gäller journal, hälsodeklarationer, foton,
   personnummer — allt i patientdomänen. Oförändrat från tidigare policy.
2. Endast **företagsekonomiska underlag** (leverantörssidan) omfattas av godkännandet.
3. Original arkiveras alltid i secure storage FÖRE AI-anrop (BFN 7 år) — AI:n får en kopia,
   aldrig källan.
4. Kostnadstak per körning: `CM_MAX_EXTRACT_PER_SYNC` (default 10).
5. AI:n föreslår — människan godkänner (CEM-principen). Ingen auto-bokföring.

## Konsekvenser

- Motsägelsen CM-kör-AI vs CF.10-väntar-GO är löst: **CF.10 anses öppnad** på villkoren ovan.
- Alternativen "hybrid" och "lokal Tesseract" valdes bort 2026-07-13 (kan omprövas).
- MASTER-TODO DEL 6: AI/OCR-beslutspunkten bockas av.
