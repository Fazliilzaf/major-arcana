#!/usr/bin/env bash
# scan-for-pii.sh — PCRE-baserad PII-scan över repo.
#
# OWNER-SKÄRPNING #4: PCRE-format ([0-9] istället för \d) så samma
# mönster fungerar i både ripgrep --pcre2 och POSIX-grep -E utan
# divergerande output mellan macOS och Linux.
#
# Användning:
#   bash scripts/scan-for-pii.sh
#   npm run scan-pii
#
# Exit-kod:
#   0 om inga PII-träffar (utöver kända templates/anon-data)
#   1 om PII-träff hittats
#
# Allowlistar: @anthropic, @example, @test, @anon, @placeholder,
#              info@, contact@, hairtpclinic.com (template-domän),
#              anon-patient-*, demo-*, MMMMMM-NNNN (template-pnr).

set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT" || exit 1

# Färgkoder — endast om TTY
if [ -t 1 ]; then
  RED=$'\033[31m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'; RESET=$'\033[0m'
else
  RED=''; GREEN=''; YELLOW=''; RESET=''
fi

# Globala excludes — bygg som rg-flagg-array
EXCLUDES=(
  --glob '!*.lock'
  --glob '!*node_modules*'
  --glob '!.git/*'
  --glob '!data/cco-audit.jsonl'
  --glob '!*.min.js'
  --glob '!data/cco-pii-allowlist.json'
)

SEARCH_PATHS=(docs examples src tests scripts public config migration)

violations=0

echo "=== PII-scan (PCRE-format) ==="
echo ""

# ---------------------------------------------------------------------------
# 1. Svenskt personnummer
# ---------------------------------------------------------------------------
echo "${YELLOW}1. Personnummer-mönster ([0-9]{6}[-[:space:]]?[0-9]{4}):${RESET}"
pnr_hits=$(rg -n --pcre2 \
  "[0-9]{6}[-[:space:]]?[0-9]{4}" \
  "${EXCLUDES[@]}" \
  "${SEARCH_PATHS[@]}" 2>/dev/null \
  | grep -v -E "(19800101-1234|MMMMMM-NNNN|YYYYMMDD-NNNN|template|placeholder|exempel|example)" \
  | head -20 || true)
if [ -n "$pnr_hits" ]; then
  echo "${RED}HITS:${RESET}"
  echo "$pnr_hits"
  violations=$((violations + $(echo "$pnr_hits" | wc -l)))
else
  echo "${GREEN}OK — inga personnummer hittade.${RESET}"
fi
echo ""

# ---------------------------------------------------------------------------
# 2. Svenska mobilnummer
# ---------------------------------------------------------------------------
echo "${YELLOW}2. Svenska mobilnummer (\\+46[0-9]{8,}):${RESET}"
phone_hits=$(rg -n --pcre2 \
  "\+46[0-9]{8,}" \
  "${EXCLUDES[@]}" \
  "${SEARCH_PATHS[@]}" 2>/dev/null \
  | grep -v -E "(template|placeholder|example|exempel|XXXXXXXX|NNNNNNNN)" \
  | head -10 || true)
if [ -n "$phone_hits" ]; then
  echo "${RED}HITS:${RESET}"
  echo "$phone_hits"
  violations=$((violations + $(echo "$phone_hits" | wc -l)))
else
  echo "${GREEN}OK — inga svenska mobilnummer hittade.${RESET}"
fi
echo ""

# ---------------------------------------------------------------------------
# 3. Email-adresser (icke-template)
# ---------------------------------------------------------------------------
echo "${YELLOW}3. Email-adresser ([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}):${RESET}"
email_hits=$(rg -n --pcre2 \
  "[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}" \
  "${EXCLUDES[@]}" \
  "${SEARCH_PATHS[@]}" 2>/dev/null \
  | grep -v -E "(@anthropic|@example|@test|@anon|@placeholder|@hairtpclinic|contact@|info@|noreply@|no-reply@|admin@|support@|@fazli\.se|@gmail\.com.*example|@gmail\.com.*test|MAILGUN_|SENDGRID_|smtp\.|fontawesome|googleapis|github\.com|@types/|@anthropic-ai|user@|owner@|staff@|user1@|user2@|name@domain)" \
  | head -20 || true)
if [ -n "$email_hits" ]; then
  echo "${RED}HITS (granska manuellt):${RESET}"
  echo "$email_hits"
  violations=$((violations + $(echo "$email_hits" | wc -l)))
else
  echo "${GREEN}OK — inga okända email-adresser hittade.${RESET}"
fi
echo ""

# ---------------------------------------------------------------------------
# 4. Git-tracked PII (extra säkerhetscheck via git ls-files)
# ---------------------------------------------------------------------------
echo "${YELLOW}4. Git-tracked filer med PII-pattern:${RESET}"
tracked_hits=$(git ls-files 2>/dev/null \
  | xargs -I{} rg -n --pcre2 "[0-9]{6}-[0-9]{4}" "{}" 2>/dev/null \
  | grep -v -E "(19800101-1234|MMMMMM-NNNN|template|placeholder)" \
  | head -10 || true)
if [ -n "$tracked_hits" ]; then
  echo "${RED}HITS (i checkad-in kod!):${RESET}"
  echo "$tracked_hits"
  violations=$((violations + $(echo "$tracked_hits" | wc -l)))
else
  echo "${GREEN}OK — inga PII-träffar i git-tracked filer.${RESET}"
fi
echo ""

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo "=== Resultat ==="
if [ "$violations" -eq 0 ]; then
  echo "${GREEN}PII-scan PASS: 0 träffar.${RESET}"
  exit 0
else
  echo "${RED}PII-scan FAIL: $violations träffar.${RESET}"
  echo ""
  echo "Granska träffarna ovan. Om de är legitima (template/test-data),"
  echo "lägg till mönstret i grep -v-filtret eller i .gitignore."
  exit 1
fi
