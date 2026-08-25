# Underlag — cross-source-jämförelse (Finder · GitHub · Render · SharePoint)

> **Datum:** 2026-08-25 · Källorna: Finder (lokal Mac) · GitHub (major-arcana-repot) · Render (deployad app) · SharePoint (officiell källa)
> ✅ finns · ⚠️ delvis · ❌ saknas · ❓ ej verifierad

## Matris

| Underlag                                         | SharePoint                              | GitHub (repo)                                 | Finder                        | Render |
| ------------------------------------------------ | --------------------------------------- | --------------------------------------------- | ----------------------------- | ------ |
| **Behandlingsavtal TP (FUE/DHI)**                | ✅ FUE/DHI Nuvarande + advokatversioner | ⚠️ steg7-offert-tp SAKNAS (bara steg5)        | ✅ FUE-avtal PDF + DHI iCloud | ❓     |
| **Behandlingsavtal PRP/PRF/Microneedling**       | ✅ NY Behandlingsavtal PRP/PRF/Micro    | ✅ steg7-offert-prp-hair/-skin/-microneedling | ❌                            | ❓     |
| **Behandlingsavtal Curatiio (estetik+ortopedi)** | ✅ NY Behandlingsavtal VIKTIG           | ❌ SAKNAS som demo                            | ❌                            | ❓     |
| **Behandlingsavtal Ögonlocksplastik**            | ✅ NY 7 dagar                           | ❌ SAKNAS som demo                            | ❌                            | ❓     |
| **Tjänstespec TP 2026 (FUE+DHI)**                | ✅ Tjänstespec TP 2026                  | ⚠️ saknas som egen demo                       | ✅ iCloud                     | ❓     |
| **Tjänstespec Fillers/Profhilo**                 | ✅ 2026-dokument                        | ⚠️ bara steg4-info                            | ✅ PDF i Downloads            | ❓     |
| **Tjänstespec Ortopedi (PRP/PRF)**               | ✅ 2026-dokument                        | ⚠️ bara offert-prf                            | ✅ PDF i Downloads            | ❓     |
| **Tjänstespec PRP-hår/-hud/PRF**                 | ✅ NY-dokument                          | ✅ steg4-prp-hair-info                        | ❌                            | ❓     |
| **Behandlingsplan + Offert (TP/PRP/ÖGONLOCK)**   | ✅ 98. Mailmallar                       | ✅ steg5/7-offert-\*                          | ❌                            | ❓     |
| **Offertmallar (TP/PRP)**                        | ✅ INSATT                               | ✅                                            | ❌                            | ❓     |
| **Bokningsbekräftelse (förskott/ej)**            | ✅ 98. Mailmallar                       | ✅ auto/steg2                                 | ❌                            | ❓     |
| **Friskförsäkran**                               | ✅ NY Friskförsäkran + Fazlis mapp      | ✅ steg8-friskforsakran-final                 | ✅                            | ❓     |
| **Samtycken (GDPR/behandling)**                  | ✅ flera formulär                       | ✅ steg9-foto-samtycke + bundle               | ❌                            | ❓     |
| **Hälsodeklaration**                             | ⚠️ via Meridiq                          | ✅ steg3-halsodeklaration                     | ❌                            | ❓     |
| **Bokningsvillkor**                              | ✅ 1. Bokningsvillkor                   | ⚠️ i bundle                                   | ❌                            | ❓     |
| **Journaler**                                    | ❌ inga mallar (byggs i CCO)            | ✅ steg8-journal-\* (7 st)                    | ✅ Journaler PDF              | ❓     |
| **Mailmallar (påminnelser m.m.)**                | ✅ 98. Mailmallar                       | ✅ auto-\* (4 st)                             | ❌                            | ❓     |

## Slutsatser

1. **SharePoint = facit** — har ALLA officiella avtal/tjänstespec/samtycken (enda kompletta källan)
2. **GitHub = webbversioner** — 39/47 demos, men **saknar: steg7-offert-tp, Curatiio-avtal (estetik+ögonlock), Tjänstespec TP**
3. **Finder = spridda original** — FUE-avtal PDF, Curatiio-tjänstespec PDF, journaler PDF, DHI-avtal i iCloud
4. **Render = ej verifierad** — demo-URL gav 404/502 (kräver inloggning eller annan sökväg) → behöver kontroll

## Rekommendation (byggordning)

1. **Bygg steg7-offert-tp** med SharePoint "Behandlingsavtal - FUE Nuvarande.docx" som facit
2. **Bygg Curatiio-dokumenten** (Botox/Filler/Ögonlock/Meso/Fett/Ortho) med SharePoint 2026-dokumenten
3. **Lägg till Tjänstespec TP-demo** (saknas helt i GitHub)
4. **Verifiera Render-live** (vilken URL/pathen servar demos)
5. **Städa Finder** — samla underlagen i en ordnad mapp
