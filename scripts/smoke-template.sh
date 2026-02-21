#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
EMAIL="${ARCANA_OWNER_EMAIL:-owner@hairtpclinic.se}"
PASSWORD="${ARCANA_OWNER_PASSWORD:-ArcanaPilot!2026}"
TENANT_ID="${ARCANA_DEFAULT_TENANT:-hair-tp-clinic}"

json_get() {
  local path="$1"
  node -e "
const fs = require('fs');
const input = fs.readFileSync(0, 'utf8');
let data;
try { data = JSON.parse(input); } catch (e) {
  console.error('❌ Kunde inte läsa JSON-svar');
  console.error(input);
  process.exit(1);
}
const path = process.argv[1].split('.');
let ref = data;
for (const key of path) {
  if (!key) continue;
  ref = ref?.[key];
}
if (ref === undefined || ref === null) process.exit(2);
if (typeof ref === 'object') {
  process.stdout.write(JSON.stringify(ref));
} else {
  process.stdout.write(String(ref));
}
" "$path"
}

echo "== Arcana Template Smoke Test =="
echo "BASE_URL:  $BASE_URL"
echo "EMAIL:     $EMAIL"
echo "TENANT_ID: $TENANT_ID"
echo

HEALTH_RESPONSE="$(curl -s "$BASE_URL/healthz")"
HEALTH_OK="$(printf '%s' "$HEALTH_RESPONSE" | json_get ok)"
echo "✅ healthz OK (ok: ${HEALTH_OK})"

READY_RESPONSE="$(curl -s "$BASE_URL/readyz")"
READY_OK="$(printf '%s' "$READY_RESPONSE" | json_get ok)"
echo "✅ readyz OK (ok: ${READY_OK})"

LOGIN_RESPONSE="$(curl -s -X POST "$BASE_URL/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"tenantId\":\"$TENANT_ID\"}")"

TOKEN="$(printf '%s' "$LOGIN_RESPONSE" | json_get token)"
if [[ -z "$TOKEN" ]]; then
  echo "❌ Inloggning misslyckades."
  printf '%s\n' "$LOGIN_RESPONSE"
  exit 1
fi
echo "✅ Login OK (token längd: ${#TOKEN})"

ME_RESPONSE="$(curl -s "$BASE_URL/api/v1/auth/me" \
  -H "Authorization: Bearer $TOKEN")"
CURRENT_TENANT="$(printf '%s' "$ME_RESPONSE" | json_get membership.tenantId)"
CURRENT_ROLE="$(printf '%s' "$ME_RESPONSE" | json_get membership.role)"
CURRENT_SESSION_ID="$(printf '%s' "$ME_RESPONSE" | json_get session.id)"
MEMBERSHIP_COUNT="$(printf '%s' "$ME_RESPONSE" | node -e "const fs=require('fs'); const d=JSON.parse(fs.readFileSync(0,'utf8')); const list=Array.isArray(d.memberships)?d.memberships:(d.membership?[d.membership]:[]); process.stdout.write(String(list.length));")"
echo "✅ auth/me OK (tenant: ${CURRENT_TENANT}, role: ${CURRENT_ROLE}, memberships: ${MEMBERSHIP_COUNT})"

SESSIONS_ME_RESPONSE="$(curl -s "$BASE_URL/api/v1/auth/sessions?scope=me&includeRevoked=0&limit=20" \
  -H "Authorization: Bearer $TOKEN")"
SESSIONS_ME_COUNT="$(printf '%s' "$SESSIONS_ME_RESPONSE" | json_get count)"
echo "✅ auth/sessions me OK (count: ${SESSIONS_ME_COUNT})"

if [[ "$CURRENT_ROLE" == "OWNER" ]]; then
  SESSIONS_TENANT_RESPONSE="$(curl -s "$BASE_URL/api/v1/auth/sessions?scope=tenant&includeRevoked=0&limit=20" \
    -H "Authorization: Bearer $TOKEN")"
  SESSIONS_TENANT_COUNT="$(printf '%s' "$SESSIONS_TENANT_RESPONSE" | json_get count)"
  echo "✅ auth/sessions tenant OK (count: ${SESSIONS_TENANT_COUNT})"

  SECOND_LOGIN_RESPONSE="$(curl -s -X POST "$BASE_URL/api/v1/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"tenantId\":\"$CURRENT_TENANT\"}")"
  SECOND_TOKEN="$(printf '%s' "$SECOND_LOGIN_RESPONSE" | json_get token)"
  SECOND_ME_RESPONSE="$(curl -s "$BASE_URL/api/v1/auth/me" \
    -H "Authorization: Bearer $SECOND_TOKEN")"
  SECOND_SESSION_ID="$(printf '%s' "$SECOND_ME_RESPONSE" | json_get session.id)"
  if [[ -z "$SECOND_SESSION_ID" || "$SECOND_SESSION_ID" == "$CURRENT_SESSION_ID" ]]; then
    echo "❌ Kunde inte skapa separat session för revoke-test."
    exit 1
  fi

  SESSIONS_REVOKE_RESPONSE="$(curl -s -X POST "$BASE_URL/api/v1/auth/sessions/$SECOND_SESSION_ID/revoke" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"reason":"smoke_revoke_secondary_session"}')"
  REVOKED_FLAG="$(printf '%s' "$SESSIONS_REVOKE_RESPONSE" | json_get revoked)"
  echo "✅ auth/sessions revoke OK (revoked: ${REVOKED_FLAG})"
