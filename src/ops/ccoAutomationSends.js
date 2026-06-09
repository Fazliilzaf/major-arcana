'use strict';

// Aggregerar "senast skickad" per journey-automation för en patient, ur
// BEFINTLIGA källor (ingen ny logg byggs):
//   - bokningsbekräftelse + påminnelse + aftercare: ccoPatientCareStateStore.reminderLog
//     (matchas på patientId ELLER metadata.customerEmail — e-post-bryggan, eftersom
//      boknings-/automation-sidan är kund-keyad, inte master-patientId-keyad)
//   - omdöme: postOpReviewStore (submission.customerEmail → bookingCaseId → patientName-fallback)
// Öppnad-status finns ej för transaktionsmail (kräver pixel) → utelämnas.
// Allt best-effort: saknad källa/data → null (frontend visar inget).

function asArray(v) {
  return Array.isArray(v) ? v : [];
}
function asObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}
function norm(v) {
  return String(v == null ? '' : v).trim();
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
function isConfirmation(type) {
  return /booking_confirmation|bekr[äa]ft/i.test(String(type || ''));
}

async function aggregateAutomationSends({
  patientId,
  patientName,
  email,
  tenantId,
  bookingCaseIds = [],
  careStateStore,
  postOpReviewStore,
} = {}) {
  const out = { confirmation: null, reminder: null, aftercare: null, review: null };
  const pid = norm(patientId);
  if (!pid) return out;
  const wantEmail = norm(email).toLowerCase();
  const wantName = norm(patientName).toLowerCase();

  // Bokningsbekräftelse + påminnelse + aftercare ur reminderLog
  if (careStateStore && typeof careStateStore.listReminderLog === 'function') {
    let log = [];
    try {
      log = await careStateStore.listReminderLog({ tenantId, sinceHours: 24 * 365, limit: 5000 });
    } catch {
      log = [];
    }
    const mine = asArray(log).filter((r) => {
      if (!r) return false;
      if (norm(r.patientId) && norm(r.patientId) === pid) return true;
      const metaEmail = norm(asObject(r.metadata).customerEmail || r.email).toLowerCase();
      return !!wantEmail && metaEmail === wantEmail;
    });
    out.confirmation = pickLatest(mine.filter((r) => isConfirmation(r.reminderType)));
    out.aftercare = pickLatest(mine.filter((r) => isAftercare(r.reminderType)));
    out.reminder = pickLatest(
      mine.filter((r) => !isAftercare(r.reminderType) && !isConfirmation(r.reminderType))
    );
  }

  // Omdöme ur postOpReviewStore: bookingCaseIds → e-post → namn (fallback)
  if (postOpReviewStore) {
    let subs = [];
    if (
      typeof postOpReviewStore.findByBookingCaseId === 'function' &&
      asArray(bookingCaseIds).length
    ) {
      for (const bcid of asArray(bookingCaseIds)) {
        const id = norm(bcid);
        if (!id) continue;
        try {
          const sub = postOpReviewStore.findByBookingCaseId(id);
          if (sub) subs.push(sub);
        } catch {
          /* ignore */
        }
      }
    }
    if (!subs.length && typeof postOpReviewStore.listSubmissions === 'function') {
      let all = [];
      try {
        all = asArray(postOpReviewStore.listSubmissions({ tenantId }));
      } catch {
        all = [];
      }
      if (wantEmail) {
        subs = all.filter((s) => norm(s && s.customerEmail).toLowerCase() === wantEmail);
      }
      if (!subs.length && wantName) {
        subs = all.filter((s) => norm(s && s.patientName).toLowerCase() === wantName);
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

module.exports = { aggregateAutomationSends, isAftercare, isConfirmation };
