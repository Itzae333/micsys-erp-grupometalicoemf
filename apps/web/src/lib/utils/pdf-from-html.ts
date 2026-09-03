import jsPDF from 'jspdf';
import html2canvas from 'html2canvas-pro';

export function sanitizeFilename(s: string): string {
  return s
    .replace(/[\\/:*?"<>|]/g, '')
    .trim()
    .replace(/\s+/g, ' ');
}

function waitForImages(doc: Document): Promise<void> {
  const imgs = Array.from(doc.images);
  return Promise.all(imgs.map((img) => {
    if (img.complete) return Promise.resolve();
    return new Promise<void>((resolve) => {
      img.onload = () => resolve();
      img.onerror = () => resolve();
      setTimeout(resolve, 3000);
    });
  })).then(() => undefined);
}

// El corte de página final trabaja sobre el canvas rasterizado (px), pero acá
// solo tenemos el DOM en px CSS — como html2canvas preserva el aspect ratio y
// la imagen se estira para que su ancho sea exactamente `pageWidthMm`, la
// misma proporción px/mm del ancho aplica también al alto.
function pageHeightInDomPx(pageEl: HTMLElement, pageHeightMm: number, pageWidthMm: number): number {
  return pageHeightMm * (pageEl.getBoundingClientRect().width / pageWidthMm);
}

function avoidRowSplitAcrossPages(pageEl: HTMLElement, pageHeightMm: number, pageWidthMm: number): void {
  const pageHeightPx = pageHeightInDomPx(pageEl, pageHeightMm, pageWidthMm);
  if (!(pageHeightPx > 0)) return;

  const top0 = pageEl.getBoundingClientRect().top;
  let boundary = pageHeightPx;
  let guard = 0;

  // Cada iteración puede desplazar todo lo que sigue hacia abajo, así que las
  // posiciones se vuelven a medir del DOM real en cada vuelta en vez de
  // calcularlas una sola vez por adelantado.
  while (guard++ < 500) {
    const rows = Array.from(pageEl.querySelectorAll<HTMLElement>('tr'));
    const totalHeight = pageEl.getBoundingClientRect().height;
    if (boundary >= totalHeight) break;

    const offending = rows.find((tr) => {
      const rect = tr.getBoundingClientRect();
      const top = rect.top - top0;
      const bottom = rect.bottom - top0;
      // Solo cuenta como "partida" si el corte cae realmente adentro de la
      // fila (no justo en su borde) — evita empujar filas que ya cierran
      // exacto en el límite de página.
      return top < boundary - 0.5 && bottom > boundary + 0.5;
    });

    if (!offending) { boundary += pageHeightPx; continue; }

    const rect = offending.getBoundingClientRect();
    const push = boundary - (rect.top - top0);
    if (!(push > 0)) { boundary += pageHeightPx; continue; }

    const cells = offending.querySelectorAll<HTMLElement>('td, th');
    cells.forEach((cell) => {
      const current = parseFloat(getComputedStyle(cell).paddingTop) || 0;
      cell.style.paddingTop = `${current + push}px`;
    });

    boundary += pageHeightPx;
  }
}

// Renderiza un documento HTML completo (con estilos inline) fuera de pantalla,
// lo rasteriza y arma un PDF paginado que se descarga automáticamente.
export async function downloadHtmlAsPdf(html: string, pageSelector: string, filename: string): Promise<void> {
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.left = '-10000px';
  iframe.style.top = '0';
  iframe.style.width = '900px';
  iframe.style.height = '1200px';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  try {
    const doc = iframe.contentDocument;
    if (!doc) throw new Error('No se pudo preparar el documento');
    doc.open();
    doc.write(html);
    doc.close();

    await new Promise<void>((resolve) => {
      if (doc.readyState === 'complete') resolve();
      else iframe.addEventListener('load', () => resolve(), { once: true });
    });
    await waitForImages(doc);

    const pageEl = doc.querySelector<HTMLElement>(pageSelector);
    if (!pageEl) throw new Error('No se pudo generar el contenido del documento');

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();

    // Evita que una fila de tabla quede partida entre dos páginas: la imagen
    // final se corta mecánicamente cada `pageHeight` de alto (ver el loop de
    // abajo), sin saber dónde termina cada <tr> — antes de rasterizar, se
    // empuja hacia abajo (con padding-top) cualquier fila que el corte fuera
    // a partir a la mitad, para que arranque limpia en la siguiente página.
    avoidRowSplitAcrossPages(pageEl, pageHeight, pageWidth);

    const canvas = await html2canvas(pageEl, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
    });

    const imgData = canvas.toDataURL('image/jpeg', 0.92);
    const imgWidth = pageWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    let heightLeft = imgHeight;
    let position = 0;
    pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;
    while (heightLeft > 0) {
      position -= pageHeight;
      pdf.addPage();
      pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }

    pdf.save(filename);
  } finally {
    document.body.removeChild(iframe);
  }
}
