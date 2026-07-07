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
