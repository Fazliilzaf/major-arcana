#!/usr/bin/env node
'use strict';

const fs = require('fs');
const BASE_URL = process.env.BASE_URL || 'https://cfo.hairtpclinic.com';
const TOKEN = process.env.TOKEN || fs.readFileSync('/tmp/cfo_token.txt', 'utf8').trim();

const patches = {
  'Förbrukning: Alibaba': { conditions: [{ type: 'supplier_contains', value: 'alibaba' }] },
  'IT/SaaS: Render': { conditions: [{ type: 'supplier_contains', value: 'render' }] },
  'it_telefoni: Render Services, Inc dba Render': {
    conditions: [{ type: 'supplier_contains', value: 'render' }],
  },
  'Förbrukning: Netflix.com': { conditions: [{ type: 'supplier_contains', value: 'netflix' }] },
  'IT/SaaS: Google': { conditions: [{ type: 'supplier_contains', value: 'google' }] },
  'Resor: Kiwi.com': { conditions: [{ type: 'supplier_contains', value: 'kiwi' }] },
  'Resor: eDreams/Vacaciones': { conditions: [{ type: 'supplier_contains', value: 'edreams' }] },
  'Resor: b-rent/MyRentalCar': {
    conditions: [{ type: 'supplier_regex', pattern: 'b rent|myrentalcar|rentalcar' }],
  },
};

const newRules = [
  {
    name: 'Förbrukning: Amazon',
    conditions: [{ type: 'supplier_contains', value: 'amazon' }],
    setCategory: 'forbrukning',
    priority: 10,
  },
  {
    name: 'Förbrukning: Bellestore',
    conditions: [{ type: 'supplier_contains', value: 'bellestore' }],
    setCategory: 'forbrukning',
    priority: 10,
  },
  {
    name: 'Förbrukning: CH Nail Spa',
    conditions: [{ type: 'supplier_contains', value: 'ch nail spa' }],
    setCategory: 'forbrukning',
    priority: 10,
  },
  {
    name: 'Resor: DoYouItaly',
    conditions: [{ type: 'supplier_contains', value: 'doyouitaly' }],
    setCategory: 'resor',
    priority: 10,
  },
  {
    name: 'Resor: DoHop',
    conditions: [{ type: 'supplier_contains', value: 'dohop' }],
    setCategory: 'resor',
    priority: 10,
  },
  {
    name: 'IT/SaaS: CapCut',
    conditions: [{ type: 'supplier_contains', value: 'capcut' }],
    setCategory: 'it_telefoni',
    priority: 10,
  },
  {
    name: 'IT/SaaS: Black Forest Labs',
    conditions: [{ type: 'supplier_contains', value: 'black forest' }],
    setCategory: 'it_telefoni',
    priority: 10,
  },
  {
    name: 'Förbrukning: Coop Avenyn',
    conditions: [{ type: 'supplier_contains', value: 'coop' }],
    setCategory: 'forbrukning',
    priority: 10,
  },
  {
    name: 'Förbrukning: Apoteket Centralen',
    conditions: [{ type: 'supplier_contains', value: 'apoteket' }],
    setCategory: 'forbrukning',
    priority: 10,
  },
  {
    name: 'Förbrukning: Apotek Hjärtat',
    conditions: [{ type: 'supplier_contains', value: 'apotek hj' }],
    setCategory: 'forbrukning',
    priority: 10,
  },
  {
    name: 'Förbrukning: Newport Göteborg',
    conditions: [{ type: 'supplier_contains', value: 'newport' }],
    setCategory: 'forbrukning',
    priority: 10,
  },
  {
    name: 'Resor: British Airways / BA',
    conditions: [
      { type: 'supplier_contains', value: 'british airways' },
      { type: 'supplier_contains', value: 'ba high' },
    ],
    setCategory: 'resor',
    priority: 10,
  },
  {
    name: 'Förbrukning: BL Ltd',
    conditions: [{ type: 'supplier_contains', value: 'bl ltd' }],
    setCategory: 'forbrukning',
    priority: 10,
  },
  {
    name: 'Mat/Representation: Soho House (3CPayment)',
    conditions: [{ type: 'supplier_contains', value: 'soho house' }],
    setCategory: 'mat_representation',
    priority: 10,
  },
];

async function api(path, { method = 'GET', body = null } = {}) {
  const opts = {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE_URL}${path}`, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    throw new Error(`${method} ${path} → ${res.status}: ${data.error || JSON.stringify(data)}`);
  }
  return data;
}

async function main() {
  const existing = (await api('/api/v1/cco-cf/rules?limit=1000')).rules || [];
  const byName = new Map(existing.map((r) => [r.name, r]));
  let patched = 0;
  let created = 0;
  let errors = 0;

  for (const [name, patch] of Object.entries(patches)) {
    const r = byName.get(name);
    if (!r) {
      console.log(`⊘ patch: ${name} finns ej`);
      continue;
    }
    try {
      await api(`/api/v1/cco-cf/rules/${r.id}`, { method: 'PATCH', body: patch });
      patched++;
      console.log(`↻ ${name} uppdaterad`);
    } catch (err) {
      errors++;
      console.error(`✗ ${name}: ${err.message}`);
    }
  }

  for (const r of newRules) {
    if (byName.has(r.name)) {
      console.log(`⊘ ${r.name} finns redan`);
      continue;
    }
    try {
      await api('/api/v1/cco-cf/rules', { method: 'POST', body: r });
      created++;
      console.log(`✓ ${r.name} → ${r.setCategory}`);
    } catch (err) {
      errors++;
      console.error(`✗ ${r.name}: ${err.message}`);
    }
  }
  console.log(`\nUppdaterade: ${patched}, skapade: ${created}, fel: ${errors}`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
