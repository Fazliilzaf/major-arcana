'use strict';

/**
 * WebRTC Signaling Server.
 *
 * Handles room creation, peer connection negotiation (offer/answer/ICE),
 * and room lifecycle tied to booking encounters.
 *
 * Transport: WebSocket (ws) on /api/v1/video/signal
 * Security: Token-based room access (patient gets one-time token, staff uses session)
 */

const crypto = require('node:crypto');

function normalizeText(v) {
  return typeof v === 'string' ? v.trim() : '';
}
function nowIso() {
  return new Date().toISOString();
}

const ROOM_STATUSES = Object.freeze(['waiting', 'active', 'ended']);
const ICE_SERVERS = Object.freeze([
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
]);

function createSignalingService() {
  const rooms = new Map();
  const tokenToRoom = new Map();

  function resolveIceServers() {
    const turnUrl = normalizeText(process.env.TURN_SERVER_URL);
    const turnUser = normalizeText(process.env.TURN_USERNAME);
    const turnCredential = normalizeText(process.env.TURN_CREDENTIAL);

    const servers = [...ICE_SERVERS];
    if (turnUrl && turnCredential) {
      servers.push({
        urls: turnUrl,
        username: turnUser || 'arcana',
        credential: turnCredential,
      });
    }
    return servers;
  }

  function createRoom({ encounterId, tenantId, serviceLabel, patientName, hostUserId }) {
    const roomId = normalizeText(encounterId) || crypto.randomUUID();
    const patientToken = crypto.randomBytes(32).toString('base64url');
    const hostToken = crypto.randomBytes(32).toString('base64url');

    const room = {
      roomId,
      encounterId: normalizeText(encounterId),
      tenantId: normalizeText(tenantId),
      serviceLabel: normalizeText(serviceLabel),
      patientName: normalizeText(patientName),
      hostUserId: normalizeText(hostUserId),
      status: 'waiting',
      patientToken,
      hostToken,
      peers: new Map(),
      createdAt: nowIso(),
      startedAt: null,
      endedAt: null,
      recordingEnabled: false,
      transcriptionEnabled: false,
    };

    rooms.set(roomId, room);
    tokenToRoom.set(patientToken, { roomId, role: 'patient' });
    tokenToRoom.set(hostToken, { roomId, role: 'host' });

    return {
      roomId,
      patientToken,
      hostToken,
      patientUrl: `/video/join/${patientToken}`,
      hostUrl: `/video/join/${hostToken}`,
      iceServers: resolveIceServers(),
    };
  }

  function joinRoom(token) {
    const entry = tokenToRoom.get(token);
    if (!entry) return null;
    const room = rooms.get(entry.roomId);
    if (!room || room.status === 'ended') return null;
    return { room, role: entry.role, iceServers: resolveIceServers() };
  }

  function startRoom(roomId) {
    const room = rooms.get(roomId);
    if (!room) return null;
    room.status = 'active';
    room.startedAt = nowIso();
    return room;
  }

  function endRoom(roomId) {
    const room = rooms.get(roomId);
    if (!room) return null;
    room.status = 'ended';
    room.endedAt = nowIso();
    room.peers.clear();
    return room;
  }

  function getRoom(roomId) {
    return rooms.get(roomId) || null;
  }

  function enableRecording(roomId) {
    const room = rooms.get(roomId);
    if (!room) return null;
    room.recordingEnabled = true;
    room.transcriptionEnabled = true;
    return room;
  }

  function listActiveRooms(tenantId) {
    const tid = normalizeText(tenantId);
    const active = [];
    for (const room of rooms.values()) {
      if (room.status !== 'ended' && (!tid || room.tenantId === tid)) {
        active.push({
          roomId: room.roomId,
          status: room.status,
          patientName: room.patientName,
          serviceLabel: room.serviceLabel,
          createdAt: room.createdAt,
          startedAt: room.startedAt,
        });
      }
    }
    return active;
  }

  function handleSignalingMessage(roomId, peerId, message) {
    const room = rooms.get(roomId);
    if (!room) return { error: 'room_not_found' };

    const { type, payload } = message || {};
    switch (type) {
      case 'offer':
      case 'answer':
      case 'ice-candidate':
        return { broadcast: true, from: peerId, type, payload };
      case 'join':
        room.peers.set(peerId, { joinedAt: nowIso(), role: payload?.role || 'unknown' });
        if (room.status === 'waiting' && room.peers.size >= 2) {
          room.status = 'active';
          room.startedAt = nowIso();
        }
        return {
          broadcast: true,
          from: peerId,
          type: 'peer-joined',
          payload: { peerId, role: payload?.role },
        };
      case 'leave':
        room.peers.delete(peerId);
        if (room.peers.size === 0 && room.status === 'active') {
          room.status = 'ended';
          room.endedAt = nowIso();
        }
        return { broadcast: true, from: peerId, type: 'peer-left', payload: { peerId } };
      default:
        return { error: 'unknown_message_type' };
    }
  }

  return {
    createRoom,
    joinRoom,
    startRoom,
    endRoom,
    getRoom,
    enableRecording,
    listActiveRooms,
    handleSignalingMessage,
    resolveIceServers,
    ROOM_STATUSES,
  };
}

module.exports = { createSignalingService, ICE_SERVERS, ROOM_STATUSES };
