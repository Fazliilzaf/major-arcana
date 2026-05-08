'use strict';

/**
 * Daily Digest (OI3) — formatera CcoOperationalKpis-output till HTML+text-email.
 *
 * Pure function: tar KPI-data → returnerar { subject, html, text }.
 * Email-leverans hanteras separat via graphSendConnector eller liknande.
 */

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
}

function pct(n, d) {
  if (!d) return 0;
  return Math.round((n / d) * 100);
}

function formatList(items, keyName, max = 5) {
  if (!Array.isArray(items) || items.length === 0) return '<li>—</li>';
  return items
    .slice(0, max)
    .map((it) => `<li><strong>${escapeHtml(it[keyName] || '—')}</strong> — ${it.count}</li>`)
    .join('');
}

function buildDigest({ tenantBrand = {}, kpis = {}, locale = 'sv' } = {}) {
  const data = kpis.data || {};
  const t = data.throughput || {};
  const at = data.actionsTotals || {};
  const alerts = Array.isArray(data.alerts) ? data.alerts : [];
  const ts = Array.isArray(data.dailyTimeseries) ? data.dailyTimeseries : [];
  const tenantName = tenantBrand?.name || tenantBrand?.displayName || data.tenantId || 'CCO';
  const accent = tenantBrand?.accentColor || '#4a8268';
  const today = new Date().toISOString().slice(0, 10);

  const isSv = String(locale).toLowerCase().startsWith('sv');
  const L = isSv
    ? {
        subject: `CCO Daglig översikt — ${tenantName} (${today})`,
        title: 'Daglig översikt',
        kTodayLabel: 'Avslut idag',
        kYesterdayLabel: 'Igår',
        k7dLabel: 'Senaste 7 dagar',
        k30dLabel: 'Senaste 30 dagar',
        actionsLabel: 'Aktioner idag',
        avgLabel: 'snitt per dag (7d)',
        sectionAlerts: 'Varningar',
        sectionTrends: 'Trend (7 dagar)',
        sectionOutcomes: 'Outcome-fördelning (7d)',
        sectionIntents: 'Intent-fördelning (7d)',
        sectionDomains: 'Top kund-domäner (7d)',
        emptyAlerts: 'Inga aktiva varningar.',
        footer: 'Den här rapporten genereras automatiskt av CCO. Kontakta din admin för att stänga av.',
      }
    : {
        subject: `CCO Daily summary — ${tenantName} (${today})`,
        title: 'Daily summary',
        kTodayLabel: 'Closed today',
        kYesterdayLabel: 'Yesterday',
        k7dLabel: 'Last 7 days',
        k30dLabel: 'Last 30 days',
        actionsLabel: 'Actions today',
        avgLabel: 'avg per day (7d)',
        sectionAlerts: 'Alerts',
        sectionTrends: 'Trend (7 days)',
        sectionOutcomes: 'Outcome breakdown (7d)',
        sectionIntents: 'Intent breakdown (7d)',
        sectionDomains: 'Top customer domains (7d)',
        emptyAlerts: 'No active alerts.',
        footer: 'This report is generated automatically by CCO. Contact your admin to disable.',
      };

  const deltaToday =
    t.yesterday > 0 ? Math.round(((t.today - t.yesterday) / t.yesterday) * 100) : null;
  const deltaSign =
    deltaToday == null ? '—' : (deltaToday >= 0 ? '+' : '') + deltaToday + ' %';

  const max7d = Math.max(1, ...ts.map((d) => d.outcomeCount || 0));
  const trendBars = ts
    .map((d) => {
      const v = d.outcomeCount || 0;
      const h = Math.max(2, Math.round((v / max7d) * 60));
      return `<td style="vertical-align:bottom;text-align:center;padding:2px 3px"><div style="height:${h}px;width:24px;background:${accent};border-radius:3px 3px 0 0;margin:0 auto" title="${d.date}: ${v}"></div><div style="font-size:10px;color:#8a8174;margin-top:4px">${d.date.slice(5)}</div></td>`;
    })
    .join('');

  const alertsHtml =
    alerts.length === 0
      ? `<p style="color:#5d544a;font-style:italic">${L.emptyAlerts}</p>`
      : alerts
          .map((a) => {
            const bg =
              a.severity === 'warning'
                ? '#fff4e0'
                : a.severity === 'info'
                  ? '#e8f0f8'
                  : a.severity === 'success'
                    ? '#e8f4ee'
                    : '#fde8e8';
            const border =
              a.severity === 'warning'
                ? '#c8821e'
                : a.severity === 'info'
                  ? '#4a7ba8'
                  : a.severity === 'success'
                    ? '#4a8268'
                    : '#b94a4a';
            return `<div style="background:${bg};border-left:4px solid ${border};padding:10px 14px;margin-bottom:6px;border-radius:6px;font-size:13px">${escapeHtml(a.message)}</div>`;
          })
          .join('');

  const html = `<!DOCTYPE html>
<html lang="${isSv ? 'sv' : 'en'}">
<head>
<meta charset="utf-8">
<title>${escapeHtml(L.subject)}</title>
</head>
<body style="margin:0;padding:0;background:#fbf7f1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#2b251f">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td align="center" style="padding:24px 12px">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border-radius:12px;box-shadow:0 4px 12px rgba(43,37,31,0.08);overflow:hidden;max-width:600px;width:100%">
        <tr>
          <td style="padding:20px 24px;border-bottom:1px solid rgba(43,37,31,0.08)">
            <p style="margin:0;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:${accent};font-weight:600">${escapeHtml(tenantName)}</p>
            <h1 style="margin:6px 0 0 0;font-size:22px;font-weight:600;color:#2b251f">${L.title}</h1>
            <p style="margin:4px 0 0 0;color:#8a8174;font-size:12px">${today}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 24px">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="padding:12px;background:#f5efe6;border-radius:8px;width:50%" valign="top">
                  <p style="margin:0;font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:#8a8174;font-weight:500">${L.kTodayLabel}</p>
                  <p style="margin:6px 0 0 0;font-size:32px;font-weight:600;line-height:1">${t.today || 0}</p>
                  <p style="margin:4px 0 0 0;font-size:12px;color:#5d544a">${deltaSign} ${L.kYesterdayLabel.toLowerCase()} (${t.yesterday || 0})</p>
                </td>
                <td width="8"></td>
                <td style="padding:12px;background:#f5efe6;border-radius:8px;width:50%" valign="top">
                  <p style="margin:0;font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:#8a8174;font-weight:500">${L.k7dLabel}</p>
                  <p style="margin:6px 0 0 0;font-size:32px;font-weight:600;line-height:1">${t.last7d || 0}</p>
                  <p style="margin:4px 0 0 0;font-size:12px;color:#5d544a">${(t.last7dAvgPerDay || 0).toFixed(1)} ${L.avgLabel}</p>
                </td>
              </tr>
              <tr><td colspan="3" height="8"></td></tr>
              <tr>
                <td style="padding:12px;background:#f5efe6;border-radius:8px;width:50%" valign="top">
                  <p style="margin:0;font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:#8a8174;font-weight:500">${L.k30dLabel}</p>
                  <p style="margin:6px 0 0 0;font-size:32px;font-weight:600;line-height:1">${t.last30d || 0}</p>
                </td>
                <td width="8"></td>
                <td style="padding:12px;background:#f5efe6;border-radius:8px;width:50%" valign="top">
                  <p style="margin:0;font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:#8a8174;font-weight:500">${L.actionsLabel}</p>
                  <p style="margin:6px 0 0 0;font-size:32px;font-weight:600;line-height:1">${at.today || 0}</p>
                  <p style="margin:4px 0 0 0;font-size:12px;color:#5d544a">${at.last7d || 0} (7d)</p>
                </td>
              </tr>
            </table>

            <h2 style="margin:24px 0 8px 0;font-size:14px;color:#2b251f">${L.sectionAlerts}</h2>
            ${alertsHtml}

            <h2 style="margin:24px 0 12px 0;font-size:14px;color:#2b251f">${L.sectionTrends}</h2>
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;background:#f5efe6;border-radius:8px;padding:8px"><tr>${trendBars}</tr></table>

            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px">
              <tr>
                <td valign="top" style="padding-right:8px;width:50%">
                  <h2 style="margin:0 0 8px 0;font-size:14px;color:#2b251f">${L.sectionOutcomes}</h2>
                  <ul style="margin:0;padding-left:20px;font-size:13px;color:#5d544a">${formatList(data.outcomeBreakdown || [], 'key')}</ul>
                </td>
                <td valign="top" style="padding-left:8px;width:50%">
                  <h2 style="margin:0 0 8px 0;font-size:14px;color:#2b251f">${L.sectionIntents}</h2>
                  <ul style="margin:0;padding-left:20px;font-size:13px;color:#5d544a">${formatList(data.intentBreakdown || [], 'key')}</ul>
                </td>
              </tr>
              <tr>
                <td colspan="2" valign="top" style="padding-top:16px">
                  <h2 style="margin:0 0 8px 0;font-size:14px;color:#2b251f">${L.sectionDomains}</h2>
                  <ul style="margin:0;padding-left:20px;font-size:13px;color:#5d544a">${formatList(data.topDomains || [], 'domain')}</ul>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 24px;background:#f5efe6;border-top:1px solid rgba(43,37,31,0.08);font-size:11px;color:#8a8174">
            ${escapeHtml(L.footer)}
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;

  // Plain-text version
  const text = [
    L.subject,
    '',
    `${L.kTodayLabel}: ${t.today || 0} (${L.kYesterdayLabel.toLowerCase()}: ${t.yesterday || 0}, ${deltaSign})`,
    `${L.k7dLabel}: ${t.last7d || 0} (${(t.last7dAvgPerDay || 0).toFixed(1)} ${L.avgLabel})`,
    `${L.k30dLabel}: ${t.last30d || 0}`,
    `${L.actionsLabel}: ${at.today || 0}`,
    '',
    `${L.sectionAlerts}: ${alerts.length === 0 ? L.emptyAlerts : alerts.map((a) => '- ' + a.message).join('\n')}`,
    '',
    `${L.sectionOutcomes}: ${(data.outcomeBreakdown || []).slice(0, 5).map((i) => i.key + ' (' + i.count + ')').join(', ') || '—'}`,
    `${L.sectionIntents}: ${(data.intentBreakdown || []).slice(0, 5).map((i) => i.key + ' (' + i.count + ')').join(', ') || '—'}`,
    `${L.sectionDomains}: ${(data.topDomains || []).slice(0, 5).map((i) => i.domain + ' (' + i.count + ')').join(', ') || '—'}`,
    '',
    L.footer,
  ].join('\n');

  return {
    subject: L.subject,
    html,
    text,
  };
}

module.exports = {
  buildDigest,
};