fi

TENANTS_MY_RESPONSE="$(curl -s "$BASE_URL/api/v1/tenants/my" \
  -H "Authorization: Bearer $TOKEN")"
TENANTS_MY_COUNT="$(printf '%s' "$TENANTS_MY_RESPONSE" | json_get count)"
echo "✅ tenants/my OK (count: ${TENANTS_MY_COUNT})"

if [[ "${MEMBERSHIP_COUNT}" -gt 1 ]]; then
  ALT_TENANT_ID="$(printf '%s' "$ME_RESPONSE" | node -e "const fs=require('fs'); const d=JSON.parse(fs.readFileSync(0,'utf8')); const list=Array.isArray(d.memberships)?d.memberships:[]; const current=d?.membership?.tenantId||''; const alt=(list.find((item)=>item?.tenantId&&item.tenantId!==current)||{}).tenantId||''; process.stdout.write(String(alt));")"
  if [[ -n "${ALT_TENANT_ID}" ]]; then
    SWITCH_RESPONSE="$(curl -s -X POST "$BASE_URL/api/v1/auth/switch-tenant" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      -d "{\"tenantId\":\"${ALT_TENANT_ID}\"}")"
    TOKEN="$(printf '%s' "$SWITCH_RESPONSE" | json_get token)"
    SWITCHED_TENANT="$(printf '%s' "$SWITCH_RESPONSE" | json_get membership.tenantId)"
    echo "✅ auth/switch-tenant OK (nu: ${SWITCHED_TENANT})"

    SWITCH_BACK_RESPONSE="$(curl -s -X POST "$BASE_URL/api/v1/auth/switch-tenant" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      -d "{\"tenantId\":\"${CURRENT_TENANT}\"}")"
    TOKEN="$(printf '%s' "$SWITCH_BACK_RESPONSE" | json_get token)"
    SWITCH_BACK_TENANT="$(printf '%s' "$SWITCH_BACK_RESPONSE" | json_get membership.tenantId)"
    echo "✅ auth/switch-tenant restore OK (tillbaka: ${SWITCH_BACK_TENANT})"
  fi
fi

MONITOR_RESPONSE="$(curl -s "$BASE_URL/api/v1/monitor/status" \
  -H "Authorization: Bearer $TOKEN")"
MONITOR_TEMPLATES="$(printf '%s' "$MONITOR_RESPONSE" | json_get kpis.templatesTotal)"
echo "✅ monitor/status OK (templates: ${MONITOR_TEMPLATES})"

