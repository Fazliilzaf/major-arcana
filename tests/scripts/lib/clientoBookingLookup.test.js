const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createClientoBookingLookup,
  parseClientoBookingsCsv,
} = require('../../../scripts/lib/clientoBookingLookup');

const csvHeader =
  '"Boknings-id","Bokningsreferens","Skapad tid","Starttid","Sluttid","Bokningens längd","Pris","Resurs-id","Resursnamn","Beskrivning","Paus efter","Bokningsanteckning","Bokningens pris","Pris från","Kund-id","Kundnamn","Bokad som","Kund (mobilnummer)","Kund (annat telefonnummer)","Kund e-post","Personnummer","Kund borttagen","Meddelande från kund","Kund skapad","Status","Källa","Källa (Avbokning)","Avbokad tid","Typ","Reservationstyp","Tidszon","Tjänste-id","Tjänstens namn","Tjänster (pris)","Tjänsten är pris från","Tjänst (Längd på tjänst)","Betalningsleverantör","Betalningsstatus","Betalt belopp","Betalningsreferens","Betald tid","Återbetalad tid","Anpassade fält","Attribut","Konto","Partner-id"';

function bookingRow({ id, customerId, name, email, phone, created }) {
  const cells = Array(45).fill('');
  cells[0] = id || '1';
  cells[2] = created || '2024-01-01 10:00';
  cells[14] = customerId;
  cells[15] = name;
  cells[17] = phone || '';
  cells[19] = email || '';
  cells[43] = 'Hair TP Clinic';
  return cells.join(',');
}

test('parseClientoBookingsCsv läser header och rader', () => {
  const csv = [csvHeader, bookingRow({ customerId: '123', name: 'A B', email: 'a@b.se' })].join(
    '\n'
  );
  const parsed = parseClientoBookingsCsv(csv);
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0]['Kund-id'], '123');
});

test('createClientoBookingLookup slår upp kund-id via e-post', () => {
  const csv = [
    csvHeader,
    bookingRow({ id: '1', customerId: '4040001', name: 'Anna Test', email: 'anna@example.com' }),
  ].join('\n');
  const lookup = createClientoBookingLookup(csv);
  const result = lookup.resolveCustomerId({
    primaryEmail: 'anna@example.com',
    emails: [],
    primaryPhone: '',
    phones: [],
    name: 'Anna Test',
  });
  assert.ok(result);
  assert.equal(result.customerId, '4040001');
  assert.equal(result.method, 'email');
});

test('createClientoBookingLookup slår upp kund-id via telefon', () => {
  const csv = [
    csvHeader,
    bookingRow({ id: '1', customerId: '4040002', name: 'Bertil Test', phone: '+46701234567' }),
  ].join('\n');
  const lookup = createClientoBookingLookup(csv);
  const result = lookup.resolveCustomerId({
    primaryEmail: '',
    emails: [],
    primaryPhone: '070-123 45 67',
    phones: [],
    name: 'Bertil Test',
  });
  assert.ok(result);
  assert.equal(result.customerId, '4040002');
  assert.equal(result.method, 'phone');
});

test('createClientoBookingLookup hanterar dubbla kund-id med flest förekomster', () => {
  const csv = [
    csvHeader,
    bookingRow({
      id: '1',
      customerId: '4040003',
      name: 'Cecilia Test',
      email: 'cecilia@example.com',
    }),
    bookingRow({
      id: '2',
      customerId: '4040004',
      name: 'Cecilia Test',
      email: 'cecilia@example.com',
    }),
    bookingRow({
      id: '3',
      customerId: '4040004',
      name: 'Cecilia Test',
      email: 'cecilia@example.com',
    }),
  ].join('\n');
  const lookup = createClientoBookingLookup(csv);
  const result = lookup.resolveCustomerId({
    primaryEmail: 'cecilia@example.com',
    emails: [],
    primaryPhone: '',
    phones: [],
    name: 'Cecilia Test',
  });
  assert.ok(result);
  assert.equal(result.customerId, '4040004');
});

test('createClientoBookingLookup returnerar null när inget matchar', () => {
  const csv = [csvHeader, bookingRow({ id: '1', customerId: '4040005', name: 'David Test' })].join(
    '\n'
  );
  const lookup = createClientoBookingLookup(csv);
  const result = lookup.resolveCustomerId({
    primaryEmail: 'nobody@example.com',
    emails: [],
    primaryPhone: '',
    phones: [],
    name: 'Unknown',
  });
  assert.equal(result, null);
});
