'use strict';

const express = require('express');

function normalizeText(v) {
  return typeof v === 'string' ? v.trim() : '';
}

function createVideoRouter({ authStore, signalingService, transcriptionService }) {
  const router = express.Router();
  const requireAuth = authStore.requireAuth;
  const requireRole = authStore.requireRole;
  const ROLE_OWNER = 'OWNER';
  const ROLE_STAFF = 'STAFF';

  // --- Room management (staff/owner) ---

  router.post('/video/rooms', requireAuth, requireRole(ROLE_OWNER, ROLE_STAFF), (req, res) => {
    const room = signalingService.createRoom({
      encounterId: req.body?.encounterId,
      tenantId: req.body?.tenantId || 'default',
      serviceLabel: req.body?.serviceLabel,
      patientName: req.body?.patientName,
      hostUserId: req.user?.id || req.body?.hostUserId,
    });
    return res.json({ ok: true, ...room });
  });

  router.get('/video/rooms', requireAuth, requireRole(ROLE_OWNER, ROLE_STAFF), (req, res) => {
    const rooms = signalingService.listActiveRooms(req.query?.tenantId);
    return res.json({ ok: true, rooms });
  });

  router.get(
    '/video/rooms/:roomId',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    (req, res) => {
      const room = signalingService.getRoom(req.params.roomId);
      if (!room) return res.status(404).json({ ok: false, error: 'room_not_found' });
      return res.json({
        ok: true,
        room: {
          roomId: room.roomId,
          status: room.status,
          patientName: room.patientName,
          startedAt: room.startedAt,
          peers: room.peers.size,
        },
      });
    }
  );

  router.post(
    '/video/rooms/:roomId/end',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    (req, res) => {
      const room = signalingService.endRoom(req.params.roomId);
      if (!room) return res.status(404).json({ ok: false, error: 'room_not_found' });
      return res.json({ ok: true, status: 'ended' });
    }
  );

  router.post(
    '/video/rooms/:roomId/record',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    (req, res) => {
      const room = signalingService.enableRecording(req.params.roomId);
      if (!room) return res.status(404).json({ ok: false, error: 'room_not_found' });
      return res.json({ ok: true, recordingEnabled: true, transcriptionEnabled: true });
    }
  );

  router.get('/video/ice-servers', requireAuth, requireRole(ROLE_OWNER, ROLE_STAFF), (req, res) => {
    return res.json({ ok: true, iceServers: signalingService.resolveIceServers() });
  });

  // --- Patient join (token-based, no auth) ---

  router.get('/video/join/:token', (req, res) => {
    const token = normalizeText(req.params?.token);
    if (!token) return res.status(400).json({ ok: false, error: 'missing_token' });
    const result = signalingService.joinRoom(token);
    if (!result) return res.status(404).json({ ok: false, error: 'room_not_found_or_ended' });
    return res.json({
      ok: true,
      roomId: result.room.roomId,
      role: result.role,
      patientName: result.room.patientName,
      serviceLabel: result.room.serviceLabel,
      iceServers: result.iceServers,
      status: result.room.status,
    });
  });

  // --- Transcription / AI notes ---

  router.post(
    '/video/transcription/start',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    (req, res) => {
      const session = transcriptionService.startSession({
        encounterId: req.body?.encounterId,
        roomId: req.body?.roomId,
        tenantId: req.body?.tenantId || 'default',
        patientId: req.body?.patientId,
        operatorId: req.user?.id || req.body?.operatorId,
        mode: req.body?.mode || 'online',
      });
      return res.json({ ok: true, ...session });
    }
  );

  router.post(
    '/video/transcription/:sessionId/audio',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    (req, res) => {
      const added = transcriptionService.addAudioChunk(
        req.params.sessionId,
        req.body?.chunk || req.body
      );
      if (!added)
        return res.status(404).json({ ok: false, error: 'session_not_found_or_not_recording' });
      return res.json({ ok: true });
    }
  );

  router.post(
    '/video/transcription/:sessionId/stop',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      const result = await transcriptionService.processFullPipeline(req.params.sessionId);
      if (!result) return res.status(404).json({ ok: false, error: 'session_not_found' });
      return res.json({ ok: true, ...result });
    }
  );

  router.get(
    '/video/transcription/:sessionId',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    (req, res) => {
      const result = transcriptionService.getSessionResult(req.params.sessionId);
      if (!result) return res.status(404).json({ ok: false, error: 'session_not_found' });
      return res.json({ ok: true, ...result });
    }
  );

  return router;
}

module.exports = { createVideoRouter };
