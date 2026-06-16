# ORD-6 & ORD-29 Fas 1 — Linear close comments (copy-paste)

Comments for **existing** Linear tickets (do not open new issues). Paste when closing or documenting closeout.

---

## ORD-6 — Fas A.2 legal_review (mall-version)

Use on issue **ORD-6** (legal review / template-version approval).

---

**ORD-6 CLOSED** — owner prod GO · Fas A.2 mall-version (väg A) låst på prod (2026-06-16).

**Prod verify:** `npm run verify:ord6-prod-sticks` **14/14 PASS** (commit `7d90c5c8`).

**Scope:** `template-version-approval` per `templateId@version`; `record-legal-review` **förbjuden**. Signering tillåten när mall-version godkänd + signerat/consent → `bookable`.

**Docs:** `docs/handover/ORDERS/ORD-6-fas-a2-template-version-legal-review.md` · `ORD-6-CLOUD-STAFF-UAT.md`

**Follow-up:** Ej A.3+ (bundle-sign, GetAccept, Kunder-UI) i denna closeout.

---

## ORD-29 — Fas 1 (HD asset enrichment)

Use on issue **ORD-29** when closing **Phase 1 / Fas 1** only (not Phase 2 ingest).

---

**ORD-29 Fas 1 CLOSED** — owner prod GO · Phase 1 enrichment live (2026-06-16).

**Prod verify:** `npm run verify:ord29-prod-sticks` **14/14 PASS** (exit 0). Stickprov API: 4/5 `missingHealthDeclaration=false` (Michael, Fahed, Johan, Henrik).

**Omar ref-patient WARN (facit):** stickprov-UUID `3cdf4d6c-8f3d-4b2a-9c1e-2a4f8b0e9d12` → **404** i prod patient-master (referens-ID, **ej blockerande**; förväntat WARN i sticks).

**Docs:** `docs/handover/ORDERS/ORD-29-import-halso-health-declarations.md` · `ORD-29-CLOUD-STAFF-UAT.md`

**Phase 2:** mailbox struktur-ingest (`ingest:halso-hd`) **väntar explicit owner GO** — deploy inte i denna closeout.

---