if [[ "$CURRENT_ROLE" == "OWNER" ]]; then
  OPS_MANIFEST_RESPONSE="$(curl -s "$BASE_URL/api/v1/ops/state/manifest" \
    -H "Authorization: Bearer $TOKEN")"
  OPS_MANIFEST_COUNT="$(printf '%s' "$OPS_MANIFEST_RESPONSE" | json_get stores | node -e "const fs=require('fs'); const d=JSON.parse(fs.readFileSync(0,'utf8')); process.stdout.write(String(Array.isArray(d)?d.length:0));")"
  echo "✅ ops/state/manifest OK (stores: ${OPS_MANIFEST_COUNT})"

  OPS_BACKUP_CREATE_RESPONSE="$(curl -s -X POST "$BASE_URL/api/v1/ops/state/backup" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{}')"
  OPS_BACKUP_FILE="$(printf '%s' "$OPS_BACKUP_CREATE_RESPONSE" | json_get backup.fileName)"
  echo "✅ ops/state/backup OK (file: ${OPS_BACKUP_FILE})"

  OPS_BACKUPS_RESPONSE="$(curl -s "$BASE_URL/api/v1/ops/state/backups?limit=5" \
    -H "Authorization: Bearer $TOKEN")"
  OPS_BACKUPS_COUNT="$(printf '%s' "$OPS_BACKUPS_RESPONSE" | json_get count)"
  echo "✅ ops/state/backups OK (count: ${OPS_BACKUPS_COUNT})"

  OPS_PRUNE_PREVIEW_RESPONSE="$(curl -s -X POST "$BASE_URL/api/v1/ops/state/backups/prune" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"dryRun":true}')"
  OPS_PRUNE_PREVIEW_COUNT="$(printf '%s' "$OPS_PRUNE_PREVIEW_RESPONSE" | json_get deletedCount)"
  echo "✅ ops/state/backups/prune preview OK (deleted: ${OPS_PRUNE_PREVIEW_COUNT})"

  OPS_RESTORE_PREVIEW_RESPONSE="$(curl -s -X POST "$BASE_URL/api/v1/ops/state/restore" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"fileName\":\"${OPS_BACKUP_FILE}\",\"dryRun\":true}")"
  OPS_RESTORE_PREVIEW_COUNT="$(printf '%s' "$OPS_RESTORE_PREVIEW_RESPONSE" | json_get preview.stores | node -e "const fs=require('fs'); const d=JSON.parse(fs.readFileSync(0,'utf8')); process.stdout.write(String(Array.isArray(d)?d.filter((row)=>row&&row.willRestore).length:0));")"
  echo "✅ ops/state/restore preview OK (willRestore: ${OPS_RESTORE_PREVIEW_COUNT})"
fi

META_RESPONSE="$(curl -s "$BASE_URL/api/v1/templates/meta" \
  -H "Authorization: Bearer $TOKEN")"
CATEGORY_COUNT="$(printf '%s' "$META_RESPONSE" | json_get categories | node -e "const fs=require('fs'); const d=JSON.parse(fs.readFileSync(0,'utf8')); process.stdout.write(String(Array.isArray(d)?d.length:0));")"
echo "✅ templates/meta OK (kategorier: $CATEGORY_COUNT)"

RISK_SETTINGS_RESPONSE="$(curl -s "$BASE_URL/api/v1/risk/settings" \
  -H "Authorization: Bearer $TOKEN")"
RISK_MODIFIER="$(printf '%s' "$RISK_SETTINGS_RESPONSE" | json_get settings.riskSensitivityModifier)"
echo "✅ risk/settings OK (modifier: ${RISK_MODIFIER})"

POLICY_FLOOR_RESPONSE="$(curl -s "$BASE_URL/api/v1/policy/floor" \
  -H "Authorization: Bearer $TOKEN")"
POLICY_RULE_COUNT="$(printf '%s' "$POLICY_FLOOR_RESPONSE" | json_get policyFloor.rules | node -e "const fs=require('fs'); const d=JSON.parse(fs.readFileSync(0,'utf8')); process.stdout.write(String(Array.isArray(d)?d.length:0));")"
echo "✅ policy/floor OK (rules: ${POLICY_RULE_COUNT})"

TEMPLATE_NAME="Smoke mall $(date +%s)"
CREATE_RESPONSE="$(curl -s -X POST "$BASE_URL/api/v1/templates" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"category\":\"CONSULTATION\",\"name\":\"$TEMPLATE_NAME\",\"channel\":\"email\",\"locale\":\"sv-SE\"}")"
TEMPLATE_ID="$(printf '%s' "$CREATE_RESPONSE" | json_get template.id)"
echo "✅ template skapad ($TEMPLATE_ID)"

DRAFT_RESPONSE="$(curl -s -X POST "$BASE_URL/api/v1/templates/$TEMPLATE_ID/drafts/generate" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"instruction":"Skriv en vänlig konsultationsbekräftelse med variabel {{patient_name}}."}')"
VERSION_ID="$(printf '%s' "$DRAFT_RESPONSE" | json_get version.id)"
GEN_PROVIDER="$(printf '%s' "$DRAFT_RESPONSE" | json_get generation.provider || true)"
echo "✅ draft genererad ($VERSION_ID, provider: ${GEN_PROVIDER:-unknown})"

UPDATED_CONTENT="Hej {{patient_name}}, detta är en uppdaterad konsultationsbekräftelse från {{clinic_name}}."
UPDATE_RESPONSE="$(curl -s -X PATCH "$BASE_URL/api/v1/templates/$TEMPLATE_ID/versions/$VERSION_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"title\":\"Smoke uppdaterad version\",\"content\":\"$UPDATED_CONTENT\",\"instruction\":\"Uppdatera tonen men behåll kliniskt säkra formuleringar.\"}")"
UPDATED_VERSION_ID="$(printf '%s' "$UPDATE_RESPONSE" | json_get version.id)"
UPDATED_DECISION="$(printf '%s' "$UPDATE_RESPONSE" | json_get version.risk.decision)"
echo "✅ update_draft OK (${UPDATED_VERSION_ID}, decision: ${UPDATED_DECISION})"

