/**
 * GrupoMetalicoEMF — Print Bridge v2.0.0
 * Servicio local Windows que recibe payloads JSON del navegador
 * y los imprime en ticketera térmica ESC/POS via USB/Red.
 *
 * Escucha en http://localhost:7788
 * Solo acepta conexiones de localhost.
 *
 * Transportes disponibles:
 *   "network"      → TCP directo a IP:puerto (impresoras de red / USB compartido)
 *   "windows-port" → escritura cruda a COM3, LPT1, USB001, etc.
 */

const express      = require('express');
const cors         = require('cors');
const net          = require('net');
const fs           = require('fs');
const path         = require('path');
const os           = require('os');
const { execFileSync } = require('child_process');

const app    = express();
const PORT   = 7788;
const IS_PKG = typeof process.pkg !== 'undefined';

// ── Rutas de archivos externos (soporta modo pkg y modo normal) ────────────
// En pkg: process.execPath = C:\...\PrintBridge.exe, __dirname = snapshot virtual
// En node: __dirname = directorio real del script

const EXEC_DIR = IS_PKG ? path.dirname(process.execPath) : __dirname;

// send-raw.ps1: si está junto al exe lo usamos directamente,
// si no (ej. primera ejecución sin instalar) lo extraemos del snapshot a temp.
let SEND_RAW_PATH = path.join(EXEC_DIR, 'send-raw.ps1');
if (IS_PKG && !fs.existsSync(SEND_RAW_PATH)) {
  SEND_RAW_PATH = path.join(os.tmpdir(), 'print-bridge-send-raw.ps1');
  if (!fs.existsSync(SEND_RAW_PATH)) {
    fs.writeFileSync(SEND_RAW_PATH, fs.readFileSync(path.join(__dirname, 'send-raw.ps1')));
  }
}

// ── Cargar configuración ───────────────────────────────────
const CONFIG_PATH = path.join(EXEC_DIR, 'printer.config.json');

let config = {
  transport:    'network',
  network:      { ip: '192.168.1.100', port: 9100 },
  windowsPort:  'COM3',
  columns:      48,         // 80 mm estándar = 48 chars a densidad normal
  cutFeedLines: 5,
};

if (fs.existsSync(CONFIG_PATH)) {
  try {
    const loaded = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    config = { ...config, ...loaded };
    config.network = { ...config.network, ...(loaded.network ?? {}) };
    console.log('[print-bridge] Config cargada:', CONFIG_PATH);
  } catch (e) {
    console.warn('[print-bridge] printer.config.json inválido, usando defaults:', e.message);
  }
} else {
  console.warn('[print-bridge] printer.config.json no encontrado — usando defaults.');
  console.warn('[print-bridge] Crea printer.config.json para configurar tu impresora.');
}

// ── Middleware ─────────────────────────────────────────────
app.use(cors({
  origin: (origin, cb) => {
    // Permite: sin origin (curl/Postman), localhost cualquier puerto, y Vercel
    if (!origin) return cb(null, true);
    const allowed = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
      || /\.vercel\.app$/.test(origin)
      || /\.cloudclusters\.net$/.test(origin);
    cb(null, allowed);
  },
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
}));
app.use(express.json({ limit: '100kb' }));

// ── GET /ping ──────────────────────────────────────────────
app.get('/ping', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'GrupoMetalicoEMF Print Bridge',
    version: '2.0.0',
    transport: config.transport,
    columns: config.columns,
  });
});

