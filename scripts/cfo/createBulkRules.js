#!/usr/bin/env node
'use strict';

const fs = require('fs');
const BASE_URL = process.env.BASE_URL || 'https://cfo.hairtpclinic.com';
const TOKEN = process.env.TOKEN || fs.readFileSync('/tmp/cfo_token.txt', 'utf8').trim();

const newRules = [
  {
    name: 'Förbrukning: Hemköp',
    conditions: [{ type: 'supplier_contains', value: 'hemköp' }],
    setCategory: 'forbrukning',
    priority: 10,
  },
  {
    name: 'IT/SaaS: Apple',
    conditions: [{ type: 'supplier_contains', value: 'apple' }],
    setCategory: 'it_telefoni',
    priority: 10,
  },
  {
    name: 'IT/SaaS: Cursor',
    conditions: [{ type: 'supplier_contains', value: 'cursor' }],
    setCategory: 'it_telefoni',
    priority: 10,
  },
  {
    name: 'Förbrukning: NK (beauty/details/manlig/kids)',
    conditions: [{ type: 'supplier_contains', value: 'nk ' }],
    setCategory: 'forbrukning',
    priority: 10,
  },
  {
    name: 'Bank/finansiell: Årsavgift kontot',
    conditions: [{ type: 'supplier_contains', value: 'årsavgift' }],
    setCategory: 'bank_finansiell',
    priority: 10,
  },
  {
    name: 'Förbrukning: Faire',
    conditions: [{ type: 'supplier_contains', value: 'faire' }],
    setCategory: 'forbrukning',
    priority: 10,
  },
  {
    name: 'IT/SaaS: Rella',
    conditions: [{ type: 'supplier_contains', value: 'rella' }],
    setCategory: 'it_telefoni',
    priority: 10,
  },
  {
    name: 'Förbrukning: Clas Ohlson',
    conditions: [{ type: 'supplier_contains', value: 'clas ohlson' }],
    setCategory: 'forbrukning',
    priority: 10,
  },
  {
    name: 'IT/SaaS: Pipedrive',
    conditions: [{ type: 'supplier_contains', value: 'pipedrive' }],
    setCategory: 'it_telefoni',
    priority: 10,
  },
  {
    name: 'IT/SaaS: Adobe',
    conditions: [{ type: 'supplier_contains', value: 'adobe' }],
    setCategory: 'it_telefoni',
    priority: 10,
  },
  {
    name: 'Förbrukning: Netflix',
    conditions: [{ type: 'supplier_contains', value: 'netflix' }],
    setCategory: 'forbrukning',
    priority: 10,
  },
  {
    name: 'IT/SaaS: Render',
    conditions: [{ type: 'supplier_contains', value: 'render' }],
    setCategory: 'it_telefoni',
    priority: 10,
  },
  {
    name: 'IT/SaaS: Elevenlabs',
    conditions: [{ type: 'supplier_contains', value: 'elevenlabs' }],
    setCategory: 'it_telefoni',
    priority: 10,
  },
  {
    name: 'Förbrukning: Åhléns',
    conditions: [{ type: 'supplier_contains', value: 'åhl' }],
    setCategory: 'forbrukning',
    priority: 10,
  },
  {
    name: 'Förbrukning: David Gronte',
    conditions: [{ type: 'supplier_contains', value: 'david gronte' }],
    setCategory: 'forbrukning',
    priority: 10,
  },
  {
    name: 'Förbrukning: Bestseller',
    conditions: [{ type: 'supplier_contains', value: 'bestseller' }],
    setCategory: 'forbrukning',
    priority: 10,
  },
  {
    name: 'Förbrukning: Kjell & Co',
    conditions: [{ type: 'supplier_contains', value: 'kjell' }],
    setCategory: 'forbrukning',
    priority: 10,
  },
  {
    name: 'Förbrukning: Alibaba',
    conditions: [{ type: 'supplier_contains', value: 'alibaba' }],
    setCategory: 'forbrukning',
    priority: 10,
  },
  {
    name: 'IT/SaaS: Moonshot AI',
    conditions: [{ type: 'supplier_contains', value: 'moonshot' }],
    setCategory: 'it_telefoni',
    priority: 10,
  },
  {
    name: 'Resor: MyTrip',
    conditions: [{ type: 'supplier_contains', value: 'mytrip' }],
    setCategory: 'resor',
    priority: 10,
  },
  {
    name: 'Resor: eDreams/Vacaciones',
    conditions: [{ type: 'supplier_contains', value: 'edreams' }],
    setCategory: 'resor',
    priority: 10,
  },
  {
    name: 'Resor: b-rent/MyRentalCar',
    conditions: [{ type: 'supplier_regex', pattern: 'b rent|myrentalcar|rentalcar' }],
    setCategory: 'resor',
    priority: 10,
  },
  {
    name: 'Resor: Yotel',
    conditions: [{ type: 'supplier_contains', value: 'yotel' }],
    setCategory: 'resor',
    priority: 10,
  },
  {
    name: 'Resor: Trenitalia',
    conditions: [{ type: 'supplier_contains', value: 'trenitalia' }],
    setCategory: 'resor',
    priority: 10,
  },
  {
    name: 'Mat/Representation: Wolt',
    conditions: [{ type: 'supplier_contains', value: 'wolt' }],
    setCategory: 'mat_representation',
    priority: 10,
  },
  {
    name: 'Mat/Representation: Wokhouse Express',
    conditions: [{ type: 'supplier_contains', value: 'wokhouse' }],
    setCategory: 'mat_representation',
    priority: 10,
  },
  {
    name: 'Resor: Heathrow Express',
    conditions: [{ type: 'supplier_contains', value: 'heathrow express' }],
    setCategory: 'resor',
    priority: 10,
  },
  {
    name: 'Resor: Sheraton/Marriott',
    conditions: [
      { type: 'supplier_contains', value: 'sheraton' },
      { type: 'supplier_contains', value: 'marriott' },
    ],
    setCategory: 'resor',
    priority: 10,
  },
  {
    name: 'Förbrukning: Stadium',
    conditions: [{ type: 'supplier_contains', value: 'stadium' }],
    setCategory: 'forbrukning',
    priority: 10,
  },
  {
    name: 'Förbrukning: Panduro Hobby',
    conditions: [{ type: 'supplier_contains', value: 'panduro' }],
    setCategory: 'forbrukning',
    priority: 10,
  },
  {
    name: 'Förbrukning: Giglio.com',
    conditions: [{ type: 'supplier_contains', value: 'giglio' }],
    setCategory: 'forbrukning',
    priority: 10,
  },
  {
    name: 'Resor: Wizz Air / Gate Retail',
    conditions: [{ type: 'supplier_contains', value: 'wizz' }],
    setCategory: 'resor',
    priority: 10,
  },
  {
    name: 'Resor: Lot Polish Airlines',
    conditions: [{ type: 'supplier_contains', value: 'lot polish' }],
    setCategory: 'resor',
    priority: 10,
  },
  {
    name: 'Resor: Kiwi.com',
    conditions: [{ type: 'supplier_contains', value: 'kiwi' }],
    setCategory: 'resor',
    priority: 10,
  },
  {
    name: 'Förbrukning: Kamera Express',
    conditions: [{ type: 'supplier_contains', value: 'kamera express' }],
    setCategory: 'forbrukning',
    priority: 10,
  },
  {
    name: 'Förbrukning: Etsy',
    conditions: [{ type: 'supplier_contains', value: 'etsy' }],
    setCategory: 'forbrukning',
    priority: 10,
  },
  {
    name: 'Förbrukning: Magnussons Ur',
    conditions: [{ type: 'supplier_contains', value: 'magnussons' }],
    setCategory: 'forbrukning',
    priority: 10,
  },
  {
    name: 'Förbrukning: Gröna Boden',
    conditions: [{ type: 'supplier_contains', value: 'gröna boden' }],
    setCategory: 'forbrukning',
    priority: 10,
  },
  {
    name: 'Förbrukning: SP BKM Healthy',
    conditions: [{ type: 'supplier_contains', value: 'bkm' }],
    setCategory: 'forbrukning',
    priority: 10,
  },
  {
    name: 'Förbrukning: MER Sweden',
    conditions: [{ type: 'supplier_contains', value: 'mer sweden' }],
    setCategory: 'forbrukning',
    priority: 10,
  },
  {
    name: 'Förbrukning: Lagerhaus',
    conditions: [{ type: 'supplier_contains', value: 'lagerhaus' }],
    setCategory: 'forbrukning',
    priority: 10,
  },
  {
    name: 'Mat/Representation: Poldo e Gianna',
    conditions: [{ type: 'supplier_contains', value: 'poldo' }],
    setCategory: 'mat_representation',
    priority: 10,
  },
  {
    name: 'Mat/Representation: NybroGatan 38',
    conditions: [{ type: 'supplier_contains', value: 'nybrogatan' }],
    setCategory: 'mat_representation',
    priority: 10,
  },
  {
    name: 'Förbrukning: Pipo Europe',
    conditions: [{ type: 'supplier_contains', value: 'pipo' }],
    setCategory: 'forbrukning',
    priority: 10,
  },
  {
    name: 'Resor: British Airways',
    conditions: [{ type: 'supplier_contains', value: 'british airways' }],
    setCategory: 'resor',
    priority: 10,
  },
  {
    name: 'Resor: Svenska Resegruppen',
    conditions: [{ type: 'supplier_contains', value: 'svenska resegruppen' }],
    setCategory: 'resor',
    priority: 10,
  },
  {
    name: 'Resor: Napoli Centrale / Roma Termini',
    conditions: [{ type: 'supplier_regex', pattern: 'napoli centrale|roma termini' }],
    setCategory: 'resor',
    priority: 10,
  },
  {
    name: 'Resor: Rosati / Pantheon (turisttjaenster)',
    conditions: [{ type: 'supplier_regex', pattern: 'rosati|pantheon' }],
    setCategory: 'resor',
    priority: 10,
  },
  {
    name: 'IT/SaaS: Paddle / DataForSEO',
    conditions: [{ type: 'supplier_contains', value: 'dataforseo' }],
    setCategory: 'it_telefoni',
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
  const existingNames = new Set(existing.map((r) => r.name));
  let created = 0;
  let skipped = 0;
  for (const r of newRules) {
    if (existingNames.has(r.name)) {
      skipped++;
      console.log(`⊘ ${r.name} finns redan`);
      continue;
    }
    try {
      await api('/api/v1/cco-cf/rules', { method: 'POST', body: r });
      created++;
      console.log(`✓ ${r.name} → ${r.setCategory}`);
    } catch (err) {
      console.error(`✗ ${r.name}: ${err.message}`);
    }
  }
  console.log(`\nSkapade: ${created}, hoppade över: ${skipped}`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
