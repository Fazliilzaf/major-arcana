'use strict';

/**
 * Booking Public Actions — Fas 2 Block 2 + 3.
 *
 * Token-baserade publika sidor (ingen auth krävs):
 * - GET /avboka/:token — visa avbokningssida
 * - POST /avboka/:token — bekräfta avbokning
 * - GET /omboka/:token — visa ombokningssida med SlotPicker
 * - POST /omboka/:token — bekräfta ombokning (atomiskt slot-lås)
 *
 * Visuellt språk: CCO V11 design-DNA (warm vellum, panel-shell-shadow stack,
 * 3px accent-stripe, kicker-puls, gradient-CTA). Se docs/handover/MOCKUPS/
 * V11-MASTER-SPEC-2026-06-18.md för token-katalogen.
 */

const express = require('express');
const crypto = require('node:crypto');

function normalizeText(v) {
  return typeof v === 'string' ? v.trim() : '';
}

function escapeHtml(value) {
  return String(value == null ? '' : value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
}

function createBookingPublicActionsRouter({ bookingEngineStore }) {
  const router = express.Router();

  // ─── TOKEN GENERATION (internal, called by confirm-flow) ───

  function generateActionToken(bookingId) {
    return crypto
      .createHash('sha256')
      .update(`${bookingId}:${process.env.ARCANA_TOKEN_SALT || 'arcana-booking-salt'}`)
      .digest('hex')
      .slice(0, 32);
  }

  function findBookingByToken(token) {
    if (!bookingEngineStore?._state?.bookings) return null;
    return bookingEngineStore._state.bookings.find((b) => {
      const expected = generateActionToken(b.bookingId);
      return expected === token && b.status !== 'cancelled';
    });
  }

  // ─── DATUM/TID-HJÄLPARE ───

  function isoDateOnly(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function formatLocalTime(startsAt) {
    if (!startsAt) return '';
    const d = new Date(startsAt);
    if (Number.isNaN(d.getTime())) return '';
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  function formatLocalDate(startsAt) {
    if (!startsAt) return '';
    const d = new Date(startsAt);
    if (Number.isNaN(d.getTime())) return '';
    return isoDateOnly(d);
  }

  // "fredag 29 maj" — patient-facing, läsbar
  function formatLocalDateLong(startsAt) {
    if (!startsAt) return '';
    const d = new Date(startsAt);
    if (Number.isNaN(d.getTime())) return '';
    try {
      return d.toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' });
    } catch {
      return formatLocalDate(startsAt);
    }
  }

  async function fetchAvailableSlots({ tenantId, serviceId, brand = '' }) {
    if (!bookingEngineStore?.listAvailability) return [];
    if (!tenantId) return [];
    const now = new Date();
    const fromDate = isoDateOnly(now);
    const to = new Date(now.getTime() + 14 * 86400000);
    const toDate = isoDateOnly(to);
    try {
      // listAvailability tar srvIds som comma-separated string (rad ~1244
      // i ccoBookingEngineStore.js — normalizeText(srvIds).split(',')),
      // inte array. Tom string = ingen filtrering.
      const result = await bookingEngineStore.listAvailability({
        tenantId,
        fromDate,
        toDate,
        srvIds: serviceId || '',
        brand,
      });
      return Array.isArray(result) ? result : result?.slots || [];
    } catch (err) {
      console.warn('[bookingPublicActions] listAvailability misslyckades:', err.message);
      return [];
    }
  }

  // ─── AVBOKA (Block 2) ───

  router.get('/avboka/:token', (req, res) => {
    const token = normalizeText(req.params.token);
    const booking = findBookingByToken(token);
    if (!booking) {
      return res.status(404).send(
        renderErrorPage({
          title: 'Bokningen hittades inte',
          message: 'Länken är ogiltig eller har redan använts.',
        })
      );
    }
    if (booking.status === 'cancelled') {
      return res.send(
        renderErrorPage({
          title: 'Redan avbokad',
          message: 'Denna bokning är redan avbokad.',
        })
      );
    }
    const service = normalizeText(booking.serviceLabel || booking.slot?.serviceLabel || 'Besök');
    const startsAt = normalizeText(booking.slot?.startsAt);
    const dateLabel = formatLocalDateLong(startsAt) || formatLocalDate(startsAt);
    const timeLabel = formatLocalTime(startsAt);
    res.send(
      renderShell({
        title: 'Avboka din tid',
        body: `
          <p class="kicker">Avboka tid</p>
          <h1>Vill du avboka?</h1>
          <p class="lead">Klicka knappen så tas din tid bort hos Hair TP Clinic.</p>
          ${renderInfoCard({
            kicker: 'Din bokning',
            title: service,
            rows: [
              { k: 'Datum', v: dateLabel || '—' },
              { k: 'Tid', v: timeLabel || '—' },
              { k: 'Plats', v: 'Hair TP Clinic' },
            ],
          })}
          <form method="POST" action="/avboka/${escapeHtml(token)}">
            <button class="btn btn-danger" type="submit">Avboka min tid</button>
          </form>
          <p class="disclaimer">Avbokning bör ske senast 24h före besöket.</p>
        `,
      })
    );
  });

  router.post('/avboka/:token', express.urlencoded({ extended: false }), async (req, res) => {
    const token = normalizeText(req.params.token);
    const booking = findBookingByToken(token);
    if (!booking)
      return res
        .status(404)
        .send(renderErrorPage({ title: 'Hittades inte', message: 'Bokningen hittades inte.' }));
    if (booking.status === 'cancelled')
      return res.send(
        renderErrorPage({ title: 'Redan avbokad', message: 'Denna bokning är redan avbokad.' })
      );

    try {
      // Patienten har redan bekräftat via tokenen — force-flagga skippar
      // 24h-policyn så att avbokningar via länk inte ramlar i 409 om kunden
      // hinner klicka inom deadline-zonen. UI:n visar disclaimern.
      await bookingEngineStore.cancelBooking({
        tenantId: booking.tenantId,
        conversationId: booking.conversationId,
        customerEmail: booking.customerEmail,
        reason: normalizeText(req.body?.reason) || 'Avbokad via patientlänk',
        // F2-3 audit: attribuera avbokningen till patient-token-flowet
        // (annars defaultar cancelledBy till 'operator' i store)
        cancelledBy: 'patient_token',
        force: true,
      });

      res.send(
        renderShell({
          title: 'Avbokad',
          body: `
            <div class="success-glyph">✓</div>
            <h1 class="center">Tiden är avbokad</h1>
            <p class="lead center">Vi har tagit bort din bokning. Tack för att du hörde av dig.</p>
            <p class="center" style="margin-top:8px;">Vill du boka en ny tid? <a href="/boka">Boka här →</a></p>
          `,
        })
      );
    } catch (err) {
      if (err?.statusCode === 404) {
        return res.status(404).send(
          renderErrorPage({
            title: 'Hittades inte',
            message: 'Ingen aktiv bokning att avboka.',
          })
        );
      }
      res.status(500).send(
        renderErrorPage({
          title: 'Något gick fel',
          message: 'Kunde inte avboka. Kontakta kliniken på telefon eller mejl.',
        })
      );
    }
  });

  // ─── OMBOKA (Block 3) ───

  router.get('/omboka/:token', async (req, res) => {
    const token = normalizeText(req.params.token);
    const booking = findBookingByToken(token);
    if (!booking)
      return res
        .status(404)
        .send(renderErrorPage({ title: 'Hittades inte', message: 'Länken är ogiltig.' }));
    if (booking.status === 'cancelled')
      return res.send(
        renderErrorPage({
          title: 'Avbokad',
          message: 'Bokningen är avbokad och kan inte ombokas.',
        })
      );

    const service = normalizeText(booking.serviceLabel || booking.slot?.serviceLabel || 'Besök');
    const serviceId = normalizeText(booking.serviceId || booking.slot?.serviceId || '');

    const availableSlots = await fetchAvailableSlots({ tenantId: booking.tenantId, serviceId });

    const slotsHtml = availableSlots.length
      ? availableSlots
          .slice(0, 20)
          .map((slot) => {
            const startsAt = normalizeText(slot.startsAt);
            const dateLabel = formatLocalDateLong(startsAt);
            const timeLabel = formatLocalTime(startsAt);
            return `<label class="slot-option">
              <input type="radio" name="newSlot" value="${escapeHtml(startsAt)}" required>
              <span class="slot-date">${escapeHtml(dateLabel)}</span>
              <span class="slot-time">${escapeHtml(timeLabel)}</span>
            </label>`;
          })
          .join('')
      : '<div class="empty-slot-state">Inga lediga tider just nu. Ring eller mejla kliniken så hjälper vi dig hitta en tid.</div>';

    const startsAt = normalizeText(booking.slot?.startsAt);
    const currentDateLabel = formatLocalDateLong(startsAt) || formatLocalDate(startsAt);
    const currentTimeLabel = formatLocalTime(startsAt);

    res.send(
      renderShell({
        title: 'Omboka din tid',
        body: `
          <p class="kicker">Omboka tid</p>
          <h1>Välj en ny tid</h1>
          ${renderInfoCard({
            kicker: 'Nuvarande bokning',
            title: service,
            rows: [
              { k: 'Datum', v: currentDateLabel || '—' },
              { k: 'Tid', v: currentTimeLabel || '—' },
            ],
          })}
          <p class="section-label">Lediga tider nästa 14 dagar</p>
          <form method="POST" action="/omboka/${escapeHtml(token)}">
            <div class="slot-list">${slotsHtml}</div>
            ${availableSlots.length ? '<button class="btn btn-primary" type="submit">Bekräfta ny tid</button>' : ''}
          </form>
        `,
      })
    );
  });

  router.post('/omboka/:token', express.urlencoded({ extended: false }), async (req, res) => {
    const token = normalizeText(req.params.token);
    const booking = findBookingByToken(token);
    if (!booking)
      return res
        .status(404)
        .send(renderErrorPage({ title: 'Hittades inte', message: 'Bokningen hittades inte.' }));
    if (booking.status === 'cancelled')
      return res.send(
        renderErrorPage({
          title: 'Avbokad',
          message: 'Bokningen är avbokad och kan inte ombokas.',
        })
      );

    const newSlotStartsAt = normalizeText(req.body?.newSlot);
    if (!newSlotStartsAt)
      return res
        .status(400)
        .send(renderErrorPage({ title: 'Välj en tid', message: 'Du måste välja en ny tid.' }));

    try {
      const serviceId = normalizeText(booking.serviceId || booking.slot?.serviceId || '');
      const availableSlots = await fetchAvailableSlots({ tenantId: booking.tenantId, serviceId });
      const matchingSlot = availableSlots.find(
        (s) => normalizeText(s.startsAt) === newSlotStartsAt
      );
      if (!matchingSlot) {
        return res.status(409).send(
          renderErrorPage({
            title: 'Tiden är inte längre ledig',
            message: 'Den valda tiden är inte längre tillgänglig.',
            retryHref: `/omboka/${token}`,
            retryLabel: 'Välj en annan tid',
          })
        );
      }

      // rebookBooking sköter cancel-old + reserve-new + confirm i en sekvens
      // och anropar save() på varje steg, vilket håller disk-state korrekt.
      await bookingEngineStore.rebookBooking({
        tenantId: booking.tenantId,
        workspaceId: booking.workspaceId,
        conversationId: booking.conversationId,
        customerEmail: booking.customerEmail,
        customerName: booking.customerName,
        selectedSlots: [matchingSlot],
        reason: 'Ombokad via patientlänk',
        // F2-3 audit: aktören är patienten via token. Att det var en
        // ombokning (inte ren avboka) framgår av rescheduledFromBookingId
        // på den nya bokningen.
        cancelledBy: 'patient_token',
      });

      const newDateLabel = formatLocalDateLong(matchingSlot.startsAt);
      const newTimeLabel = formatLocalTime(matchingSlot.startsAt);
      const service = normalizeText(booking.slot?.serviceLabel || booking.serviceLabel || 'Besök');

      res.send(
        renderShell({
          title: 'Ombokad',
          body: `
            <div class="success-glyph">✓</div>
            <h1 class="center">Tiden är ombokad</h1>
            ${renderInfoCard({
              kicker: 'Din nya tid',
              title: service,
              accent: 'success',
              rows: [
                { k: 'Datum', v: newDateLabel },
                { k: 'Tid', v: newTimeLabel },
                { k: 'Plats', v: 'Hair TP Clinic' },
              ],
            })}
            <p class="disclaimer">Du får ett nytt bekräftelsemejl inom kort.</p>
          `,
        })
      );
    } catch (err) {
      if (err?.statusCode === 409) {
        return res.status(409).send(
          renderErrorPage({
            title: 'Tiden är inte längre ledig',
            message: 'Tiden hann bli upptagen.',
            retryHref: `/omboka/${token}`,
            retryLabel: 'Välj en annan tid',
          })
        );
      }
      res.status(500).send(
        renderErrorPage({
          title: 'Något gick fel',
          message: 'Kunde inte omboka. Kontakta kliniken på telefon eller mejl.',
        })
      );
    }
  });

  // ─── DESIGN-HELPERS (CCO V11 DNA) ───

  function renderInfoCard({ kicker, title, rows, accent }) {
    const accentAttr = accent ? ` data-accent="${escapeHtml(accent)}"` : '';
    const rowsHtml = rows
      .map(
        (r) =>
          `<div class="info-row"><span class="k">${escapeHtml(r.k)}</span><span class="v">${escapeHtml(r.v)}</span></div>`
      )
      .join('');
    return `<div class="info-card"${accentAttr}>
      <p class="info-kicker">${escapeHtml(kicker)}</p>
      <p class="info-title">${escapeHtml(title)}</p>
      ${rowsHtml}
    </div>`;
  }

  function renderErrorPage({ title, message, retryHref, retryLabel }) {
    const retry = retryHref
      ? `<p class="center" style="margin-top:18px;"><a href="${escapeHtml(retryHref)}">${escapeHtml(retryLabel || 'Försök igen')} →</a></p>`
      : '';
    return renderShell({
      title,
      body: `
        <p class="kicker">Hair TP Clinic</p>
        <h1>${escapeHtml(title)}</h1>
        <p class="lead">${escapeHtml(message)}</p>
        ${retry}
      `,
    });
  }

  function renderShell({ title, body }) {
    return `<!DOCTYPE html>
<html lang="sv">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} — Hair TP Clinic</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
:root{
--cco-bg-page:#faf6f2;--cco-color-brand:#2b251f;
--cco-text-secondary:rgba(70,60,50,.62);--cco-text-tertiary:#8a8174;
--cco-status-success:#4a8268;--cco-status-warning:#c8821e;--cco-status-danger:#b94a4a;
--calendar-accent:#c8821e;--calendar-accent-soft:rgba(200,130,30,.14);--calendar-accent-glow:rgba(200,130,30,.22);
--panel-shell-top:rgba(250,246,242,.94);--panel-shell-bottom:rgba(244,238,233,.86);
--panel-shell-shadow:0 18px 38px rgba(93,74,60,.07),0 6px 18px rgba(156,145,166,.04),0 0 0 1px rgba(255,255,255,.18),inset 0 1px 0 rgba(255,255,255,.5);
--panel-card-top:rgba(255,255,255,.94);--panel-card-bottom:rgba(247,241,236,.86);
--panel-card-shadow:0 3px 10px rgba(56,40,28,.08),inset 0 1px 0 rgba(255,255,255,.86);
--pulse-amber:0 0 0 3px rgba(200,130,30,.18),0 0 0 6px rgba(200,130,30,.08);
}
*{margin:0;padding:0;box-sizing:border-box}
body{
background:
radial-gradient(ellipse at 12% 0%,rgba(255,225,200,.42),transparent 38%),
radial-gradient(ellipse at 88% 4%,rgba(255,210,225,.34),transparent 42%),
radial-gradient(circle at 50% 100%,rgba(220,210,255,.18),transparent 48%),
var(--cco-bg-page);
color:var(--cco-color-brand);
font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
font-size:14.5px;line-height:1.55;letter-spacing:-0.005em;
min-height:100dvh;padding:32px 16px 40px;
display:flex;flex-direction:column;align-items:center;
-webkit-font-smoothing:antialiased;
}
.logo{
display:block;height:90px;width:auto;
margin:0 auto -45px;position:relative;z-index:2;
filter:
drop-shadow(0 1px 0 rgba(255,255,255,.7))
drop-shadow(0 8px 18px rgba(56,40,28,.22))
drop-shadow(0 18px 38px rgba(93,74,60,.20));
}
.shell{
position:relative;width:100%;max-width:460px;
border-radius:28px;padding:70px 28px 26px;
background:linear-gradient(180deg,var(--panel-shell-top),var(--panel-shell-bottom));
box-shadow:var(--panel-shell-shadow);
backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);
overflow:hidden;
}
.shell::before{
content:'';position:absolute;inset:0;border-radius:inherit;pointer-events:none;
background:
radial-gradient(circle at 14% 8%,rgba(255,255,255,.55),transparent 28%),
radial-gradient(circle at 88% 12%,rgba(255,228,238,.3),transparent 28%);
}
.shell>*{position:relative;z-index:1}
.kicker{
font-size:10.5px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;
color:var(--calendar-accent);
display:inline-flex;align-items:center;gap:8px;margin:0 0 10px;
}
.kicker::before{
content:'';width:6px;height:6px;border-radius:999px;
background:var(--calendar-accent);box-shadow:var(--pulse-amber);
animation:pulse 1.8s ease-in-out infinite;
}
@keyframes pulse{
0%,100%{box-shadow:var(--pulse-amber)}
50%{box-shadow:0 0 0 5px rgba(200,130,30,.22),0 0 0 9px rgba(200,130,30,.10)}
}
h1{
margin:0 0 12px;font-size:24px;font-weight:700;
letter-spacing:-0.025em;line-height:1.2;color:var(--cco-color-brand);
}
.lead{margin:0 0 16px;font-size:14.5px;color:var(--cco-text-secondary);line-height:1.5}
.info-card{
position:relative;background:linear-gradient(180deg,var(--panel-card-top),var(--panel-card-bottom));
border-radius:18px;padding:20px 20px 18px 24px;margin:18px 0 22px;
border:1px solid rgba(255,255,255,.7);box-shadow:var(--panel-card-shadow);
overflow:hidden;
}
.info-card::before{
content:'';position:absolute;left:0;top:8px;bottom:8px;width:3px;
background:var(--calendar-accent);box-shadow:0 0 8px var(--calendar-accent-glow);
border-radius:0 2px 2px 0;
}
.info-card[data-accent="success"]::before{
background:var(--cco-status-success);box-shadow:0 0 8px rgba(74,130,104,.22);
}
.info-kicker{
font-size:9.5px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;
color:var(--cco-text-tertiary);margin:0 0 6px;
}
.info-title{
font-size:17px;font-weight:700;margin:0 0 12px;
color:var(--cco-color-brand);letter-spacing:-0.015em;line-height:1.25;
}
.info-row{
display:flex;justify-content:space-between;align-items:baseline;
padding:9px 0;border-top:1px solid rgba(132,117,107,.14);
}
.info-row:first-of-type{border-top:0;padding-top:2px}
.info-row .k{
color:var(--cco-text-tertiary);font-weight:700;
font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;
}
.info-row .v{
color:var(--cco-color-brand);font-weight:700;font-size:14px;
font-variant-numeric:tabular-nums;letter-spacing:-0.01em;text-align:right;
}
.btn{
appearance:none;border:0;cursor:pointer;
width:100%;min-height:52px;padding:14px 22px;
border-radius:14px;font-family:inherit;font-size:15px;
font-weight:700;letter-spacing:.005em;color:#fff;
transition:transform .14s ease,box-shadow .14s ease;
}
.btn:hover{transform:translateY(-1px)}
.btn:active{transform:translateY(0)}
.btn-danger{
background:linear-gradient(180deg,#d8526b,#b94a4a);
border:1px solid rgba(255,255,255,.18);
box-shadow:inset 0 1px 0 rgba(255,255,255,.35),0 1px 2px rgba(56,40,28,.10),0 8px 22px rgba(185,74,74,.28);
}
.btn-danger:hover{
box-shadow:inset 0 1px 0 rgba(255,255,255,.45),0 2px 4px rgba(56,40,28,.12),0 12px 28px rgba(185,74,74,.34);
}
.btn-primary{
background:linear-gradient(180deg,#e89a2e,#c8821e);
border:1px solid rgba(255,255,255,.18);
box-shadow:inset 0 1px 0 rgba(255,255,255,.35),0 1px 2px rgba(56,40,28,.10),0 8px 22px var(--calendar-accent-glow);
}
.btn-primary:hover{
box-shadow:inset 0 1px 0 rgba(255,255,255,.45),0 2px 4px rgba(56,40,28,.12),0 12px 28px rgba(200,130,30,.34);
}
.disclaimer{
margin-top:14px;font-size:12.5px;color:var(--cco-text-tertiary);
text-align:center;line-height:1.5;
}
.center{text-align:center}
a{
color:var(--calendar-accent);font-weight:700;text-decoration:none;
border-bottom:1px solid rgba(200,130,30,.32);transition:border-color .12s ease;
}
a:hover{border-bottom-color:var(--calendar-accent)}
.section-label{
font-size:9.5px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;
color:var(--cco-text-tertiary);margin:22px 0 10px;
}
.slot-list{display:flex;flex-direction:column;gap:8px;margin:8px 0 20px}
.slot-option{
position:relative;display:flex;align-items:center;gap:12px;
padding:13px 16px;border-radius:14px;
background:linear-gradient(180deg,var(--panel-card-top),var(--panel-card-bottom));
border:1px solid rgba(255,255,255,.7);
box-shadow:0 2px 8px rgba(56,40,28,.06),inset 0 1px 0 rgba(255,255,255,.85);
cursor:pointer;
transition:transform .12s ease,box-shadow .14s ease,background .14s ease;
}
.slot-option:hover{
transform:translateY(-1px);
box-shadow:0 8px 22px rgba(56,40,28,.10),inset 0 1px 0 rgba(255,255,255,.92);
}
.slot-option input[type="radio"]{
accent-color:var(--calendar-accent);
width:18px;height:18px;flex-shrink:0;cursor:pointer;
}
.slot-option:has(input:checked){
border-color:rgba(200,130,30,.4);
background:linear-gradient(180deg,rgba(255,242,220,.95),rgba(252,233,200,.78));
box-shadow:
inset 3px 0 0 var(--calendar-accent),
inset 0 1px 0 rgba(255,255,255,.85),
0 6px 18px var(--calendar-accent-glow);
}
.slot-date{
font-weight:700;font-size:14px;color:var(--cco-color-brand);
letter-spacing:-0.005em;flex:1;text-transform:capitalize;
}
.slot-time{
font-weight:800;font-size:15px;color:var(--calendar-accent);
font-variant-numeric:tabular-nums;letter-spacing:-0.01em;
}
.empty-slot-state{
text-align:center;padding:28px 16px;
color:var(--cco-text-tertiary);font-size:13px;line-height:1.55;
background:rgba(245,239,230,.45);border-radius:14px;
border:1px dashed rgba(132,117,107,.25);
}
.success-glyph{
width:56px;height:56px;margin:0 auto 18px;border-radius:50%;
background:linear-gradient(180deg,#5d997d,#4a8268);
color:#fff;display:flex;align-items:center;justify-content:center;
font-size:28px;font-weight:700;
box-shadow:inset 0 1px 0 rgba(255,255,255,.35),0 8px 22px rgba(74,130,104,.34);
}
</style>
</head>
<body>
<img class="logo" src="https://arcana.hairtpclinic.com/htp-logo-email.png" alt="Hair TP Clinic">
<main class="shell" role="main">
${body}
</main>
</body></html>`;
  }

  // Export token generator for use in confirm-flow
  router.generateActionToken = generateActionToken;

  return router;
}

module.exports = { createBookingPublicActionsRouter };
