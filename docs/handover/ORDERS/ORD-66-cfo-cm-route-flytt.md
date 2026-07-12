# ORD-66 · Flytta /cco-cf/\* ur server.js → src/routes/cfo.js

**Status:** PENDING — egen order, egen PR (medvetet EJ i ORD-63–61-svepet)
**Beställare:** Fazli (svep-GO 2026-07-12) · **Byggare:** Cursor/Codex (het fil — server.js)
**Bakgrund:** ORGANISATION.md §4: monoliten är fryst, ny kod ska ligga i `src/routes/`.
CF.2–CF.9-routes (`/api/v1/cco-cf/*`) ligger idag inline i `server.js` (~rad 2128 ff).

## Scope

1. Skapa `src/routes/cfo.js` med `createCfoRouter({...stores, rbac})` — flytta ALLA
   `/cco-cf/*`-handlers oförändrade (ingen logikändring, ren flytt).
2. Montera via `app.use('/api/v1', createCfoRouter(...))` på samma plats i server.js.
3. CM-mounten (~rad 14044) flyttas till samma block så CFO+CM monteras ihop.
4. Karaktäriseringstest före flytt: snapshot av route-lista + smoke på dashboard/receipts/expenses.

## Forbidden

Ingen logikändring i handlers · journal/feed/forms orörda · aldrig `git add -A`.

## Gates

`npm run check:syntax` · `npm run lint:no-bypass` · `npm run test:unit` · smoke:local
