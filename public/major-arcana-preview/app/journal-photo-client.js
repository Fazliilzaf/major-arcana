/**
 * Klienthjälpare för journalbilder — komprimering före upload på mobil.
 */
(() => {
  'use strict';

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error || new Error('Kunde inte läsa bildfil.'));
      reader.readAsDataURL(file);
    });
  }

  function loadImageFromDataUrl(dataUrl) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Kunde inte tolka bilden.'));
      image.src = dataUrl;
    });
  }

  function withTimeout(promise, ms, label) {
    let timer = null;
    return Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = window.setTimeout(
          () => reject(new Error(`${label || 'operation'} tog för lång tid.`)),
          ms
        );
      }),
    ]).finally(() => {
      if (timer) window.clearTimeout(timer);
    });
  }

  function yieldToMain() {
    return new Promise((resolve) => {
      window.setTimeout(resolve, 0);
    });
  }

  async function compressForUpload(file, options = {}) {
    if (!file || typeof File === 'undefined') return file;
    const maxEdge = Number(options.maxEdge) > 0 ? Number(options.maxEdge) : 2048;
    const quality = Number(options.quality) > 0 ? Number(options.quality) : 0.86;
    const skipBelowBytes =
      Number(options.skipBelowBytes) > 0 ? Number(options.skipBelowBytes) : 450000;
    const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : 12000;
    const name = String(file.name || 'konsultationsbild.jpg');
    const isHeic = /\.heic$|\.heif$/i.test(name) || /heic|heif/i.test(String(file.type || ''));

    if (!isHeic && file.size <= skipBelowBytes) {
      return file;
    }

    await yieldToMain();

    try {
      if (typeof createImageBitmap === 'function' && !isHeic) {
        const bitmap = await withTimeout(createImageBitmap(file), timeoutMs, 'Bilddecode');
        const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height, 1));
        const width = Math.max(1, Math.round(bitmap.width * scale));
        const height = Math.max(1, Math.round(bitmap.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          bitmap.close?.();
          return file;
        }
        ctx.drawImage(bitmap, 0, 0, width, height);
        bitmap.close?.();
        const blob = await withTimeout(
          new Promise((resolve) => {
            canvas.toBlob(resolve, 'image/jpeg', quality);
          }),
          timeoutMs,
          'Bildkomprimering'
        );
        if (!blob) return file;
        const nextName = name.replace(/\.(heic|heif|png|webp)$/i, '.jpg');
        return new File([blob], nextName.endsWith('.jpg') ? nextName : `${nextName}.jpg`, {
          type: 'image/jpeg',
          lastModified: Date.now(),
        });
      }

      const dataUrl = await withTimeout(readFileAsDataUrl(file), timeoutMs, 'Bildläsning');
      await yieldToMain();
      const image = await withTimeout(loadImageFromDataUrl(dataUrl), timeoutMs, 'Bilddecode');
      const scale = Math.min(1, maxEdge / Math.max(image.width, image.height, 1));
      const width = Math.max(1, Math.round(image.width * scale));
      const height = Math.max(1, Math.round(image.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return file;
      ctx.drawImage(image, 0, 0, width, height);
      const blob = await withTimeout(
        new Promise((resolve) => {
          canvas.toBlob(resolve, 'image/jpeg', quality);
        }),
        timeoutMs,
        'Bildkomprimering'
      );
      if (!blob) return isHeic ? file : file;
      const nextName = name.replace(/\.(heic|heif|png|webp)$/i, '.jpg');
      return new File([blob], nextName.endsWith('.jpg') ? nextName : `${nextName}.jpg`, {
        type: 'image/jpeg',
        lastModified: Date.now(),
      });
    } catch {
      return file;
    }
  }

  window.ArcanaJournalPhotoClient = Object.freeze({
    compressForUpload,
  });
})();
