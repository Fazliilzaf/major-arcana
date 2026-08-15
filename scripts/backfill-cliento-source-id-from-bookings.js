'use strict';

const fs = require('node:fs');
const { createClientoBookingLookup } = require('./lib/clientoBookingLookup');

function printUsage() {
  process.stderr.write(`Usage: node scripts/backfill-cliento-source-id-from-bookings.js [options]

Options:
  --patients-store <path>   Path to cco-patient-master.json (default: /var/data/cco-patient-master.json)
  --bookings-csv <path>     Path to Cliento booking export CSV (default: /tmp/cliento-bookings-2019-2026.csv)
  --tenant <id>             Tenant to process (default: hair-tp-clinic)
  --commit                  Write changes back to the patient store. Without this, a dry-run is performed.
  --help                    Show this help
`);
}

function parseArgs(argv) {
  const args = {
    patientsStore: '/var/data/cco-patient-master.json',
    bookingsCsv: '/tmp/cliento-bookings-2019-2026.csv',
    tenant: 'hair-tp-clinic',
    commit: false,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help') {
      printUsage();
      process.exit(0);
    }
    if (arg === '--commit') {
      args.commit = true;
      continue;
    }
    if (arg === '--patients-store' || arg === '--bookings-csv' || arg === '--tenant') {
      const value = argv[i + 1];
      if (!value) throw new Error(`Missing value for ${arg}`);
      const key = arg.replace(/^--/, '').replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      args[key] = value;
      i += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function main() {
  const args = parseArgs(process.argv);

  if (!fs.existsSync(args.bookingsCsv)) {
    throw new Error(`Bokningsexporten saknas: ${args.bookingsCsv}`);
  }
  if (!fs.existsSync(args.patientsStore)) {
    throw new Error(`Patientfilen saknas: ${args.patientsStore}`);
  }

  const bookingsText = fs.readFileSync(args.bookingsCsv, 'utf8');
  const lookup = createClientoBookingLookup(bookingsText, { debug: true });

  const data = JSON.parse(fs.readFileSync(args.patientsStore, 'utf8'));
  const tenant = data.tenants?.[args.tenant];
  if (!tenant) {
    throw new Error(`Tenant ${args.tenant} hittades inte i patientfilen.`);
  }
  const patients = asArray(tenant.patients);

  let matchedByEmail = 0;
  let matchedByPhone = 0;
  let matchedByName = 0;
  let unmatched = 0;
  let alreadyHasSourceId = 0;
  let conflict = 0;
  const changes = [];
  const uniqueIds = new Set();

  for (const patient of patients) {
    const cliento = asObject(patient.cliento);
    if (cliento.sourceId) {
      alreadyHasSourceId += 1;
      continue;
    }

    const record = {
      primaryEmail: patient.primaryEmail,
      emails: asArray(patient.emails),
      primaryPhone: patient.primaryPhone,
      phones: asArray(patient.phones),
      name: patient.displayName || cliento.name,
    };

    const result = lookup.resolveCustomerId(record);
    if (!result) {
      unmatched += 1;
      continue;
    }

    if (cliento.sourceId && String(cliento.sourceId) !== String(result.customerId)) {
      conflict += 1;
      console.log(
        'conflict:',
        patient.id,
        patient.displayName,
        'existing:',
        cliento.sourceId,
        'proposed:',
        result.customerId
      );
      continue;
    }

    if (result.method === 'email') matchedByEmail += 1;
    if (result.method === 'phone') matchedByPhone += 1;
    if (result.method === 'name') matchedByName += 1;
    uniqueIds.add(result.customerId);

    changes.push({
      id: patient.id,
      name: patient.displayName,
      method: result.method,
      customerId: result.customerId,
    });

    if (args.commit) {
      patient.cliento = { ...cliento, sourceId: result.customerId };
      patient.updatedAt = new Date().toISOString();
    }
  }

  console.log('--- backfill cliento.sourceId from booking export ---');
  console.log('mode:', args.commit ? 'commit' : 'dry-run');
  console.log('patients total:', patients.length);
  console.log('already has sourceId:', alreadyHasSourceId);
  console.log('matched by email:', matchedByEmail);
  console.log('matched by phone:', matchedByPhone);
  console.log('matched by name:', matchedByName);
  console.log('total matched:', matchedByEmail + matchedByPhone + matchedByName);
  console.log('unmatched:', unmatched);
  console.log('conflicts:', conflict);
  console.log('unique customer IDs assigned:', uniqueIds.size);
  console.log('sample changes:', changes.slice(0, 10));

  if (args.commit) {
    const backupPath = `${args.patientsStore}.pre-sourceid-backfill-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    fs.copyFileSync(args.patientsStore, backupPath);
    data.updatedAt = new Date().toISOString();
    fs.writeFileSync(args.patientsStore, JSON.stringify(data, null, 2));
    console.log('backup written:', backupPath);
    console.log('patient store updated:', args.patientsStore);
  }
}

main();
