# 📬 Arcana Handover Protocol

**Syfte:** Eliminera copy-paste mellan Fazli, Claude och Cursor. **Gäller HELA Arcana** — CMO · CCO · CF · Aisia · plattform · alla spår.

## Hur det funkar

1. **Fazli säger till Claude:** _"skapa order: {uppdrag}"_
2. **Claude levererar:** Notion-rad + `docs/handover/ORDERS/ORD-NNN-*.md` + prompt _"Cursor, kör ORD-N."_
3. **Fazli säger till Cursor:** _"Kör ORD-N"_ (eller _"Kör"_ i samma tråd)
4. **Cursor** läser order → jobbar → rapporterar i ORD-fil + Notion
5. **Claude** läser rapport nästa session

**Inbox:** [📥 Arcana Order Inbox](https://app.notion.com/p/590363ad352a4d01bc6fbbea8cfe4418)

Se `ORDER-TEMPLATE.md` · ordrar i `ORDERS/`