// ── POST /print ────────────────────────────────────────────
app.post('/print', async (req, res) => {
  const ticket = req.body;
  if (!ticket || !ticket.tipo) {
    return res.status(400).json({ error: 'Payload inválido. Se requiere campo "tipo".' });
  }
  const copias = Math.max(1, Math.min(5, Number(ticket.copias) || 1));
  try {
    const buffer = buildEscPosBuffer(ticket);
    const printBuffer = copias === 1 ? buffer : Buffer.concat(Array.from({ length: copias }, () => buffer));
    await sendToPrinter(printBuffer);
    console.log(`[print-bridge] OK tipo=${ticket.tipo} folio=${ticket.nota?.folio} bytes=${buffer.length} copias=${copias}`);
    res.json({ ok: true, bytes: buffer.length, copias });
  } catch (err) {
    console.error('[print-bridge] Error al imprimir:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════
// ESC/POS Builder — 80 mm
// ══════════════════════════════════════════════════════════

// Bytes de control
const ESC = 0x1B;
const GS  = 0x1D;

const CMD = {
  INIT:          Buffer.from([ESC, 0x40]),
  ALIGN_LEFT:    Buffer.from([ESC, 0x61, 0x00]),
  ALIGN_CENTER:  Buffer.from([ESC, 0x61, 0x01]),
  BOLD_ON:       Buffer.from([ESC, 0x45, 0x01]),
  BOLD_OFF:      Buffer.from([ESC, 0x45, 0x00]),
  NORMAL:        Buffer.from([ESC, 0x21, 0x00]),   // tamaño normal
  DOUBLE_HEIGHT: Buffer.from([ESC, 0x21, 0x10]),   // doble alto
  FEED:   (n)  => Buffer.from([ESC, 0x64, n & 0xFF]),
  // Corte parcial con avance previo:  GS V 66 n
  CUT:    (n)  => Buffer.from([GS, 0x56, 0x42, n & 0xFF]),
};

/** Quita tildes y caracteres fuera de ASCII para compatibilidad CP437/CP850 */
function norm(str) {
  if (str == null) return '';
  return String(str)
    .replace(/·/g, '-')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\x00-\x7E]/g, '?');
}

/** Buffer de texto con salto de línea; `w` opcional trunca el ancho */
function ln(str, w) {
  const s = norm(str);
  return Buffer.from((w ? s.substring(0, w) : s) + '\n', 'latin1');
}

/** Línea con texto izquierda y texto derecha, relleno de espacios entre ambos */
function row(left, right) {
  const w = config.columns;
  const r = norm(right);
  const l = norm(left).substring(0, w - r.length - 1);
  const pad = ' '.repeat(Math.max(1, w - l.length - r.length));
  return Buffer.from(l + pad + r + '\n', 'latin1');
}

/** Texto centrado en el ancho del ticket */
function center(str) {
  const w = config.columns;
  const s = norm(str).substring(0, w);
  const spaces = Math.floor((w - s.length) / 2);
  return Buffer.from(' '.repeat(spaces) + s + '\n', 'latin1');
}

/** Centra texto largo en varias líneas (wrap por palabra) en vez de truncarlo */
function wrapCenter(str) {
  const w = config.columns;
  const words = norm(str).split(' ').filter(Boolean);
  const lines = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? current + ' ' + word : word;
    if (candidate.length > w) {
      if (current) lines.push(current);
      current = word.length > w ? word.substring(0, w) : word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return Buffer.concat(lines.map((line) => center(line)));
}

/**
 * Envuelve texto largo en varias líneas por palabra, sin agregar padding.
 * Úsalo cuando el hardware ya está en ALIGN_CENTER (ESC a 1): agregar
 * padding manual encima haría que la impresora centre el bloque
 * "espacios + texto" y el texto visible termine corrido a la derecha.
 */
function wrapPlain(str) {
  const w = config.columns;
  const words = norm(str).split(' ').filter(Boolean);
  const lines = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? current + ' ' + word : word;
    if (candidate.length > w) {
      if (current) lines.push(current);
      current = word.length > w ? word.substring(0, w) : word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return Buffer.concat(lines.map((line) => ln(line)));
}

/** Línea de separación */
function sep(char = '-') {
  return Buffer.from(char.repeat(config.columns) + '\n', 'latin1');
}

/** Formatea número con comas de miles: 1,234,567.89 (soporta hasta billones) */
function formatMoney(n) {
  const fixed = Number(n ?? 0).toFixed(2);
  const [int, dec] = fixed.split('.');
  return int.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + dec;
}

/** Formatea fecha sin depender de locale ICU (compatible con pkg) */
function fmtDate(d) {
  const dt = new Date(d);
  const dd = String(dt.getDate()).padStart(2, '0');
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const yyyy = dt.getFullYear();
  return dd + '/' + mm + '/' + yyyy;
}
function fmtTime(d) {
  const dt = new Date(d);
  const hh = String(dt.getHours()).padStart(2, '0');
  const min = String(dt.getMinutes()).padStart(2, '0');
  return hh + ':' + min;
}
function fmtDateTime(d) { return fmtDate(d) + ' ' + fmtTime(d); }

/** Igual que row() pero con puntos como relleno */
function dotRow(left, right) {
  const w = config.columns;
  const r = norm(right);
  const l = norm(left);
  const fill = Math.max(2, w - l.length - r.length);
  return Buffer.from(l.substring(0, w - r.length - 2) + '.'.repeat(fill) + r + '\n', 'latin1');
}

/**
 * Imprime el header de empresa/ubicación.
 * Si el ticket trae logo_escpos_b64, inserta el bitmap ESC/POS.
 * Si no, imprime el nombre de empresa en texto bold grande.
 */
function pushHeader(ticket, push) {
  push(CMD.ALIGN_CENTER);
  const mainName = ticket.ubicacion?.nombre ?? ticket.empresa?.nombre ?? 'EMPRESA';
  if (ticket.logo_escpos_b64) {
    try {
      push(Buffer.from(ticket.logo_escpos_b64, 'base64'));
      push(CMD.FEED(1));
    } catch {
      push(CMD.BOLD_ON, CMD.DOUBLE_HEIGHT);
      push(ln(mainName));
      push(CMD.NORMAL, CMD.BOLD_OFF);
    }
  } else {
    push(CMD.BOLD_ON, CMD.DOUBLE_HEIGHT);
    push(ln(mainName));
    push(CMD.NORMAL, CMD.BOLD_OFF);
  }
  // ALIGN_CENTER de hardware ya está activo (arriba): se usa ln() plano,
  // no center()/wrapCenter(), para no centrar dos veces (ver wrapPlain).
  if (ticket.ubicacion?.razon_social) {
    push(ln(ticket.ubicacion.razon_social, config.columns));
  }
  // Datos fiscales — se imprimen en la cabecera de todos los tipos de ticket
  if (ticket.ubicacion?.rfc) {
    push(ln('RFC: ' + ticket.ubicacion.rfc +
      (ticket.ubicacion.telefono ? '  Tel: ' + ticket.ubicacion.telefono : ''), config.columns));
  } else if (ticket.ubicacion?.telefono) {
    push(ln('Tel: ' + ticket.ubicacion.telefono, config.columns));
  }
  if (ticket.ubicacion?.regimen_fiscal) {
    push(ln('Régimen Fiscal: ' + ticket.ubicacion.regimen_fiscal, config.columns));
  }
  if (ticket.ubicacion?.direccion) push(wrapPlain(ticket.ubicacion.direccion));
}

/**
 * Imprime un QR code usando el comando GS ( k (función PDF417/QR2).
 * Soportado en impresoras Epson TM y compatibles.
 */
function pushQr(text, push) {
  const data = Buffer.from(text, 'utf8');
  const pL = (data.length + 3) & 0xFF;
  const pH = ((data.length + 3) >> 8) & 0xFF;
  // Seleccionar modelo 2
  push(Buffer.from([0x1D, 0x28, 0x6B, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00]));
  // Tamaño de módulo (3 = mediano)
  push(Buffer.from([0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x43, 0x04]));
  // Nivel de corrección L
  push(Buffer.from([0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x45, 0x30]));
  // Almacenar datos
  push(Buffer.from([0x1D, 0x28, 0x6B, pL, pH, 0x31, 0x50, 0x30]));
  push(data);
  // Imprimir
  push(Buffer.from([0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x51, 0x30]));
}

function buildEscPosBuffer(ticket) {
  const parts = [];
  const push = (...bufs) => bufs.forEach((b) => parts.push(b));

  // ── Inicializar ────────────────────────────────────────
  push(CMD.INIT);

  // ── Remisión de almacén ────────────────────────────────
  if (ticket.tipo === 'remision') {
    pushHeader(ticket, push);
    push(CMD.BOLD_ON, ln('REMISION DE ALMACEN'), CMD.BOLD_OFF);
    push(CMD.BOLD_ON, ln(ticket.folio ?? ''), CMD.BOLD_OFF);
    push(CMD.ALIGN_LEFT, sep('='));
    push(ln('ORIGEN:  ' + norm(ticket.origen?.empresa ?? '')));
    push(ln('         ' + norm(ticket.origen?.ubicacion ?? '')));
    push(ln('DESTINO: ' + norm(ticket.destino?.empresa ?? '')));
    push(ln('         ' + norm(ticket.destino?.ubicacion ?? '')));
    push(row('Fecha', norm(ticket.fecha ?? '')));
    push(sep('-'));

    const colNombre = config.columns - 7;
    push(ln(('ARTICULO').padEnd(colNombre) + ' CANT'.padStart(6)));
    push(sep('-'));
    for (const linea of (ticket.lineas ?? [])) {
      const desc = norm(linea.clave + (linea.descripcion ? ' ' + linea.descripcion : ''));
      const cant = String(linea.cantidad).padStart(6);
      push(ln(desc.slice(0, colNombre).padEnd(colNombre) + cant));
    }
    push(sep('-'));
    push(ln('Total: ' + (ticket.lineas ?? []).length + ' articulos'));

    if (ticket.concepto) push(ln('Concepto: ' + norm(ticket.concepto)));

    if (ticket.qr_url) {
      push(CMD.FEED(1), CMD.ALIGN_CENTER);
      push(CMD.BOLD_ON, ln('Escanea para confirmar recepcion:'), CMD.BOLD_OFF);
      pushQr(ticket.qr_url, push);
      push(CMD.FEED(1), CMD.ALIGN_LEFT);
    }

    push(CMD.FEED(config.cutFeedLines ?? 5));
    push(CMD.CUT(0));
    return Buffer.concat(parts);
  }

  // ── Comprobante de abono a cuenta ──────────────────────
  if (ticket.tipo === 'abono_cuenta') {
    pushHeader(ticket, push);
    push(CMD.ALIGN_LEFT, sep());
    push(CMD.BOLD_ON, center('COMPROBANTE DE ABONO'), CMD.BOLD_OFF);
    push(row('Fecha', norm(ticket.fecha ?? '')));
    push(sep());
    push(ln('Cliente: ' + norm(ticket.cliente?.nombre ?? 'N/A')));
    if (ticket.cliente?.telefono) push(ln('Tel: ' + norm(ticket.cliente.telefono)));
    push(sep());
    push(ln('DESGLOSE:'));
    for (const n of (ticket.notas_pagadas ?? [])) {
      const estado = n.nuevo_estatus === 'PAGADA' ? 'PAGADA' : 'CREDITO';
      push(row('  Nota #' + norm(n.folio), '$' + formatMoney(Number(n.monto_pagado))));
      push(ln('  Estatus: ' + estado));
    }
    push(sep('='));
    push(CMD.BOLD_ON);
    push(row('TOTAL ABONADO', '$' + formatMoney(Number(ticket.total_aplicado ?? 0))));
    const saldoRest = Number(ticket.saldo_restante ?? 0);
    if (saldoRest > 0) {
      push(row('SALDO PENDIENTE', '$' + formatMoney(saldoRest)));
    } else {
      push(center('*** CUENTA AL CORRIENTE ***'));
    }
    push(CMD.BOLD_OFF);
    push(sep(), CMD.ALIGN_CENTER);
    push(ln('Metodo: ' + norm(ticket.metodo ?? '')));
    push(ln('!Gracias por su pago!'));
    push(CMD.ALIGN_LEFT);
    push(CMD.FEED(config.cutFeedLines ?? 5));
    push(CMD.CUT(0));
    return Buffer.concat(parts);
  }

  // ── Corte de caja ──────────────────────────────────────
  if (ticket.tipo === 'corte_caja') {
    const METODO_LABELS = {
      EFECTIVO: 'Efectivo', TARJETA: 'Tarjeta',
      TRANSFERENCIA: 'Transferencia', DEPOSITO: 'Deposito',
    };
    const METODOS = ['EFECTIVO', 'TARJETA', 'TRANSFERENCIA', 'DEPOSITO'];

    pushHeader(ticket, push);
    push(CMD.ALIGN_LEFT, sep('='));
    push(CMD.BOLD_ON, center('CORTE DE CAJA'), CMD.BOLD_OFF);

    const rangoLabel = ticket.desde === ticket.hasta
      ? norm(ticket.desde ?? '')
      : norm((ticket.desde ?? '') + ' al ' + (ticket.hasta ?? ''));
    push(center(rangoLabel));
    push(sep('='));

    // ── Lista de ventas ─────────────────────────────────
    push(CMD.BOLD_ON, ln('VENTAS'), CMD.BOLD_OFF);
    push(sep('-'));
    for (const n of (ticket.notas ?? [])) {
      const folioStr = 'N' + String(n.folio).padStart(5, '0');
      let mLabel;
      if (n.estatus === 'CREDITO') {
        mLabel = 'CREDITO';
      } else if (!n.pagos || n.pagos.length === 0) {
        mLabel = '';
      } else if (n.pagos.length > 1) {
        mLabel = 'MULTI_PAGO';
      } else {
        mLabel = norm(n.pagos[0].metodo ?? '');
      }
      push(dotRow(folioStr, '$' + formatMoney(Number(n.total)) + (mLabel ? '  ' + mLabel : '')));
    }
    push(sep('-'));

    // ── Anticipos de pedidos ────────────────────────────
    if (ticket.anticipos_pedido && ticket.anticipos_pedido.count > 0) {
      push(sep('='));
      push(CMD.BOLD_ON, ln('ANTICIPOS DE PEDIDOS:'), CMD.BOLD_OFF);
      push(sep('-'));
      for (const m of METODOS) {
        const res = ticket.anticipos_pedido.por_metodo?.[m] ?? { count: 0, total: 0 };
        if (res.count === 0) continue;
        push(dotRow('  ' + norm(METODO_LABELS[m] ?? m) + ' (' + res.count + ')', '$' + formatMoney(Number(res.total))));
      }
      push(sep('-'));
      push(CMD.BOLD_ON, dotRow('TOTAL ANTICIPOS', '$' + formatMoney(Number(ticket.anticipos_pedido.total ?? 0))), CMD.BOLD_OFF);
    }

    // ── Pagos de crédito (abonos cobrados hoy de notas de días anteriores) ──
    if (ticket.pagos_credito && ticket.pagos_credito.count > 0) {
      push(sep('='));
      push(CMD.BOLD_ON, ln('PAGOS DE CREDITO'), CMD.BOLD_OFF);
      push(sep('-'));
      for (const p of ticket.pagos_credito.detalle) {
        const folioStr = 'N' + String(p.folio).padStart(5, '0');
        push(dotRow(folioStr, '$' + formatMoney(Number(p.monto)) + '  ' + norm(p.metodo ?? '')));
      }
      push(sep('-'));
      push(CMD.BOLD_ON, dotRow('TOTAL PAGOS DE CREDITO', '$' + formatMoney(Number(ticket.pagos_credito.total ?? 0))), CMD.BOLD_OFF);
    }

    // ── Gastos del período ────────────────────────────────
    if (ticket.gastos && ticket.gastos.length > 0) {
      push(sep('='));
      push(CMD.BOLD_ON, ln('GASTOS'), CMD.BOLD_OFF);
      push(sep('-'));
      for (const g of ticket.gastos) {
        push(dotRow(norm(g.concepto ?? ''), '$' + formatMoney(Number(g.monto))));
      }
      push(sep('-'));
      push(CMD.BOLD_ON, dotRow('TOTAL GASTOS', '$' + formatMoney(Number(ticket.total_gastos ?? 0))), CMD.BOLD_OFF);
    }

    // ── Totales ──────────────────────────────────────────
    push(sep('='));
    push(CMD.BOLD_ON, CMD.DOUBLE_HEIGHT);
    push(dotRow('TOTAL DE VENTAS', '$' + formatMoney(Number(ticket.total_ventas ?? 0))));
    push(CMD.NORMAL, CMD.BOLD_OFF);
    push(sep('-'));

    for (const m of METODOS) {
      const res = ticket.por_metodo?.[m] ?? { count: 0, total: 0 };
      push(dotRow('TOTAL EN ' + norm((METODO_LABELS[m] ?? m).toUpperCase()), '$' + formatMoney(Number(res.total))));
    }

    if (ticket.pagos_credito && Number(ticket.pagos_credito.total ?? 0) > 0) {
      push(sep('-'));
      push(dotRow('TOTAL PAGOS DE CREDITO', '$' + formatMoney(Number(ticket.pagos_credito.total))));
    }

    if (Number(ticket.total_gastos ?? 0) > 0) {
      push(sep('-'));
      push(dotRow('TOTAL GASTOS', '-$' + formatMoney(Number(ticket.total_gastos))));
    }

    push(sep('='));
    push(CMD.BOLD_ON, CMD.DOUBLE_HEIGHT);
    push(dotRow('A ENTREGAR (EFECTIVO)', '$' + formatMoney(Number(ticket.total_entregar_efectivo ?? 0))));
    push(CMD.NORMAL, CMD.BOLD_OFF);

    push(sep('='));
    push(CMD.ALIGN_CENTER, ln('Generado: ' + fmtDateTime(new Date())));
    push(CMD.ALIGN_LEFT);
    push(CMD.FEED(config.cutFeedLines ?? 5));
    push(CMD.CUT(0));
    return Buffer.concat(parts);
  }

  // ── Anticipo de pedido ─────────────────────────────────
  if (ticket.tipo === 'anticipo_pedido') {
    pushHeader(ticket, push);

    push(CMD.ALIGN_LEFT, sep('='));
    push(CMD.BOLD_ON, center('ANTICIPO DE PEDIDO'), CMD.BOLD_OFF);
    push(sep('='));

    const folioStr = '#' + String(ticket.pedido?.folio ?? '').padStart(4, '0');
    const fecha = ticket.pedido?.fecha ? fmtDate(ticket.pedido.fecha) : '';
    push(row('Pedido ' + folioStr, fecha));
    push(ln('Cliente: ' + norm(ticket.pedido?.cliente_nombre ?? 'N/A')));
    push(sep('-'));

    // Líneas del pedido
    for (const linea of (ticket.lineas ?? [])) {
      const nombre = linea.descripcion || linea.clave;
      push(CMD.BOLD_ON, ln(norm(String(linea.cantidad)) + '  ' + nombre), CMD.BOLD_OFF);
      push(row('  P.U $' + formatMoney(Number(linea.precio)), 'Imp $' + formatMoney(Number(linea.subtotal))));
    }
    push(sep('='));

    const tot = ticket.totales ?? {};
    push(row('TOTAL DEL PEDIDO', '$' + formatMoney(Number(tot.total_pedido ?? 0))));
    if (Number(tot.anticipos_anteriores ?? 0) > 0) {
      push(row('ANTICIPOS ANTERIORES', '$' + formatMoney(Number(tot.anticipos_anteriores))));
    }
    push(sep('-'));
    push(CMD.BOLD_ON);
    push(row('ESTE ANTICIPO', '$' + formatMoney(Number(tot.este_anticipo ?? 0))));
    push(row('TOTAL PAGADO', '$' + formatMoney(Number(tot.total_pagado ?? 0))));
    push(CMD.BOLD_OFF);
    push(sep('-'));
    const saldo = Number(tot.saldo_pendiente ?? 0);
    if (saldo > 0.01) {
      push(CMD.BOLD_ON, row('SALDO PENDIENTE', '$' + formatMoney(saldo)), CMD.BOLD_OFF);
    } else {
      push(CMD.BOLD_ON, center('*** PEDIDO SALDADO ***'), CMD.BOLD_OFF);
    }
    push(sep('='), CMD.ALIGN_CENTER);

    // Métodos de pago
    for (const mp of (ticket.metodos_pago ?? [])) {
      push(ln('Pago: ' + norm(mp.metodo) + '  $' + formatMoney(Number(mp.monto))));
    }
    push(ln('!Gracias por su anticipo!'));
    push(CMD.ALIGN_LEFT);
    push(CMD.FEED(config.cutFeedLines ?? 5));
    push(CMD.CUT(0));
    return Buffer.concat(parts);
  }

  // ── Carga / entrega de mercancía ────────────────────────
  if (ticket.tipo === 'carga') {
    pushHeader(ticket, push);
    push(CMD.ALIGN_LEFT, sep('='));
    push(CMD.BOLD_ON, center('CARGA / ENTREGA'), CMD.BOLD_OFF);
    push(row('Nota #' + norm(ticket.folio ?? ''), fmtDateTime(new Date())));
    push(sep('='));

    const lineas = ticket.lineas ?? [];
    const cargadas = lineas.filter((l) => Number(l.cargado_ahora) > 0);
    const pendientes = lineas.filter((l) => Number(l.pendiente) > 0);

    push(CMD.BOLD_ON, ln('ENTREGADO AHORA:'), CMD.BOLD_OFF);
    push(sep('-'));
    if (cargadas.length === 0) {
      push(ln('(sin articulos en este evento)'));
    } else {
      for (const l of cargadas) {
        const nombre = l.descripcion || l.clave;
        push(ln(norm(String(l.cargado_ahora)) + '  ' + nombre));
      }
    }

    if (pendientes.length > 0) {
      push(sep('='));
      push(CMD.BOLD_ON, ln('PENDIENTE POR ENTREGAR:'), CMD.BOLD_OFF);
      push(sep('-'));
      for (const l of pendientes) {
        const nombre = l.descripcion || l.clave;
        push(ln(norm(String(l.pendiente)) + '  ' + nombre));
      }
    }

    push(sep('='), CMD.ALIGN_CENTER);
    push(ln('Conserve este comprobante'));
    push(CMD.ALIGN_LEFT);
    push(CMD.FEED(config.cutFeedLines ?? 5));
    push(CMD.CUT(0));
    return Buffer.concat(parts);
  }

  // ── Nombre empresa / sucursal / datos fiscales ──────────
  pushHeader(ticket, push);

  push(CMD.ALIGN_LEFT, sep());

  // ── Folio y fecha ──────────────────────────────────────
  push(row('Nota #' + ticket.nota.folio, ticket.nota.fecha));
  if (ticket.nota.cliente) push(ln('Cliente: ' + ticket.nota.cliente));
  push(sep());

  // ── Productos ──────────────────────────────────────────
  for (const linea of (ticket.lineas ?? [])) {
    const nombre = linea.descripcion || linea.clave;
    // Cantidad ANTES de la descripción; la impresora hace wrap automático
    push(CMD.BOLD_ON, ln(norm(String(linea.cantidad)) + '  ' + nombre), CMD.BOLD_OFF);
    // Precio unitario y subtotal en su propia línea alineada
    push(row('  P.U $' + formatMoney(Number(linea.precio)), 'Imp $' + formatMoney(Number(linea.subtotal))));
  }

  push(sep('='));

  // ── Total ──────────────────────────────────────────────
  push(CMD.BOLD_ON, CMD.DOUBLE_HEIGHT);
  push(row('TOTAL', '$' + formatMoney(Number(ticket.totales?.total ?? 0))));
  push(CMD.NORMAL, CMD.BOLD_OFF, sep());

  // ── Forma de pago ──────────────────────────────────────
  if (ticket.tipo_cierre === 'CREDITO') {
    if (ticket.saldo_anterior != null) {
      push(row('SALDO ANTERIOR', '$' + formatMoney(Number(ticket.saldo_anterior))));
    }
    const pagosAbono = (ticket.pagos ?? []).filter((p) => Number(p.monto) > 0);
    if (pagosAbono.length > 0) {
      push(ln('ABONO:'));
      for (const pago of pagosAbono) {
        push(row('  ' + norm(pago.metodo), '$' + formatMoney(Number(pago.monto))));
      }
      push(sep('-'));
    }
    const saldoRestante = Number(ticket.saldo_restante ?? 0);
    if (saldoRestante > 0) {
      push(CMD.BOLD_ON);
      push(row('SALDO PENDIENTE', '$' + formatMoney(saldoRestante)));
      push(CMD.BOLD_OFF);
      push(center('ESTATUS: CREDITO'));
    } else {
      push(CMD.BOLD_ON);
      push(center('*** PAGADA ***'));
      push(CMD.BOLD_OFF);
    }
  } else if (ticket.tipo_cierre === 'PENDIENTE') {
    push(row('PENDIENTE DE COBRO', '$' + formatMoney(Number(ticket.totales?.total ?? 0))));
  } else {
    for (const pago of (ticket.pagos ?? [])) {
      if (Number(pago.monto) > 0) {
        push(row(norm(pago.metodo), '$' + formatMoney(Number(pago.monto))));
      }
    }
    if (Number(ticket.cambio) > 0) {
      push(row('CAMBIO', '$' + formatMoney(Number(ticket.cambio))));
    }
  }

  // ── Historial de anticipos (pedidos liquidados) ────────
  if (ticket.historial_anticipos && ticket.historial_anticipos.length > 0) {
    push(sep());
    push(CMD.BOLD_ON, ln('HISTORIAL DE ANTICIPOS:'), CMD.BOLD_OFF);
    let totalAnticipado = 0;
    for (const a of ticket.historial_anticipos) {
      const fechaA = a.fecha ? fmtDate(a.fecha) : '';
      push(row('  ' + fechaA + ' ' + norm(a.metodo), '$' + formatMoney(Number(a.monto))));
      totalAnticipado += Number(a.monto);
    }
    push(sep('-'));
    push(row('  TOTAL ANTICIPADO', '$' + formatMoney(totalAnticipado)));
  }

  // ── Pie ────────────────────────────────────────────────
  push(sep(), CMD.ALIGN_CENTER);
  push(ln('!Gracias por su compra!'));
  push(CMD.ALIGN_LEFT);

  // ── Avance de papel y corte ────────────────────────────
  push(CMD.FEED(config.cutFeedLines ?? 5));
  push(CMD.CUT(0));

  return Buffer.concat(parts);
}

// ══════════════════════════════════════════════════════════
// Transportes
// ══════════════════════════════════════════════════════════

function sendToPrinter(buffer) {
  if (config.transport === 'network')         return sendViaNetwork(buffer);
  if (config.transport === 'windows-port')    return sendViaWindowsPort(buffer);
  if (config.transport === 'windows-printer') return sendViaWindowsPrinter(buffer);
  return Promise.reject(new Error(
    `Transporte desconocido: "${config.transport}". Usa "network", "windows-port" o "windows-printer".`,
  ));
}

/** Imprime vía TCP (impresoras de red, compartidas como raw socket en puerto 9100) */
function sendViaNetwork(buffer) {
  const { ip, port } = config.network;
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let settled = false;

    const done = (err) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      err ? reject(err) : resolve();
    };

    socket.setTimeout(8000, () => done(new Error(`Timeout conectando a ${ip}:${port}`)));
    socket.on('error', done);
    socket.connect(port, ip, () => {
      socket.write(buffer, (err) => {
        // Pequeña espera antes de cerrar para que la impresora consuma el buffer
        setTimeout(() => done(err ?? null), 400);
      });
    });
  });
}

/** Imprime escribiendo bytes crudos en puerto Windows (COM3, LPT1, USB001…) */
function sendViaWindowsPort(buffer) {
  const portPath = /^\\\\/.test(config.windowsPort)
    ? config.windowsPort
    : `\\\\.\\${config.windowsPort}`;

  return new Promise((resolve, reject) => {
    fs.writeFile(portPath, buffer, (err) => {
      if (!err) return resolve();
      if (err.code === 'ENOENT') {
        reject(new Error(
          `Puerto "${config.windowsPort}" no encontrado. ` +
          `Verifica que la impresora esté conectada y actualiza "windowsPort" en printer.config.json ` +
          `(ej. "COM3", "LPT1", "USB001"). Archivo: ${CONFIG_PATH}`
        ));
      } else {
        reject(new Error(`No se pudo escribir en ${portPath}: ${err.message}`));
      }
    });
  });
}

/**
 * Imprime a una impresora Windows por nombre (ej. "Ticketera") usando el
 * Spooler API via PowerShell + send-raw.ps1. Sin dependencias nativas.
 */
function sendViaWindowsPrinter(buffer) {
  const printerName = config.printerName ?? 'Ticketera';
  const scriptPath  = SEND_RAW_PATH;
  const tmpFile     = path.join(os.tmpdir(), `escpos_${Date.now()}_${process.pid}.bin`);

  return new Promise((resolve, reject) => {
    try {
      fs.writeFileSync(tmpFile, buffer);

      execFileSync('powershell', [
        '-ExecutionPolicy', 'Bypass',
        '-NonInteractive',
        '-NoProfile',
        '-File', scriptPath,
        printerName,
        tmpFile,
      // 25s: Add-Type compila C# al vuelo la primera vez, y un antivirus
      // escaneando powershell.exe en tiempo real puede hacerlo bastante lento.
      ], { timeout: 25000, stdio: 'pipe' });

      resolve();
    } catch (err) {
      let stderr = err.stderr ? err.stderr.toString().trim() : '';
      if (!stderr) {
        stderr = err.killed
          ? `El proceso de PowerShell se mató por exceder el tiempo límite (${err.signal ?? 'timeout'}) — revisa si un antivirus está escaneando/ralentizando powershell.exe.`
          : (err.message || 'Sin detalle (stderr vacío).');
      }
      reject(new Error(`Error PowerShell al imprimir en "${printerName}": ${stderr}`));
    } finally {
      try { fs.unlinkSync(tmpFile); } catch {}
    }
  });
}

// ── Iniciar servidor ───────────────────────────────────────
const server = app.listen(PORT, '127.0.0.1', () => {
  console.log(`\n[print-bridge] ═══════════════════════════════════`);
  console.log(`[print-bridge]  GrupoMetalicoEMF Print Bridge v2.0`);
  console.log(`[print-bridge]  http://localhost:${PORT}`);
  console.log(`[print-bridge]  Transporte : ${config.transport}`);
  if (config.transport === 'network') {
    console.log(`[print-bridge]  Impresora  : ${config.network.ip}:${config.network.port}`);
  } else if (config.transport === 'windows-printer') {
    console.log(`[print-bridge]  Impresora  : "${config.printerName ?? 'Ticketera'}" (Windows Spooler)`);
  } else {
    console.log(`[print-bridge]  Puerto     : ${config.windowsPort}`);
  }
  console.log(`[print-bridge]  Columnas   : ${config.columns}`);
  console.log(`[print-bridge] ═══════════════════════════════════\n`);
});

process.on('SIGTERM', () => {
  server.close(() => { console.log('[print-bridge] Detenido'); process.exit(0); });
});

module.exports = { app };
