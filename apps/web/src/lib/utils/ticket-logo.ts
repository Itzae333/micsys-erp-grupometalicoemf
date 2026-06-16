import { resolveLogoUrl } from '@/components/brand/Logo';

/** Retorna el logo a usar en tickets: ubicacion primero, empresa como fallback */
export function getTicketLogoUrl(
  empresa?: { logo_url?: string | null } | null,
  ubicacion?: { logo_url?: string | null } | null,
): string | null {
  return ubicacion?.logo_url ?? empresa?.logo_url ?? null;
}

/**
 * Rasteriza un logo con la Canvas API del browser y lo codifica como
 * comando ESC/POS "GS v 0" (bitmap de 1 bit) en base64.
 * Retorna null si no se puede cargar o renderizar la imagen.
 *
 * El print-bridge inserta estos bytes directamente en el buffer ESC/POS
 * — sin necesidad de librerías extra en el servidor local.
 */
export async function logoToEscPosBase64(
  logoUrl: string,
  columns = 48,
): Promise<string | null> {
  try {
    const src = resolveLogoUrl(logoUrl);
    const widthPx = columns * 8; // 48 cols × 8px = 384px para papel de 80 mm

    // Fetch como blob para evitar restricciones de canvas taint (CORS)
    const resp = await fetch(src);
    if (!resp.ok) return null;
    const blob = await resp.blob();
    const blobUrl = URL.createObjectURL(blob);

    try {
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Image load failed'));
        img.src = blobUrl;
      });

      // Escalar manteniendo proporción; máx. 120px alto para no desperdiciar papel
      const scale = Math.min(widthPx / img.naturalWidth, 120 / img.naturalHeight, 1);
      const drawW = Math.round(img.naturalWidth * scale);
      const drawH = Math.round(img.naturalHeight * scale);
      const offsetX = Math.floor((widthPx - drawW) / 2); // centrado

      const canvas = document.createElement('canvas');
      canvas.width = widthPx;
      canvas.height = drawH;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, widthPx, drawH);
      ctx.drawImage(img, offsetX, 0, drawW, drawH);

      const imageData = ctx.getImageData(0, 0, widthPx, drawH);
      const widthBytes = Math.ceil(widthPx / 8);
      const bytes: number[] = [];

      // Cabecera GS v 0: GS 0x76 0x30 mode xL xH yL yH
      const xL = widthBytes & 0xFF;
      const xH = (widthBytes >> 8) & 0xFF;
      const yL = drawH & 0xFF;
      const yH = (drawH >> 8) & 0xFF;
      bytes.push(0x1D, 0x76, 0x30, 0x00, xL, xH, yL, yH);

      // Datos de bitmap: 1 bit por píxel, MSB primero; píxel oscuro = 1
      for (let y = 0; y < drawH; y++) {
        for (let xByte = 0; xByte < widthBytes; xByte++) {
          let b = 0;
          for (let bit = 0; bit < 8; bit++) {
            const x = xByte * 8 + bit;
            if (x < widthPx) {
              const i = (y * widthPx + x) * 4;
              const r = imageData.data[i];
              const g = imageData.data[i + 1];
              const bv = imageData.data[i + 2];
              const a = imageData.data[i + 3];
              const lum = (r * 0.299 + g * 0.587 + bv * 0.114) * (a / 255);
              if (lum < 128) b |= (0x80 >> bit);
            }
          }
          bytes.push(b);
        }
      }

      // Codificar a base64 sin Buffer (browser)
      let binary = '';
      for (const byte of bytes) binary += String.fromCharCode(byte);
      return btoa(binary);
    } finally {
      URL.revokeObjectURL(blobUrl);
    }
  } catch {
    return null;
  }
}
