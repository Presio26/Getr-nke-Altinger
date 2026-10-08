/**
 * Bilder im Browser verkleinern (z. B. Zustellfoto des Fahrers), bevor sie übertragen werden.
 */

async function loadBitmap(file: Blob): Promise<{ source: CanvasImageSource; width: number; height: number; close(): void }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
    } catch {
      // Fallback unten (ältere Safari-Versionen)
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Das Bild konnte nicht gelesen werden.'));
      el.src = url;
    });
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => URL.revokeObjectURL(url) };
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
}

/**
 * Verkleinert ein Bild auf höchstens `maxSize` Pixel (längste Kante) und liefert eine JPEG-Data-URL.
 * @param quality 0–1 (Default 0.78)
 */
export async function compressImage(file: Blob, maxSize = 1280, quality = 0.78): Promise<string> {
  if (!file.type.startsWith('image/') && file.type !== '') {
    throw new Error('Bitte wählen Sie eine Bilddatei aus.');
  }
  const bmp = await loadBitmap(file);
  try {
    const scale = Math.min(1, maxSize / Math.max(bmp.width, bmp.height, 1));
    const w = Math.max(1, Math.round(bmp.width * scale));
    const h = Math.max(1, Math.round(bmp.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Das Bild konnte nicht verarbeitet werden.');
    // weißer Hintergrund für transparente PNGs
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bmp.source, 0, 0, w, h);
    return canvas.toDataURL('image/jpeg', Math.min(1, Math.max(0.1, quality)));
  } finally {
    bmp.close();
  }
}

/** Ungefähre Größe einer Data-URL in Bytes */
export function dataUrlBytes(dataUrl: string): number {
  const i = dataUrl.indexOf(',');
  const b64 = i >= 0 ? dataUrl.slice(i + 1) : dataUrl;
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((b64.length * 3) / 4) - padding);
}

/** Datei als Data-URL lesen (ohne Verkleinerung) */
export function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Die Datei konnte nicht gelesen werden.'));
    reader.readAsDataURL(file);
  });
}