EVALUATE_RESPONSE="$(curl -s -X POST "$BASE_URL/api/v1/templates/$TEMPLATE_ID/versions/$VERSION_ID/evaluate" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}')"
RISK_LEVEL="$(printf '%s' "$EVALUATE_RESPONSE" | json_get version.risk.riskLevel)"
RISK_DECISION="$(printf '%s' "$EVALUATE_RESPONSE" | json_get version.risk.decision)"
echo "✅ evaluate OK (risk: ${RISK_LEVEL}, decision: ${RISK_DECISION})"

RISK_RESPONSE="$(curl -s "$BASE_URL/api/v1/risk/evaluations?minRiskLevel=1&limit=5&templateId=$TEMPLATE_ID&templateVersionId=$VERSION_ID" \
  -H "Authorization: Bearer $TOKEN")"
RISK_COUNT="$(printf '%s' "$RISK_RESPONSE" | json_get count)"
echo "✅ risk/evaluations OK (count: ${RISK_COUNT})"

EVALUATION_ID="$(printf '%s' "$RISK_RESPONSE" | node -e "const fs=require('fs'); const d=JSON.parse(fs.readFileSync(0,'utf8')); process.stdout.write(String(d?.evaluations?.[0]?.id||''));")"
if [[ "$RISK_DECISION" != "allow" && -n "$EVALUATION_ID" ]]; then
  PRE_ACT_OWNER_ACTION="$(curl -s -X POST "$BASE_URL/api/v1/risk/evaluations/$EVALUATION_ID/owner-action" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"action":"approve_exception","note":"Smoke test activation gate override."}')"
  PRE_ACT_OWNER_DECISION="$(printf '%s' "$PRE_ACT_OWNER_ACTION" | json_get evaluation.ownerDecision)"
  echo "✅ pre-activate owner-action OK (decision: ${PRE_ACT_OWNER_DECISION})"
fi

ACTIVATE_RESPONSE="$(curl -s -X POST "$BASE_URL/api/v1/templates/$TEMPLATE_ID/versions/$VERSION_ID/activate" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}')"
STATUS="$(printf '%s' "$ACTIVATE_RESPONSE" | json_get version.state)"
echo "✅ activate OK (state: ${STATUS})"

if [[ -n "$EVALUATION_ID" ]]; then
  OWNER_ACTION_RESPONSE="$(curl -s -X POST "$BASE_URL/api/v1/risk/evaluations/$EVALUATION_ID/owner-action" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"action":"request_revision","note":"Smoke test owner action."}')"
  OWNER_DECISION="$(printf '%s' "$OWNER_ACTION_RESPONSE" | json_get evaluation.ownerDecision)"
  echo "✅ owner-action OK (decision: ${OWNER_DECISION})"
fi

PREVIEW_RESPONSE="$(curl -s -X POST "$BASE_URL/api/v1/risk/preview" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"category":"CONSULTATION","scope":"output","content":"Detta är en trygg konsultationsbekräftelse för {{clinic_name}} med variabel {{first_name}}.","variables":["clinic_name","first_name"]}')"
PREVIEW_LEVEL="$(printf '%s' "$PREVIEW_RESPONSE" | json_get evaluation.riskLevel)"
echo "✅ risk/preview OK (riskLevel: ${PREVIEW_LEVEL})"

CALIBRATION_SUGGESTION_RESPONSE="$(curl -s "$BASE_URL/api/v1/risk/calibration/suggestion" \
  -H "Authorization: Bearer $TOKEN")"
SUGGESTED_MODIFIER="$(printf '%s' "$CALIBRATION_SUGGESTION_RESPONSE" | json_get suggestion.suggestedModifier)"
echo "✅ risk/calibration/suggestion OK (suggestedModifier: ${SUGGESTED_MODIFIER})"

CALIBRATION_APPLY_RESPONSE="$(curl -s -X POST "$BASE_URL/api/v1/risk/calibration/apply-suggestion" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"suggestedModifier\":${SUGGESTED_MODIFIER},\"note\":\"Smoke test apply suggestion\"}")"
APPLIED_MODIFIER="$(printf '%s' "$CALIBRATION_APPLY_RESPONSE" | json_get settings.riskSensitivityModifier)"
echo "✅ risk/calibration/apply-suggestion OK (applied: ${APPLIED_MODIFIER})"

