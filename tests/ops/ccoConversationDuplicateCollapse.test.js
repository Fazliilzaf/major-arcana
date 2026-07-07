'use strict';

/* Identiska kopior av samma mail (t.ex. ett kontaktformulär som levererar samma
 * notis flera gånger till kons@) fälldes tidigare ut som separata meddelanden i
 * tråden ("3 st"). collapseDuplicateMessages fäller ihop dem till ETT meddelande
 * men bevarar spåret (duplicateCount + duplicates[] med när/var). Äkta separata
 * mail (olika Message-ID / innehåll) rörs inte. */

const test = require('node:test');
const assert = require('node:assert/strict');

const { collapseDuplicateMessages } = require('../../src/routes/ccoConversation');

test('fäller ihop tre kopior med samma Message-ID till ett, bevarar spåret', () => {
  const base = {
    from: 'Sami Bonyadi',
    dir: 'incoming',
    subject: 'Sami Bonyadi Kontaktformulär',
    bodyText: 'Jag tappar mycket hår pga mina dåliga gener.',
    internetMessageId: '<cf-sami-1@info.hairtpclinic.se>',
    mailboxAddress: 'kons@hairtpclinic.com',
    folderType: 'inbox',
  };
  const messages = [
    { ...base, time: '2026-04-14T12:11:01.000Z' },
    { ...base, time: '2026-04-14T12:11:02.000Z' },
    { ...base, time: '2026-04-14T12:11:03.000Z' },
  ];

  const collapsed = collapseDuplicateMessages(messages);

  assert.equal(collapsed.length, 1, 'tre kopior ska bli ett meddelande');
  assert.equal(collapsed[0].duplicateCount, 3);
  assert.equal(collapsed[0].duplicates.length, 3);
  assert.equal(collapsed[0].duplicates[0].mailboxAddress, 'kons@hairtpclinic.com');
  assert.equal(collapsed[0].duplicates[0].folderType, 'inbox');
  // Representanten är första förekomsten (ordning bevarad).
  assert.equal(collapsed[0].time, '2026-04-14T12:11:01.000Z');
});

test('utan Message-ID fälls identiskt innehåll/tid/mailbox ihop via signatur', () => {
  const base = {
    from: 'Sami Bonyadi',
    dir: 'incoming',
    subject: 'Kontaktformulär',
    bodyText: 'Samma kropp exakt.',
    mailboxAddress: 'kons@hairtpclinic.com',
    folderType: 'inbox',
    time: '2026-04-14T12:11:00.000Z',
  };
  const collapsed = collapseDuplicateMessages([{ ...base }, { ...base }]);
  assert.equal(collapsed.length, 1);
  assert.equal(collapsed[0].duplicateCount, 2);
});

test('tre formulär-sändningar med OLIKA Message-ID men identiskt innehåll fälls ihop', () => {
  // Det verkliga Sami-fallet: WordPress gör tre separata sändningar → tre olika
  // Message-ID, men samma avsändare/ämne/kropp och samma minut. Ska bli ett.
  const base = {
    from: 'Sami Bonyadi',
    dir: 'incoming',
    subject: 'Sami Bonyadi Kontaktformulär',
    bodyText: 'Jag tappar mycket hår pga mina dåliga gener. Medgavs: Jag godkänner.',
    mailboxAddress: 'kons@hairtpclinic.com',
    folderType: 'inbox',
  };
  const messages = [
    { ...base, internetMessageId: '<cf-1@info.hairtpclinic.se>', time: '2026-04-14T12:11:01.000Z' },
    { ...base, internetMessageId: '<cf-2@info.hairtpclinic.se>', time: '2026-04-14T12:11:02.000Z' },
    { ...base, internetMessageId: '<cf-3@info.hairtpclinic.se>', time: '2026-04-14T12:11:03.000Z' },
  ];

  const collapsed = collapseDuplicateMessages(messages);
  assert.equal(collapsed.length, 1, 'olika Message-ID men identiskt innehåll ska bli ett');
  assert.equal(collapsed[0].duplicateCount, 3);
});

test('två mail som är lika i början men skiljer sig senare fälls INTE ihop (missa ingen patientinfo)', () => {
  const shared = 'A'.repeat(500); // längre än 400 → tidigare trunkering hade slagit ihop dem
  const messages = [
    {
      from: 'Patient X',
      dir: 'incoming',
      subject: 'Kontaktformulär',
      bodyText: `${shared} Jag vill boka tid nästa vecka.`,
      internetMessageId: '<x-1@x>',
      mailboxAddress: 'kons@hairtpclinic.com',
      time: '2026-04-14T12:11:00.000Z',
    },
    {
      from: 'Patient X',
      dir: 'incoming',
      subject: 'Kontaktformulär',
      bodyText: `${shared} OBS: jag är allergisk mot lidokain.`,
      internetMessageId: '<x-2@x>',
      mailboxAddress: 'kons@hairtpclinic.com',
      time: '2026-04-14T12:11:00.000Z',
    },
  ];
  const collapsed = collapseDuplicateMessages(messages);
  assert.equal(collapsed.length, 2, 'olika slut (viktig info) får inte slås ihop');
});

test('äkta separata mail (olika Message-ID) fälls INTE ihop', () => {
  const messages = [
    {
      from: 'Sami',
      dir: 'incoming',
      subject: 'Fråga 1',
      bodyText: 'Första frågan.',
      internetMessageId: '<a@x>',
      mailboxAddress: 'kons@hairtpclinic.com',
      time: '2026-04-14T12:11:00.000Z',
    },
    {
      from: 'Sami',
      dir: 'incoming',
      subject: 'Fråga 2',
      bodyText: 'Andra, annan fråga.',
      internetMessageId: '<b@x>',
      mailboxAddress: 'kons@hairtpclinic.com',
      time: '2026-04-14T13:00:00.000Z',
    },
  ];
  const collapsed = collapseDuplicateMessages(messages);
  assert.equal(collapsed.length, 2);
  assert.equal(collapsed[0].duplicateCount, 1);
  assert.equal(collapsed[1].duplicateCount, 1);
});
