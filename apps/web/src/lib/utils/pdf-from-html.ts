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

    const canvas = await html2canvas(pageEl, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
    });

    const imgData = canvas.toDataURL('image/jpeg', 0.92);
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
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
