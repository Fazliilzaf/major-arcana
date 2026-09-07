'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const approvals = require('../../public/staff-portal-approvals.js');

test('WP-010 DEL B: renderApprovalCardHtml visar agent/action/repo/filer + Godkänn/Avvisa', () => {
  const html = approvals.renderApprovalCardHtml({
    id: 'a1', agent: 'CMO', action: 'cmo.content.write_candidate', repoId: 'hairtpclinic-web',
    baseSha: 'd8731111f8794959dc134b24e9beeb287163adc7', actor: 'anna', changedFiles: ['index.md'],
    approvalClass: 'OWNER_APPROVAL', diffstat: 'index.md | 2 +-',
  });
  assert.match(html, /data-approval-id="a1"/);
  assert.match(html, /CMO/);
  assert.match(html, /cmo\.content\.write_candidate/);
  assert.match(html, /hairtpclinic-web/);
  assert.match(html, /index\.md/);
  assert.match(html, /OWNER_APPROVAL/);
  assert.match(html, /Godkänn/);
  assert.match(html, /Avvisa/);
});

test('WP-010 DEL B: renderShellHtml tom → tom-state; list → ett kort per approval', () => {
  assert.match(approvals.renderShellHtml([]), /Inga väntande godkännanden/);
  const html = approvals.renderShellHtml([{ id: 'a1' }, { id: 'a2' }]);
  assert.equal((html.match(/approval-card/g) || []).length, 2);
});
