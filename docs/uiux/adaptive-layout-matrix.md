# CCO Adaptive Layout Matrix

| Vy | Mobil (320–767) | iPad/Tablet (768–1023) | Desktop (1024+) | Primär action | Göm på mobil | Bottom sheet | Split view (iPad) |
|-----|----------------|------------------------|-----------------|---------------|--------------|--------------|-------------------|
| **Dashboard** | Stacked cards, dag-sammanfattning | 2-kolumn grid | Multi-kolumn + sidebar | Kör Daily Brief | Rapporter, detaljsiffror | — | — |
| **Arbetskö** | Kompakta kort, swipe actions | Lista + förhandsgranskning | Full tabell + fokusyta | Öppna tråd | Filter-panel | Tråddetalj | Lista + detalj |
| **Fokusyta bokning** | Steg-för-steg flow | Split: lista + detalj | Full panel | Bekräfta bokning | Historik | Tidsväljare | Kandidater + detalj |
| **Publik bokning** | Single-column wizard | Centrerad form | Centrerad form, bredare | Boka tid | Stödinformation | Tidsalternativ | — |
| **Intern bokning** | Bottom sheet tidsväljare | Split: kalender + formulär | Full kalender + sidopanel | Skapa bokning | Resurs-detaljer | Tidsluckor | Kalender + formulär |
| **Kalender** | Dagvy / lista | Dagvy + sidodetalj | Vecko/resurs-kalender | Ny bokning | Veckoöversikt | Bokningsdetalj | Dag + detalj |
| **Kundkort** | Flikar (Profil/Journal/Filer) | Split: lista + kort | Full kort + sidebar-journal | Öppna journal | Statistik | Kunddetalj | Lista + profil |
| **Journal** | Steg-baserad form | Split: historik + formulär | Full formulär + historik | Signera | Revisionshistorik | Fälthjälp | Historik + formulär |
| **Hälsodeklaration** | 4-steg form m. progress | Centrerad form | Bredare form + sidebar | Signera | Instruktionstext | — | — |
| **Friskförsäkran** | 3-steg form | Centrerad form | Bredare form | Signera + spara | — | — | — |
| **Samtycke** | Scrollbar text + signering | Text + signering sida-vid-sida | Full text + sidosignering | Signera | — | Signeringsmodal | Text + signering |
| **Avtal** | Scrollbar + accept-knapp | Text + accept sida-vid-sida | Full dokument + action | Acceptera | Juridisk text | — | Avtal + acceptera |
| **Offert** | Kompakt kort + accept | Split: offert + pris | Full offert-dokument | Acceptera | Detaljerad prisspec | — | Offert + pris |
| **Kommunikation** | Lista SMS/mejl | Split: lista + förhandsgranskning | Full inbox | Skicka | Mallinställningar | Mejl-förhandsgranskning | Lista + mejl |
| **POS** | Produktlista + summa | Split: produkter + kvitto | Full kassa + kvitto | Betala | Lager, historik | Betalningsval | Produkter + kvitto |
| **Personalvy** | Kompakt dagöversikt | Split: schema + detalj | Full schema + alla resurser | Nästa patient | Statistik | Patientdetalj | Schema + detalj |

## QA-risker per vy

| Vy | Risk mobil | Risk tablet | Risk desktop |
|----|-----------|-------------|--------------|
| Dashboard | Kort överlappar | Grid för trångt | — |
| Arbetskö | Scroll stoppar | — | — |
| Kalender | Touch targets | — | — |
| Journal | Lång form, keyboard | — | — |
| Hälsodeklaration | ÅÄÖ-klipp | — | — |
| POS | Siffror svåra att trycka | — | — |
| Kundkort | Flikar: swipe vs tap | Split proportioner | — |
