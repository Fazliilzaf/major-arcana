'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const fsp = require('node:fs/promises');

const { createCcoBookingEngineStore } = require('../../src/ops/ccoBookingEngineStore');

/**
 * ORD-187 — en tjänst som tagits bort ur källan får inte leva kvar som
 * bokningsbar.
 *
 * HITTAT I PRODUKTION 2026-09-03. `curatiio-eyelid-surgery` låg kvar som aktiv
 * och PUBLIKT BOKNINGSBAR, med 28 000 kr på en post märkt "Ögonlocksplastik
 * (övre)". Övre kostar 24 000; 28 000 är nedre priset. Posten var en kringgång
 * som togs bort ur Curatiio-seeden redan i ORD-174.
 *
 * ATT TA BORT EN RAD UR SEEDEN RADERAR INGENTING. Katalogen är persistent
 * state. Mergen lägger till och uppdaterar men städar aldrig. Raden levde
 * alltså vidare månader efter att den togs bort ur källan — med fel pris,
 * bokningsbar av kund.
 *
 * Och ORD-177:s regel (ingrepp får inte bokas publikt) missade den: id:t står
 * inte i ordinationsfacit, så kravet blev `null`, och regeln stänger bara ett
 * BESLUTAT ja. En okänd tjänst föll mellan två skydd.
 *
 * Uppmätt i prod: sex föräldralösa tjänster. Fem meridiq-utkast redan
 * avstängda och ofarliga; en publik.
 */

async function medMotor(startState, run) {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'ord187-'));
  const filePath = path.join(dir, 'engine.json');
  try {
    if (startState) fs.writeFileSync(filePath, JSON.stringify(startState, null, 2));
    const store = await createCcoBookingEngineStore({ filePath });
    await run({ store, filePath, raa: JSON.parse(fs.readFileSync(filePath, 'utf8')) });
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
}

/** Ett state som liknar prod: dubbletten aktiv och publik. */
function stateMedDubblett(extra = {}) {
  return {
    version: 1,
    services: [
      {
        id: 'curatiio-eyelid-surgery',
        label: 'Ögonlocksplastik (övre)',
        durationMinutes: 90,
        active: true,
        publicBookable: true,
        brand: 'curatiio',
        catalogSource: 'curatiio_seed',
        pricing: { basePriceSek: 28000, currency: 'SEK' },
      },
    ],
    resources: [],
    availabilityRules: [],
    reservations: [],
    bookings: [],
    calendarBlocks: [],
    ...extra,
  };
}

test('dubbletten är RADERAD ur state, inte bara avstängd', async () => {
  // MUTATIONSTESTAT OCH RÄTTAT. Första versionen läste listServices(), som
  // filtrerar bort inaktiva. Den var grön även med raderingen helt bortkopplad
  // — skyddet stängde ju av raden ändå. Ett test som inte kan skilja "raderad"
  // från "avstängd" bevisar inte det det påstår.
  //
  // Därför råa state.services. Skillnaden spelar roll: en avstängd rad med
  // "Ögonlocksplastik (övre), 28 000 kr" är fortfarande något personalen måste
  // tolka varje gång katalogen öppnas.
  await medMotor(stateMedDubblett(), async ({ store }) => {
    assert.ok(
      !store._state.services.some((s) => s.id === 'curatiio-eyelid-surgery'),
      'raden ska vara raderad ur state'
    );
  });
});

test('den är inte publikt bokningsbar under vägen dit', async () => {
  // Även om raderingen skulle vägra (för att något pekar på tjänsten) ska den
  // aldrig gå att boka. Två skydd, inte ett.
  await medMotor(
    stateMedDubblett({
      bookings: [
        {
          bookingId: 'b1',
          tenantId: 't',
          conversationId: 'c',
          customerEmail: 'a@b.se',
          status: 'confirmed',
          slot: {
            slotId: 's1',
            serviceId: 'curatiio-eyelid-surgery',
            resourceId: 'arya',
            startsAt: '2030-01-01T09:00:00.000Z',
            endsAt: '2030-01-01T10:30:00.000Z',
          },
        },
      ],
    }),
    async ({ store }) => {
      const publika = (await store.listPublicServices()).map((s) => s.id);
      assert.ok(!publika.includes('curatiio-eyelid-surgery'), 'får inte gå att boka av kund');
    }
  );
});

