#!/usr/bin/env node
'use strict';

/**
 * Seed Demo Tenant — skapar en demo-tenant med pre-populerad data.
 *
 * Användning:
 *   node scripts/seed-demo-tenant.js
 *   node scripts/seed-demo-tenant.js --reset  (raderar + återskapar)
 *
 * Kräver: servern kör på PORT (default 3000)
 */

const DEMO_TENANT_ID = 'demo-clinic';
const DEMO_OWNER_EMAIL = 'demo@arcana.se';
const DEMO_OWNER_PASSWORD = 'DemoArcana2026!';
const BASE_URL = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;

const DEMO_TEMPLATES = [
  { name: 'Bokningsbekräftelse', category: 'BOOKING', channel: 'email' },
  { name: 'Konsultationsuppföljning', category: 'CONSULTATION', channel: 'email' },
  { name: 'Eftervård vecka 1', category: 'AFTERCARE', channel: 'email' },
  { name: 'Välkommen ny patient', category: 'LEAD', channel: 'email' },
  { name: 'PRP-serie påminnelse', category: 'BOOKING', channel: 'email' },
  { name: 'Intern anteckning — behandlingsplan', category: 'INTERNAL', channel: 'email' },
  { name: 'Prisförfrågan svar', category: 'CONSULTATION', channel: 'email' },
  { name: 'Ombokningsbekräftelse', category: 'BOOKING', channel: 'email' },
  { name: 'Resultatuppföljning 6 månader', category: 'AFTERCARE', channel: 'email' },
  { name: 'Microneedling eftervård', category: 'AFTERCARE', channel: 'email' },
];

async function apiRequest(path, { method = 'GET', body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { raw: text, status: res.status }; }
}

async function main() {
  const reset = process.argv.includes('--reset');
  console.log(`[seed-demo] Seedar demo-tenant: ${DEMO_TENANT_ID}`);
  console.log(`[seed-demo] Base URL: ${BASE_URL}`);

  // 1. Login som owner (hair-tp-clinic) för att skapa demo-tenant
  const login = await apiRequest('/api/v1/auth/login', {
    method: 'POST',
    body: {
      email: process.env.ARCANA_OWNER_EMAIL || 'owner@hairtpclinic.se',
      password: process.env.ARCANA_OWNER_PASSWORD || 'ArcanaPilot!2026',
      tenantId: process.env.ARCANA_DEFAULT_TENANT || 'hair-tp-clinic',
    },
  });
  if (!login.token) {
    console.error('[seed-demo] Login misslyckades:', login);
    process.exit(1);
  }
  const ownerToken = login.token;
  console.log('[seed-demo] Inloggad som owner.');

  // 2. Onboarda demo-tenant
  const onboard = await apiRequest('/api/v1/tenants/onboard', {
    method: 'POST',
    token: ownerToken,
    body: {
      tenantId: DEMO_TENANT_ID,
      ownerEmail: DEMO_OWNER_EMAIL,
      ownerPassword: DEMO_OWNER_PASSWORD,
    },
  });
  if (onboard.error && !onboard.error.includes('redan')) {
    console.log('[seed-demo] Onboard:', onboard.error || 'OK');
  } else {
    console.log('[seed-demo] Demo-tenant onboardad.');
  }

  // 3. Login som demo-tenant
  const demoLogin = await apiRequest('/api/v1/auth/login', {
    method: 'POST',
    body: {
      email: DEMO_OWNER_EMAIL,
      password: DEMO_OWNER_PASSWORD,
      tenantId: DEMO_TENANT_ID,
    },
  });
  if (!demoLogin.token) {
    console.error('[seed-demo] Demo-login misslyckades:', demoLogin);
    process.exit(1);
  }
  const demoToken = demoLogin.token;
  console.log('[seed-demo] Inloggad som demo-tenant.');

  // 4. Skapa mallar
  let created = 0;
  for (const tmpl of DEMO_TEMPLATES) {
    const res = await apiRequest('/api/v1/templates', {
      method: 'POST',
      token: demoToken,
      body: { ...tmpl, language: 'sv' },
    });
    if (res.template) {
      created++;
      // Generera draft
      await apiRequest(`/api/v1/templates/${res.template.id}/drafts/generate`, {
        method: 'POST',
        token: demoToken,
        body: { variables: { first_name: 'Demo Patient', clinic_name: 'Demo Klinik' } },
      });
    }
  }
  console.log(`[seed-demo] ${created}/${DEMO_TEMPLATES.length} mallar skapade + drafts genererade.`);

  // 5. Kör agenter
  const cooResult = await apiRequest('/api/v1/agents/COO/run', { method: 'POST', token: demoToken, body: {} });
  console.log('[seed-demo] COO daily brief:', cooResult?.output?.data?.priorityLevel || 'ok');

  const caoResult = await apiRequest('/api/v1/agents/CAO/run', { method: 'POST', token: demoToken, body: {} });
  console.log('[seed-demo] CAO advisor:', (caoResult?.output?.data?.disclaimerResults?.totalCount || 0) + ' mallar analyserade');

  // 6. Knowledge
  await apiRequest('/api/v1/knowledge/documents', {
    method: 'POST',
    token: demoToken,
    body: {
      title: 'Hårtransplantation — DHI-metoden',
      content: 'DHI-metoden (Direct Hair Implantation) innebär att hårfolliklar transplanteras direkt med en Choi-penna utan att först skapa mottagarkanaler.\n\nFördelar:\n- Minimal ärrtid\n- Naturligt resultat\n- Ingen rakning av hela huvudet\n\nBehandlingstid: 4-8 timmar beroende på antal grafter.\nPris: från 45 000 kr.',
      category: 'treatment',
    },
  });
  await apiRequest('/api/v1/knowledge/documents', {
    method: 'POST',
    token: demoToken,
    body: {
      title: 'PRP-behandling',
      content: 'PRP (Platelet-Rich Plasma) är en behandling som stimulerar hårtillväxt genom att använda patientens eget blod.\n\nProcedur:\n1. Blodprov tas\n2. Plasma separeras i centrifug\n3. Injiceras i hårbotten\n\nBehandlingsintervall: 3 sessioner med 4 veckors mellanrum.\nPris: 4 500 kr per session, paket 3 sessioner 11 000 kr.',
      category: 'treatment',
    },
  });
  await apiRequest('/api/v1/knowledge/documents', {
    method: 'POST',
    token: demoToken,
    body: {
      title: 'Vanliga frågor — Konsultation',
      content: 'Hur lång tid tar konsultationen?\n→ 30 minuter online eller på klinik.\n\nKostar det något?\n→ Nej, konsultationen är kostnadsfri.\n\nVad behöver jag förbereda?\n→ Foton från 4 vinklar (front, ovanifrån, vänster, höger).\n\nKan jag boka online?\n→ Ja, vi erbjuder videokonsultation med vår läkare.',
      category: 'faq',
    },
  });
  console.log('[seed-demo] 3 kunskapsdokument skapade.');

  console.log('\n[seed-demo] ✅ Demo-tenant klar!');
  console.log(`  Login: ${DEMO_OWNER_EMAIL} / ${DEMO_OWNER_PASSWORD}`);
  console.log(`  Tenant: ${DEMO_TENANT_ID}`);
  console.log(`  Mallar: ${created}`);
  console.log(`  Knowledge: 3 dokument`);
}

main().catch((err) => {
  console.error('[seed-demo] Fatal:', err);
  process.exit(1);
});
