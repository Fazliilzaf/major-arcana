'use strict';

/**
 * Booking Public Actions — Fas 2 Block 2 + 3.
 *
 * Token-baserade publika sidor (ingen auth krävs):
 * - GET /avboka/:token — visa avbokningssida
 * - POST /avboka/:token — bekräfta avbokning
 * - GET /omboka/:token — visa ombokningssida med SlotPicker
 * - POST /omboka/:token — bekräfta ombokning (atomiskt slot-lås)
 */

const express = require('express');
const crypto = require('node:crypto');

function normalizeText(v) { return typeof v === 'string' ? v.trim() : ''; }
function nowIso() { return new Date().toISOString(); }

function createBookingPublicActionsRouter({ bookingEngineStore }) {
  const router = express.Router();

  // ─── TOKEN GENERATION (internal, called by confirm-flow) ───

  function generateActionToken(bookingId) {
    return crypto.createHash('sha256').update(`${bookingId}:${process.env.ARCANA_TOKEN_SALT || 'arcana-booking-salt'}`).digest('hex').slice(0, 32);
  }

  function findBookingByToken(token) {
    if (!bookingEngineStore?._state?.bookings) return null;
    return bookingEngineStore._state.bookings.find((b) => {
      const expected = generateActionToken(b.bookingId);
      return expected === token && b.status !== 'cancelled';
    });
  }

  // ─── AVBOKA (Block 2) ───

  router.get('/avboka/:token', (req, res) => {
    const token = normalizeText(req.params.token);
    const booking = findBookingByToken(token);
    if (!booking) {
      return res.status(404).send(renderPage('Bokningen hittades inte', '<p>Länken är ogiltig eller har redan använts.</p>'));
    }
    if (booking.status === 'cancelled') {
      return res.send(renderPage('Redan avbokad', '<p>Denna bokning är redan avbokad.</p>'));
    }
    const service = normalizeText(booking.serviceLabel || booking.slot?.serviceLabel || 'Besök');
    const date = normalizeText(booking.slot?.date || (booking.slot?.startsAt || '').slice(0, 10));
    const time = normalizeText(booking.slot?.time || (booking.slot?.startsAt || '').slice(11, 16));
    res.send(renderPage('Avboka din tid', `
      <p>Vill du avboka följande tid?</p>
      <div style="background:#f5f0eb;padding:16px;border-radius:12px;margin:16px 0;">
        <strong>${service}</strong><br>
        ${date} kl ${time}<br>
        Hair TP Clinic
      </div>
      <form method="POST" action="/avboka/${token}">
        <button type="submit" style="width:100%;min-height:48px;padding:14px 24px;background:#b94a4a;color:#fff;border:none;border-radius:12px;font-size:16px;font-weight:600;cursor:pointer;">Avboka</button>
      </form>
      <p style="margin-top:16px;font-size:13px;color:#6b5f58;">Avbokning måste ske senast 24h före besöket.</p>
    `));
  });

  router.post('/avboka/:token', express.urlencoded({ extended: false }), async (req, res) => {
    const token = normalizeText(req.params.token);
    const booking = findBookingByToken(token);
    if (!booking) return res.status(404).send(renderPage('Hittades inte', '<p>Bokningen hittades inte.</p>'));
    if (booking.status === 'cancelled') return res.send(renderPage('Redan avbokad', '<p>Denna bokning är redan avbokad.</p>'));

    try {
      booking.status = 'cancelled';
      booking.cancelledAt = nowIso();
      booking.cancelledBy = 'patient_token';
      booking.cancelReason = normalizeText(req.body?.reason) || 'Avbokad via länk';
      if (bookingEngineStore?.save) await bookingEngineStore.save();

      res.send(renderPage('Avbokad ✓', `
        <p>Din bokning är nu avbokad.</p>
        <p>Vill du boka en ny tid? <a href="/boka" style="color:#1a4d35;font-weight:600;">Boka här</a></p>
      `));
    } catch (err) {
      res.status(500).send(renderPage('Fel', '<p>Kunde inte avboka. Kontakta kliniken.</p>'));
    }
  });

  // ─── OMBOKA (Block 3) ───

  router.get('/omboka/:token', async (req, res) => {
    const token = normalizeText(req.params.token);
    const booking = findBookingByToken(token);
    if (!booking) return res.status(404).send(renderPage('Hittades inte', '<p>Länken är ogiltig.</p>'));
    if (booking.status === 'cancelled') return res.send(renderPage('Avbokad', '<p>Bokningen är avbokad och kan inte ombokas.</p>'));

    const service = normalizeText(booking.serviceLabel || booking.slot?.serviceLabel || 'Besök');
    const serviceId = normalizeText(booking.serviceId || booking.slot?.serviceId || '');

    // Hämta lediga tider
    let availableSlots = [];
    if (bookingEngineStore?.listAvailability) {
      try {
        availableSlots = await bookingEngineStore.listAvailability({
          serviceId,
          days: 14,
        });
      } catch { /* fallback empty */ }
    }

    const slotsHtml = availableSlots.slice(0, 20).map((slot) => {
      const d = normalizeText(slot.date);
      const t = normalizeText(slot.time || (slot.startsAt || '').slice(11, 16));
      return `<label style="display:flex;align-items:center;gap:10px;padding:12px;border:1px solid #efe6e0;border-radius:10px;margin-bottom:8px;cursor:pointer;">
        <input type="radio" name="newSlot" value="${d}T${t}" required>
        <span><strong>${d}</strong> kl ${t}</span>
      </label>`;
    }).join('') || '<p>Inga lediga tider just nu. Kontakta kliniken.</p>';

    res.send(renderPage('Omboka din tid', `
      <p>Nuvarande tid: <strong>${service}</strong> ${booking.slot?.date || ''} kl ${booking.slot?.time || ''}</p>
      <p>Välj ny tid:</p>
      <form method="POST" action="/omboka/${token}">
        ${slotsHtml}
        <button type="submit" style="width:100%;min-height:48px;padding:14px 24px;background:#1a4d35;color:#fff;border:none;border-radius:12px;font-size:16px;font-weight:600;cursor:pointer;margin-top:12px;">Bekräfta ny tid</button>
      </form>
    `));
  });

  router.post('/omboka/:token', express.urlencoded({ extended: false }), async (req, res) => {
    const token = normalizeText(req.params.token);
    const booking = findBookingByToken(token);
    if (!booking) return res.status(404).send(renderPage('Hittades inte', '<p>Bokningen hittades inte.</p>'));

    const newSlotValue = normalizeText(req.body?.newSlot);
    if (!newSlotValue) return res.status(400).send(renderPage('Välj tid', '<p>Du måste välja en ny tid.</p>'));

    const [newDate, newTime] = newSlotValue.split('T');

    try {
      // Atomiskt: spara gamla slot-info, uppdatera till ny
      const oldSlot = { ...booking.slot };
      booking.slot = {
        ...booking.slot,
        date: newDate,
        time: newTime,
        startsAt: `${newDate}T${newTime}:00`,
      };
      booking.status = 'confirmed';
      booking.rescheduledAt = nowIso();
      booking.rescheduledFrom = oldSlot;
      booking.reminders = {}; // Reset påminnelser

      if (bookingEngineStore?.save) await bookingEngineStore.save();

      res.send(renderPage('Ombokad ✓', `
        <p>Din nya tid är bekräftad:</p>
        <div style="background:#f0f8f4;padding:16px;border-radius:12px;margin:16px 0;">
          <strong>${booking.serviceLabel || 'Besök'}</strong><br>
          ${newDate} kl ${newTime}<br>
          Hair TP Clinic
        </div>
        <p style="font-size:13px;color:#6b5f58;">Du får ett nytt bekräftelsemejl inom kort.</p>
      `));
    } catch (err) {
      res.status(500).send(renderPage('Fel', '<p>Kunde inte omboka. Kontakta kliniken.</p>'));
    }
  });

  // ─── HELPERS ───

  function renderPage(title, body) {
    return `<!DOCTYPE html>
<html lang="sv">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} — Hair TP Clinic</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Inter,-apple-system,sans-serif;background:#faf6f2;color:#231f1d;min-height:100dvh;display:flex;flex-direction:column;align-items:center;padding:24px 16px}.card{background:#fff;border-radius:20px;padding:32px 24px;max-width:440px;width:100%;box-shadow:0 4px 12px rgba(70,50,30,0.06);margin-top:24px}h1{font-size:22px;margin-bottom:16px;color:#1a4d35}p{font-size:15px;line-height:1.5;margin-bottom:12px}a{color:#1a4d35}</style>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
</head>
<body>
  <img src="https://ma.hairtpclinic.se/htp-logo-email.png" alt="Hair TP Clinic" style="height:48px;margin-bottom:8px;">
  <div class="card"><h1>${title}</h1>${body}</div>
</body></html>`;
  }

  // Export token generator for use in confirm-flow
  router.generateActionToken = generateActionToken;

  return router;
}

module.exports = { createBookingPublicActionsRouter };
