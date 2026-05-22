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

  async function compressForUpload(file, options = {}) {
    if (!file || typeof File === 'undefined') return file;
    const maxEdge = Number(options.maxEdge) > 0 ? Number(options.maxEdge) : 2048;
    const quality = Number(options.quality) > 0 ? Number(options.quality) : 0.86;
    const skipBelowBytes =
      Number(options.skipBelowBytes) > 0 ? Number(options.skipBelowBytes) : 450000;
    const name = String(file.name || 'konsultationsbild.jpg');
    const isHeic = /\.heic$|\.heif$/i.test(name) || /heic|heif/i.test(String(file.type || ''));

    if (!isHeic && file.size <= skipBelowBytes) {
      return file;
    }

    try {
      const dataUrl = await readFileAsDataUrl(file);
      const image = await loadImageFromDataUrl(dataUrl);
      const scale = Math.min(1, maxEdge / Math.max(image.width, image.height, 1));
      const width = Math.max(1, Math.round(image.width * scale));
      const height = Math.max(1, Math.round(image.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return file;
      ctx.drawImage(image, 0, 0, width, height);
      const blob = await new Promise((resolve) => {
        canvas.toBlob(resolve, 'image/jpeg', quality);
      });
      if (!blob) return file;
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
