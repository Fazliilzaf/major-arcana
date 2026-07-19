'use strict';

// ORD-71-svansen: Insyn + städning för auth-storens arkivfiler via API.
//
// Bakgrund: auth-wipe-incidenten lämnade /var/data/auth.json.oversize.bak;
// den får raderas först när arkivrotationen (.archive-YYYYMM.jsonl) är
// verifierad. ssh/one-off når inte disken maskinellt → owner-API:
//   GET    /api/v1/ops/auth-store/archive-status  → antal events, arkivfiler,
//          oversize-bak-status. Läser ENDAST metadata + räknar rader — aldrig
//          eventinnehåll ut via API:t.
//   DELETE /api/v1/ops/auth-store/oversize-bak    → raderar .oversize.bak,
//          MEN endast om minst en arkivfil med innehåll finns (fail-closed;
//          ?force=true kringgår INTE guarden — den finns inte).

const express = require('express');
const fs = require('fs');
const path = require('path');

function createOpsAuthStoreArchiveRouter({
  config,
  requireCcoAuthenticated,
  attachRole,
  requireAnyRole,
  auditLog = null,
  logger = console,
}) {
  const router = express.Router();
  router.use(requireCcoAuthenticated, attachRole, requireAnyRole(['owner']));

  const authStorePath = String(config?.authStorePath || '/var/data/auth.json');
  const dir = path.dirname(authStorePath);
  const baseName = path.basename(authStorePath);

  function listArchives() {
    let entries = [];
    try {
      entries = fs.readdirSync(dir);
    } catch (_) {
      return [];
    }
    return entries
      .filter((name) => name.startsWith(`${baseName}.archive-`) && name.endsWith('.jsonl'))
      .map((name) => {
        const p = path.join(dir, name);
        let sizeBytes = 0;
        let lineCount = 0;
        try {
          const stat = fs.statSync(p);
          sizeBytes = stat.size;
          if (sizeBytes > 0) {
            const raw = fs.readFileSync(p, 'utf8');
            lineCount = raw.split('\n').filter(Boolean).length;
          }
        } catch (_) {
          /* metadata-fel redovisas som 0 — aldrig krasch */
        }
        return { name, sizeBytes, lineCount };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  function oversizeBakStatus() {
    const p = `${authStorePath}.oversize.bak`;
    try {
      const stat = fs.statSync(p);
      return { path: p, exists: true, sizeBytes: stat.size, mtime: stat.mtime.toISOString() };
    } catch (_) {
      return { path: p, exists: false };
    }
  }

  router.get('/auth-store/archive-status', (req, res) => {
    let auditEventsCount = null;
    try {
      const raw = JSON.parse(fs.readFileSync(authStorePath, 'utf8'));
      if (Array.isArray(raw.auditEvents)) auditEventsCount = raw.auditEvents.length;
    } catch (_) {
      /* count null = okänt, redovisas ärligt */
    }
    return res.json({
      ok: true,
      authStorePath,
      auditEventsCount,
      archives: listArchives(),
      oversizeBak: oversizeBakStatus(),
    });
  });

  router.delete('/auth-store/oversize-bak', (req, res) => {
    const bak = oversizeBakStatus();
    if (!bak.exists) {
      return res.json({ ok: true, deleted: false, reason: 'already_gone', path: bak.path });
    }
    const archivesWithContent = listArchives().filter((a) => a.sizeBytes > 0 && a.lineCount > 0);
    if (archivesWithContent.length === 0) {
      return res.status(409).json({
        ok: false,
        error:
          'Fail-closed: ingen arkivfil med innehåll funnen — verifiera arkivrotationen innan .oversize.bak raderas.',
      });
    }
    try {
      fs.unlinkSync(bak.path);
    } catch (err) {
      return res.status(500).json({ ok: false, error: err.message });
    }
    logger.warn(`[ops/auth-archive] oversize.bak raderad (${bak.sizeBytes} bytes)`);
    if (auditLog?.append) {
      try {
        auditLog.append({
          action: 'auth_store_oversize_bak_delete',
          actor: { role: 'owner', userId: req.ccoUser?.id || null, ip: req.ip || null },
          detail: { sizeBytes: bak.sizeBytes, archives: archivesWithContent.length },
        });
      } catch (err) {
        logger.warn(`[ops/auth-archive] audit misslyckades: ${err.message}`);
      }
    }
    return res.json({ ok: true, deleted: true, path: bak.path, freedBytes: bak.sizeBytes });
  });

  return router;
}

module.exports = { createOpsAuthStoreArchiveRouter };
