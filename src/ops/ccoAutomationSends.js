'use strict';

// Aggregerar "senast skickad" per journey-automation för en patient, ur
// befintliga källor (ingen ny logg byggs):
//   - påminnelse + aftercare: ccoPatientCareStateStore.reminderLog (patient-keyad)
//   - omdöme: postOpReviewStore (via patientens bookingCaseIds)
// Öppnad-status finns ej för transaktionsmail (kräver pixel) → utelämnas.
// Allt best-effort: saknad källa/data → null (frontend visar "ej skickad än").

function asArray(v) {
  return Array.isArray(v) ? v : [];
}

function pickLatest(rows) {
  let best = null;
  let bestT = -Infinity;
  for (const r of asArray(rows)) {
    const t = Date.parse(r && r.sentAt ? r.sentAt : 0);
    if (!isFinite(t)) continue;
    if (t > bestT) {
      bestT = t;
      best = r;
    }
  }
  return best ? { sentAt: best.sentAt, channel: best.channel || null } : null;
}

function isAftercare(type) {
  return /aftercare|efterv|post.?op|uppf[öo]lj/i.test(String(type || ''));
}

async function aggregateAutomationSends({
  patientId,
  patientName,
  tenantId,
  bookingCaseIds = [],
  careStateStore,
  postOpReviewStore,
} = {}) {
  const out = { reminder: null, aftercare: null, review: null };
  const pid = String(patientId || '').trim();
  if (!pid) return out;

  // Påminnelse + aftercare ur reminderLog
  if (careStateStore && typeof careStateStore.listReminderLog === 'function') {
    let log = [];
    try {
      log = await careStateStore.listReminderLog({
        tenantId,
        sinceHours: 24 * 365,
        limit: 5000,
      });
    } catch {
      log = [];
    }
    const mine = asArray(log).filter((r) => String(r && r.patientId) === pid);
    out.reminder = pickLatest(mine.filter((r) => !isAftercare(r.reminderType)));
    out.aftercare = pickLatest(mine.filter((r) => isAftercare(r.reminderType)));
  }

  // Omdöme ur postOpReviewStore: i första hand via bookingCaseIds, annars namn-match
  if (postOpReviewStore) {
    let subs = [];
    if (
      typeof postOpReviewStore.findByBookingCaseId === 'function' &&
      asArray(bookingCaseIds).length
    ) {
      for (const bcid of asArray(bookingCaseIds)) {
        const id = String(bcid || '').trim();
        if (!id) continue;
        try {
          const sub = postOpReviewStore.findByBookingCaseId(id);
          if (sub) subs.push(sub);
        } catch {
          /* ignore */
        }
      }
    }
    // Fallback: matcha submissions på patientName (submissions saknar patientId)
    const wantName = String(patientName || '').trim().toLowerCase();
    if (!subs.length && wantName && typeof postOpReviewStore.listSubmissions === 'function') {
      try {
        subs = asArray(postOpReviewStore.listSubmissions({ tenantId })).filter(
          (s) => String(s && s.patientName).trim().toLowerCase() === wantName
        );
      } catch {
        subs = [];
      }
    }
    const sent = subs.filter((s) => s && s.sentAt);
    const best = pickLatest(sent);
    if (best) {
      const winner = sent.find((s) => s.sentAt === best.sentAt) || {};
      out.review = {
        sentAt: best.sentAt,
        clickedAt: winner.reviewClickedAt || null,
        submittedAt: winner.submittedAt || null,
      };
    }
  }

  return out;
}

module.exports = { aggregateAutomationSends, isAftercare };