RESTORE_MODIFIER_RESPONSE="$(curl -s -X PATCH "$BASE_URL/api/v1/risk/settings" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"riskSensitivityModifier\":${RISK_MODIFIER}}")"
RESTORED_MODIFIER="$(printf '%s' "$RESTORE_MODIFIER_RESPONSE" | json_get settings.riskSensitivityModifier)"
echo "✅ risk/settings restore OK (modifier: ${RESTORED_MODIFIER})"

ORCHESTRATOR_META_RESPONSE="$(curl -s "$BASE_URL/api/v1/orchestrator/meta" \
  -H "Authorization: Bearer $TOKEN")"
ORCHESTRATOR_AGENT_COUNT="$(printf '%s' "$ORCHESTRATOR_META_RESPONSE" | json_get agents | node -e "const fs=require('fs'); const d=JSON.parse(fs.readFileSync(0,'utf8')); process.stdout.write(String(d&&typeof d==='object'?Object.keys(d).length:0));")"
echo "✅ orchestrator/meta OK (agents: ${ORCHESTRATOR_AGENT_COUNT})"

ORCHESTRATOR_RUN_RESPONSE="$(curl -s -X POST "$BASE_URL/api/v1/orchestrator/admin-run" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"prompt":"Granska riskläget och föreslå owner actions för high/critical idag."}')"
ORCHESTRATOR_INTENT="$(printf '%s' "$ORCHESTRATOR_RUN_RESPONSE" | json_get intent)"
echo "✅ orchestrator/admin-run OK (intent: ${ORCHESTRATOR_INTENT})"

REPORT_RESPONSE="$(curl -s "$BASE_URL/api/v1/reports/pilot?days=14" \
  -H "Authorization: Bearer $TOKEN")"
REPORT_EVALS="$(printf '%s' "$REPORT_RESPONSE" | json_get kpis.evaluationsTotal)"
echo "✅ reports/pilot OK (evaluations: ${REPORT_EVALS})"

MAIL_INSIGHTS_RESPONSE="$(curl -s "$BASE_URL/api/v1/mail/insights" \
  -H "Authorization: Bearer $TOKEN")"
MAIL_READY="$(printf '%s' "$MAIL_INSIGHTS_RESPONSE" | json_get ready)"
MAIL_QA_PAIRS="$(printf '%s' "$MAIL_INSIGHTS_RESPONSE" | node -e "const fs=require('fs'); const d=JSON.parse(fs.readFileSync(0,'utf8')); const v=d?.report?.counts?.qaPairs; process.stdout.write(String(Number.isFinite(Number(v))?Number(v):0));")"
echo "✅ mail/insights OK (ready: ${MAIL_READY}, qaPairs: ${MAIL_QA_PAIRS})"

if [[ "$CURRENT_ROLE" == "OWNER" ]]; then
  MAIL_SEED_PREVIEW_RESPONSE="$(curl -s -X POST "$BASE_URL/api/v1/mail/template-seeds/apply" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"dryRun":true,"limit":2}')"
  if MAIL_SEED_PREVIEW_SELECTED="$(printf '%s' "$MAIL_SEED_PREVIEW_RESPONSE" | json_get selected 2>/dev/null)"; then
    echo "✅ mail/template-seeds/apply preview OK (selected: ${MAIL_SEED_PREVIEW_SELECTED})"
  else
    MAIL_SEED_PREVIEW_ERROR="$(printf '%s' "$MAIL_SEED_PREVIEW_RESPONSE" | json_get error 2>/dev/null || true)"
    if [[ "$MAIL_SEED_PREVIEW_ERROR" == *"Hittade inga template seeds"* ]]; then
      echo "ℹ️ mail/template-seeds/apply preview SKIP (${MAIL_SEED_PREVIEW_ERROR})"
    else
      echo "❌ mail/template-seeds/apply preview misslyckades"
      printf '%s\n' "$MAIL_SEED_PREVIEW_RESPONSE"
      exit 1
    fi
  fi
else
  echo "ℹ️ mail/template-seeds/apply preview SKIP (ej OWNER)"
fi

SUMMARY_RESPONSE="$(curl -s "$BASE_URL/api/v1/risk/summary?minRiskLevel=1" \
  -H "Authorization: Bearer $TOKEN")"
SUMMARY_TOTAL="$(printf '%s' "$SUMMARY_RESPONSE" | json_get totals.evaluations)"
echo "✅ risk/summary OK (evaluations: ${SUMMARY_TOTAL})"
echo
echo "🎯 Smoke test klart."
