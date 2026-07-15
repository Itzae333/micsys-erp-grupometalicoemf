import { resolveLogoUrl } from '@/components/brand/Logo';

interface LineaPreview {
  clave: string;
  descripcion: string | null;
  cantidad: number;
}

interface TicketPreviewRemisionProps {
  logoUrl: string | null;
  folio: string | null;
  empresaOrigen: string;
  ubOrigen: string;
  empresaDestino: string;
  ubDestino: string;
  fecha: string;
  lineas: LineaPreview[];
  qrUrl?: string | null;
}

/** Vista previa del ticket de remisión — sin precios, cantidad y descripción únicamente. */
export function TicketPreviewRemision({
  logoUrl, folio, empresaOrigen, ubOrigen, empresaDestino, ubDestino, fecha, lineas, qrUrl,
}: TicketPreviewRemisionProps) {
  return (
    <div className="border border-steel-200 rounded-xl overflow-hidden bg-white text-[11px] font-mono max-w-xs">
      {/* Cabecera */}
      <div className="bg-steel-900 text-white px-4 py-3 text-center">
        {logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={resolveLogoUrl(logoUrl)}
            alt="Logo"
            className="h-8 w-auto mx-auto mb-1.5 object-contain"
          />
        )}
        <p className="font-bold text-[13px] tracking-wide uppercase">REMISIÓN DE ALMACÉN</p>
        <p className="text-steel-300 mt-0.5 font-bold">{folio ?? 'Se genera al enviar'}</p>
      </div>
      {/* Ruta */}
      <div className="px-4 py-2 border-b border-dashed border-steel-200 text-[10px] text-steel-600 space-y-0.5">
        <p><span className="font-semibold">ORIGEN:</span>  {empresaOrigen} / {ubOrigen}</p>
        <p><span className="font-semibold">DESTINO:</span> {empresaDestino} / {ubDestino}</p>
        <p><span className="font-semibold">Fecha:</span> {fecha}</p>
      </div>
      {/* Artículos */}
      <div className="px-4 py-2 border-b border-dashed border-steel-200">
        <div className="flex justify-between text-[10px] text-steel-400 font-semibold mb-1">
          <span>ARTÍCULO</span><span>CANT</span>
        </div>
        {lineas.length === 0 ? (
          <p className="text-steel-400 py-1">Sin artículos</p>
        ) : lineas.map((l, idx) => (
          <div key={`${l.clave}-${idx}`} className="flex justify-between text-steel-700 leading-5">
            <span className="truncate max-w-[160px]">{l.clave}</span>
            <span>{l.cantidad}</span>
          </div>
        ))}
      </div>
      {/* QR */}
      {qrUrl && (
        <div className="px-4 py-3 text-center">
          <p className="text-[10px] text-steel-500 mb-1.5">Escanea para confirmar recepción</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrUrl} alt="QR" className="w-24 h-24 mx-auto" />
        </div>
      )}
    </div>
  );
}
