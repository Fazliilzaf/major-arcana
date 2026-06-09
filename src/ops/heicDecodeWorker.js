'use strict';

// Worker-tråd: avkodar HEIC/HEIF → JPEG-buffer via heic-convert (CPU-tungt,
// WASM). Körs utanför huvud-event-loopen så servern förblir responsiv och
// flera avkodningar kan ske parallellt utan att blockera hälsokollen.

const { parentPort } = require('node:worker_threads');

if (!parentPort) {
  throw new Error('heicDecodeWorker måste köras som worker_thread.');
}

parentPort.on('message', async (msg) => {
  const { id, buffer } = msg || {};
  try {
    // eslint-disable-next-line global-require
    const heicConvert = require('heic-convert');
    const out = await heicConvert({
      buffer: Buffer.from(buffer),
      format: 'JPEG',
      quality: 0.8,
    });
    const u8 = out instanceof Uint8Array ? out : Buffer.from(out);
    const ab = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
    parentPort.postMessage({ id, ok: true, buffer: ab }, [ab]);
  } catch (e) {
    parentPort.postMessage({ id, ok: false, error: (e && e.message) || String(e) });
  }
});
