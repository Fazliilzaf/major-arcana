# Personalguide: portalen (fri kund↔klinik-kanal)

Kort arbetsflöde för personalen. Målet: flytta löpande kunddialog från SMS/mail till
den gratis portalen. Se `docs/portal-go-live.md` för aktivering (miljö/DNS).

## Vad kunden ser

En trygg chattsida (`/portal-chat/<länk>`) där kunden läser klinikens svar och skriver
själv — utan inloggning varje gång. Länken är personlig och bestående.

## Så här jobbar du i Svarstudion

1. **Öppna Svarstudion** för kundtråden (som vanligt).
2. **Kundkortet** överst visar hela kunden: kontakt, bokningar, ärenden, journalmetadata
   (aldrig journaltext), portal-meddelanden och var kunden är i resan.
3. **Portal-chatt-panelen** visar konversationen i den fria kanalen:
   - **🔗 Skapa portal-länk** — myntar kundens magiska länk och infogar den i ditt svar.
     Länken går ut i det vanliga, godkända mailet (kontrollerad sändkedja).
   - **⟳ Rotera** — byt länk vid läck-misstanke (gamla slutar gälla, ny infogas).
   - **⊘ Återkalla** — stäng av länken helt (bekräftas först).
   - **Svara i portalen** — skriv direkt i panelen; kundens olästa markeras besvarade.

## Notiser

- När en kund skriver i portalen dyker en **notis** upp i notis-feeden ("Nytt portal-
  meddelande från kund"), länkad till kundkortet. Du behöver inte öppna varje kund.
- När du svarar får kunden (om aktiverat) ett kort mejl "Du har ett nytt svar i din
  portal" med länken — så hen kommer tillbaka i stället för att ringa/sms:a.

## SMS — sista utväg

SMS kostar pengar. Använd bara SMS-nudgen för kunder som inte nappar på portal/mejl.
Den skickar ett engångs-SMS med länken och är idempotent (en kund nudgas bara en gång).

## Följ adoptionen

**Portal-fliken** i `/admin#cco` visar volym, engagerade patienter, nudge-konvertering
och "sparade SMS" (proxy för besparingen). Kolla den då och då för att se att kunderna
faktiskt flyttar över.

## Tumregler

- Skapa portal-länk tidigt i dialogen — ju förr kunden har länken, desto mindre SMS.
- Journalinnehåll och medicinska beslut hör INTE hemma i portalchatten (det är för
  icke-akuta frågor; kunden hänvisas till 1177/112 vid akut vård).
- Live-utskick är fortsatt spärrat bakom godkännande — portalen ändrar inte det.