test('raderingen VÄGRAR när en bokning pekar på tjänsten', async () => {
  // En bokning som pekar på en tjänst som inte finns är värre än en ful rad i
  // en lista. Att radera är oåterkalleligt; att stänga är inte det.
  await medMotor(
    stateMedDubblett({
      bookings: [
        {
          bookingId: 'b1',
          tenantId: 't',
          conversationId: 'c',
          customerEmail: 'a@b.se',
          status: 'confirmed',
          slot: {
            slotId: 's1',
            serviceId: 'curatiio-eyelid-surgery',
            resourceId: 'arya',
            startsAt: '2030-01-01T09:00:00.000Z',
            endsAt: '2030-01-01T10:30:00.000Z',
          },
        },
      ],
    }),
    async ({ store }) => {
      const alla = await store.listServices({ brand: '' });
      const kvar = (await store.getRuntimeCatalog?.())?.services || [];
      // Raden ska finnas kvar i state (inte raderad), men avstängd.
      const iState = store._state.services.find((s) => s.id === 'curatiio-eyelid-surgery');
      assert.ok(iState, 'raden ska INTE raderas när en bokning pekar på den');
      assert.equal(iState.active, false, 'men den ska vara avstängd');
      assert.equal(iState.publicBookable, false);
      assert.ok(!alla.some((s) => s.id === 'curatiio-eyelid-surgery'), 'och osynlig i katalogen');
      void kvar;
    }
  );
});

test('en okänd publik tjänst stängs av — det generella skyddet', async () => {
  // Kärnan i buggklassen: skyddet gäller den FARLIGA egenskapen, inte hela
  // posten. Publik bokningsbarhet kräver att id:t finns i en nuvarande källa.
  await medMotor(
    {
      version: 1,
      services: [
        {
          id: 'nagot-som-togs-bort',
          label: 'Gammal tjänst',
          durationMinutes: 60,
          active: true,
          publicBookable: true,
          pricing: { basePriceSek: 9999, currency: 'SEK' },
        },
      ],
      resources: [],
      availabilityRules: [],
      reservations: [],
      bookings: [],
      calendarBlocks: [],
    },
    async ({ store }) => {
      const post = store._state.services.find((s) => s.id === 'nagot-som-togs-bort');
      assert.ok(post, 'okända rader raderas inte — bara stängs');
      assert.equal(post.active, false);
      assert.equal(post.publicBookable, false);
      assert.equal(post.retiredReason, 'saknas_i_alla_kallor', 'skälet ska stå på raden');
      assert.ok(post.retiredAt, 'och när det hände');
    }
  );
});

test('inaktiva föräldralösa rader rörs inte — de är historik', async () => {
  // De fem legacy-meridiq-utkasten i prod är föräldralösa men redan avstängda.
  // Att stämpla om dem hade skrivit över historik utan att göra något säkrare.
  await medMotor(
    {
      version: 1,
      services: [
        {
          id: 'legacy-meridiq-8952',
          label: 'Gammalt utkast',
          durationMinutes: 60,
          active: false,
          publicBookable: false,
        },
      ],
      resources: [],
      availabilityRules: [],
      reservations: [],
      bookings: [],
      calendarBlocks: [],
    },
    async ({ store }) => {
      const post = store._state.services.find((s) => s.id === 'legacy-meridiq-8952');
      assert.ok(post);
      assert.equal(post.retiredReason, undefined, 'ingen omstämpling av redan avstängda rader');
    }
  );
});

test('legacy-tjänster är ALDRIG publika — det är därför skyddet inte når dem', async () => {
  // MUTATIONSTESTAT OCH OMSKRIVET. Först hade skyddet ett undantag för
  // legacy-*, med testet "legacy avvecklas inte". Det var grönt även med
  // undantaget borttaget — alltså bevisade det ingenting.
  //
  // Skälet: mergeDraftService tvingar publicBookable: false på varje
  // legacy-post som inte står i Plan A-registret, och registrets id:n är
  // arcanaServiceIds som `fue`, aldrig `legacy-*`. En legacy-tjänst kan
  // därför aldrig vara publik, och skyddet rör bara publika tjänster.
  //
  // Undantaget är borttaget. Den här testen mäter invarianten det byggde på,
  // så att den blir röd om någon gör en legacy-tjänst publik — då behövs
  // undantaget igen, och någon får ta ställning i stället för att upptäcka det
  // genom att fyrtiofem rader stängs av.
  await medMotor(null, async ({ store }) => {
    const legacyPublika = store._state.services
      .filter((s) => String(s.id).startsWith('legacy-'))
      .filter((s) => s.publicBookable === true)
      .map((s) => s.id);
    assert.deepEqual(legacyPublika, [], 'ingen legacy-tjänst får vara publik');
    assert.ok(
      store._state.services.filter((s) => String(s.id).startsWith('legacy-')).length > 20,
      'och det ska finnas gott om dem att mäta på'
    );
  });
});

test('de riktiga ögonlockstjänsterna står kvar med rätt priser', async () => {
  // Rättelsen får inte råka ta med sig behandlingen den skulle städa upp kring.
  await medMotor(stateMedDubblett(), async ({ store }) => {
    const perId = new Map((await store.listServices()).map((s) => [s.id, s]));
    assert.equal(perId.get('bleph-upper').pricing.basePriceSek, 24000, 'övre 24 000');
    assert.equal(perId.get('bleph-lower').pricing.basePriceSek, 28000, 'nedre 28 000');
    assert.equal(perId.get('bleph-combined').pricing.basePriceSek, 48000);
    assert.ok(
      (await store.listPublicServices()).some((s) => s.id === 'consultation-bleph'),
      'och vägen in är kvar öppen'
    );
  });
});
