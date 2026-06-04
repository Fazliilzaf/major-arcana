'use strict';

/**
 * AI Meeting Transcription & Notes.
 *
 * Pipeline:
 * 1. Audio chunks from WebRTC (online) or device mic (physical) → buffer
 * 2. Buffer → Whisper API (speech-to-text)
 * 3. Full transcript → GPT summarization
 * 4. Summary + transcript → save to journal as encounter note
 *
 * Works for both online (WebRTC) and physical (mic recording) sessions.
 *
 * Env: OPENAI_API_KEY (required for transcription + summary)
 */

const crypto = require('node:crypto');

function normalizeText(v) {
  return typeof v === 'string' ? v.trim() : '';
}
function nowIso() {
  return new Date().toISOString();
}

const SESSION_STATUSES = Object.freeze([
  'recording',
  'transcribing',
  'summarizing',
  'complete',
  'failed',
]);

function createMeetingTranscriptionService() {
  const sessions = new Map();

  function startSession({ encounterId, roomId, tenantId, patientId, operatorId, mode = 'online' }) {
    const sessionId = crypto.randomUUID();
    const session = {
      sessionId,
      encounterId: normalizeText(encounterId),
      roomId: normalizeText(roomId),
      tenantId: normalizeText(tenantId),
      patientId: normalizeText(patientId),
      operatorId: normalizeText(operatorId),
      mode, // 'online' (WebRTC) or 'physical' (device mic)
      status: 'recording',
      audioChunks: [],
      transcript: null,
      summary: null,
      keyPoints: [],
      clinicalNotes: null,
      startedAt: nowIso(),
      endedAt: null,
      durationMs: 0,
      error: null,
    };
    sessions.set(sessionId, session);
    return { sessionId, status: 'recording' };
  }

  function addAudioChunk(sessionId, chunk) {
    const session = sessions.get(sessionId);
    if (!session || session.status !== 'recording') return false;
    session.audioChunks.push({
      data: chunk,
      timestamp: nowIso(),
      index: session.audioChunks.length,
    });
    return true;
  }

  async function stopRecording(sessionId) {
    const session = sessions.get(sessionId);
    if (!session) return null;
    session.status = 'transcribing';
    session.endedAt = nowIso();
    session.durationMs = new Date(session.endedAt) - new Date(session.startedAt);
    return { sessionId, status: 'transcribing', durationMs: session.durationMs };
  }

  async function transcribe(sessionId) {
    const session = sessions.get(sessionId);
    if (!session) return null;

    const apiKey = normalizeText(process.env.OPENAI_API_KEY);
    if (!apiKey) {
      session.status = 'failed';
      session.error = 'OPENAI_API_KEY saknas — kan inte transkribera.';
      return { sessionId, status: 'failed', error: session.error };
    }

    try {
      session.status = 'transcribing';

      // In production: send audio to Whisper API
      // For now: simulate transcription if no real audio
      if (session.audioChunks.length === 0) {
        session.transcript = '[Ingen ljuddata tillgänglig — transkribering kräver inspelat ljud]';
      } else {
        const FormData = globalThis.FormData || require('node:buffer').FormData;
        const audioBuffer = Buffer.concat(
          session.audioChunks.map((c) =>
            Buffer.isBuffer(c.data) ? c.data : Buffer.from(c.data || '')
          )
        );

        const formData = new FormData();
        const audioBlob = new Blob([audioBuffer], { type: 'audio/webm' });
        formData.append('file', audioBlob, 'meeting.webm');
        formData.append('model', 'whisper-1');
        formData.append('language', 'sv');
        formData.append('response_format', 'verbose_json');

        const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}` },
          body: formData,
        });

        if (!res.ok) {
          const errData = await res.text();
          throw new Error(`Whisper API ${res.status}: ${errData.slice(0, 200)}`);
        }

        const data = await res.json();
        session.transcript = data.text || '';
      }

      session.status = 'summarizing';
      return { sessionId, status: 'summarizing', transcript: session.transcript };
    } catch (err) {
      session.status = 'failed';
      session.error = err.message;
      return { sessionId, status: 'failed', error: err.message };
    }
  }

  async function summarize(sessionId) {
    const session = sessions.get(sessionId);
    if (!session || !session.transcript) return null;

    const apiKey = normalizeText(process.env.OPENAI_API_KEY);
    if (!apiKey) {
      session.status = 'failed';
      session.error = 'OPENAI_API_KEY saknas.';
      return { sessionId, status: 'failed', error: session.error };
    }

    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: `Du är en medicinsk sekreterare på en hårtransplantationsklinik. Sammanfatta följande mötesanteckningar. Svara på svenska med:
1. **Sammanfattning** (2-3 meningar)
2. **Nyckelpunkter** (bullet points)
3. **Kliniska noteringar** (behandlingsrelevant information, om tillämpligt)
4. **Nästa steg** (överenskomna åtgärder)

VIKTIGT: Inkludera ALDRIG personnummer, fullständigt namn eller andra känsliga identifierare i sammanfattningen. Använd "patienten" istället.`,
            },
            { role: 'user', content: session.transcript },
          ],
          temperature: 0.3,
          max_tokens: 1000,
        }),
      });

      if (!res.ok) {
        throw new Error(`GPT API ${res.status}`);
      }

      const data = await res.json();
      const content = data.choices?.[0]?.message?.content || '';

      session.summary = content;
      session.keyPoints = extractKeyPoints(content);
      session.clinicalNotes = extractClinicalNotes(content);
      session.status = 'complete';

      return {
        sessionId,
        status: 'complete',
        summary: session.summary,
        keyPoints: session.keyPoints,
        clinicalNotes: session.clinicalNotes,
        durationMs: session.durationMs,
      };
    } catch (err) {
      session.status = 'failed';
      session.error = err.message;
      return { sessionId, status: 'failed', error: err.message };
    }
  }

  function extractKeyPoints(content) {
    const lines = content.split('\n');
    const points = [];
    let inBullets = false;
    for (const line of lines) {
      if (/nyckelpunkt/i.test(line) || /key.*point/i.test(line)) {
        inBullets = true;
        continue;
      }
      if (inBullets && /^[-•*]\s/.test(line.trim())) {
        points.push(line.trim().replace(/^[-•*]\s*/, ''));
      } else if (inBullets && /^#{1,3}\s/.test(line)) {
        inBullets = false;
      }
    }
    return points.slice(0, 10);
  }

  function extractClinicalNotes(content) {
    const match = content.match(/klinisk[ae]?\s*noter.*?\n([\s\S]*?)(?=\n#{1,3}\s|\n\*\*|$)/i);
    return match ? match[1].trim() : null;
  }

  async function processFullPipeline(sessionId) {
    await stopRecording(sessionId);
    const transcribeResult = await transcribe(sessionId);
    if (transcribeResult?.status === 'failed') return transcribeResult;
    return summarize(sessionId);
  }

  function getSession(sessionId) {
    return sessions.get(sessionId) || null;
  }

  function getSessionResult(sessionId) {
    const session = sessions.get(sessionId);
    if (!session) return null;
    return {
      sessionId: session.sessionId,
      encounterId: session.encounterId,
      patientId: session.patientId,
      status: session.status,
      mode: session.mode,
      transcript: session.transcript,
      summary: session.summary,
      keyPoints: session.keyPoints,
      clinicalNotes: session.clinicalNotes,
      durationMs: session.durationMs,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      error: session.error,
    };
  }

  return {
    startSession,
    addAudioChunk,
    stopRecording,
    transcribe,
    summarize,
    processFullPipeline,
    getSession,
    getSessionResult,
    SESSION_STATUSES,
  };
}

module.exports = { createMeetingTranscriptionService, SESSION_STATUSES };
