#!/bin/bash
# Committar och pushar de dokument Claude skrivit 2026-08-27.
# Endast dessa filer rörs — inga andra agenters arbete tas med.
# Dubbelklicka i Finder.
set -e
cd "$(dirname "$0")"

echo "== Städar övergivna lås =="
rm -f .git/index.lock .git/next-index-*.lock .git/next-index-*.lock.lock

ORDRAR=(
  "docs/handover/ORDERS/ORD-126-estetikjournalen-finns-inte-2026-08-27.md"
  "docs/handover/ORDERS/ORD-127-katalogen-sager-sex-manader-2026-08-27.md"
  "docs/handover/ORDERS/ORD-128-lakarens-ordination-ar-en-grind-som-inte-finns-2026-08-27.md"
  "docs/handover/ORDERS/ORD-129-ogonlocksplastik-ar-kirurgi-pa-curatiio-2026-08-27.md"
  "docs/handover/ORDERS/ORD-131-tre-listor-till-personalen-2026-08-27.md"
)

PLANER=(
  "docs/workflow/MASTERPLAN-CCO-2026-08-27.md"
  "docs/workflow/DOKUMENTRESAN-I-CCO-2026-08-27.md"
  "docs/workflow/PERSONALENS-DOKUMENTRESA-PLAN-2026-08-27.md"
)

echo
echo "== Commit 1 av 2 · arbetsordrar =="
git add "${ORDRAR[@]}"
git commit -m "docs(handover): ORD-126 till ORD-131" -m \
"Fem arbetsordrar ur genomgangen av de tva workflow-sidorna och
patientregistret 2026-08-27.

ORD-126 estetik-journalen fanns inte - atta Curatiio-behandlingar delade
en journal som bara genererades, och 38 av 39 katalograder var hairtp.
Levererad och verifierad: katalogen 45 rader, 18/18 tester grona.

ORD-127 katalogen sager 6 man, koden och bada workflow-sidorna sager 8.
En traff kvar.

ORD-128 lakarens individuella ordination ska godkannas fore varje
operation i bada klinikerna. Begreppet finns inte i koden - noll traffar
pa prescriber, lakarsignering eller doctorApproval. requiredFor pre_op
saknar dessutom atgardsmappning i Smart nasta steg.

ORD-129 ogonlocksplastik ar kirurgi och utfors pa Curatiio. Varianten
nonSurgical satter steg 8 till skip - klassas behandlingen fel forsvinner
friskforsakran for en patient som ska skaras i.

ORD-131 tre listor till personalen, med grindar: inga personnummer i
klartext, inget OCR-varde till registret, ingenting raderat." \
  -- "${ORDRAR[@]}"

echo
echo "== Commit 2 av 2 · masterplan =="
git add "${PLANER[@]}"
git commit -m "docs(workflow): masterplan for dokumentresan i CCO" -m \
"MASTERPLAN-CCO-2026-08-27.md haller hela projektet: vad CCO ar, nulaget
mott i repot och produktion, principerna, resan steg for steg, de fyra
byggstegen i beroendeordning, vad som aldrig automatiseras, slappgrinden,
oppna ordrar, arbetsdelning och ordningen.

Ersatter PERSONALENS-DOKUMENTRESA-PLAN och AUTOMATISERING-PERSONAL-RESA.
Rolltabellen och brytarlistan kommer fran den andra; nulaget, blockerarna
och granserna fran den forsta.

Tva krockar rattade:
- Steg 8 sa tidigare skippas icke-kirurgiskt. Ogonlocksplastik utfors pa
  Curatiio men ar kirurgi - friskforsakran ligger kvar, varianten heter
  minorSurgery.
- Steg 10 sa behandlare auto-fylls fran inloggad. Fel person - den som
  oppnar kundkortet kan vara receptionisten. Forvalet ar bokningens
  practitionerId, alltso den som faktiskt utfor, och det ska ga att byta.

prp_skin avgjord: bada klinikerna, och det ar ratt - PRP hud ar vag B pa
Hair TP-sidan och finns aven pa Curatiio-sidan." \
  -- "${PLANER[@]}"

echo
echo "== Pushar =="
git push origin main

echo
echo "KLART."
git log --oneline -3
echo
read -n 1 -s -r -p "Tryck på valfri tangent för att stänga."
