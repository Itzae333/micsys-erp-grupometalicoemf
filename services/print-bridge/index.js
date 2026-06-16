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
      || /\.vercel\.app$/.test(origin);
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

/** Buffer de texto con salto de línea */
function ln(str) {
  return Buffer.from(norm(str) + '\n', 'latin1');
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

/** Línea de separación */
function sep(char = '-') {
  return Buffer.from(char.repeat(config.columns) + '\n', 'latin1');
}

function buildEscPosBuffer(ticket) {
  const parts = [];
  const push = (...bufs) => bufs.forEach((b) => parts.push(b));

  // ── Inicializar ────────────────────────────────────────
  push(CMD.INIT);

  // ── Comprobante de abono a cuenta ──────────────────────
  if (ticket.tipo === 'abono_cuenta') {
    push(CMD.ALIGN_CENTER, CMD.BOLD_ON, CMD.DOUBLE_HEIGHT);
    push(ln(ticket.ubicacion?.razon_social ?? ticket.empresa?.nombre ?? 'EMPRESA'));
    push(CMD.NORMAL, CMD.BOLD_OFF);
    if (ticket.ubicacion?.nombre) push(center(ticket.ubicacion.nombre));
    if (ticket.ubicacion?.rfc) {
      push(center('RFC: ' + ticket.ubicacion.rfc + (ticket.ubicacion.telefono ? '  Tel: ' + ticket.ubicacion.telefono : '')));
    } else if (ticket.ubicacion?.telefono) {
      push(center('Tel: ' + ticket.ubicacion.telefono));
    }
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
      push(row('  Nota #' + norm(n.folio), '$' + Number(n.monto_pagado).toFixed(2)));
      push(ln('  Estatus: ' + estado));
    }
    push(sep('='));
    push(CMD.BOLD_ON);
    push(row('TOTAL ABONADO', '$' + Number(ticket.total_aplicado ?? 0).toFixed(2)));
    const saldoRest = Number(ticket.saldo_restante ?? 0);
    if (saldoRest > 0) {
      push(row('SALDO PENDIENTE', '$' + saldoRest.toFixed(2)));
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

    push(CMD.ALIGN_CENTER, CMD.BOLD_ON, CMD.DOUBLE_HEIGHT);
    push(ln(ticket.ubicacion?.razon_social ?? ticket.empresa?.nombre ?? 'EMPRESA'));
    push(CMD.NORMAL, CMD.BOLD_OFF);
    if (ticket.ubicacion?.nombre) push(center(ticket.ubicacion.nombre));
    push(CMD.ALIGN_LEFT, sep('='));
    push(CMD.BOLD_ON, center('CORTE DE CAJA'), CMD.BOLD_OFF);

    const rangoLabel = ticket.desde === ticket.hasta
      ? norm(ticket.desde ?? '')
      : norm((ticket.desde ?? '') + ' al ' + (ticket.hasta ?? ''));
    push(center(rangoLabel));
    push(sep('='));

    // Por método de pago
    push(CMD.BOLD_ON, ln('POR METODO DE PAGO:'), CMD.BOLD_OFF);
    let totalGeneral = 0;
    for (const m of METODOS) {
      const res = ticket.por_metodo?.[m] ?? { count: 0, total: 0 };
      const label = (METODO_LABELS[m] ?? m) + ' (' + res.count + ')';
      push(row('  ' + label, '$' + Number(res.total).toFixed(2)));
      totalGeneral += Number(res.total);
    }
    push(sep('-'));
    push(CMD.BOLD_ON, CMD.DOUBLE_HEIGHT);
    push(row('TOTAL COBRADO', '$' + totalGeneral.toFixed(2)));
    push(CMD.NORMAL, CMD.BOLD_OFF, sep('='));

    // Por estatus
    push(CMD.BOLD_ON, ln('POR ESTATUS:'), CMD.BOLD_OFF);
    for (const [est, res] of Object.entries(ticket.por_estatus ?? {})) {
      push(row('  ' + norm(est) + ' (' + res.count + ')', '$' + Number(res.total).toFixed(2)));
    }
    push(sep('-'));

    // Detalle de notas
    push(CMD.BOLD_ON, ln('DETALLE:'), CMD.BOLD_OFF);
    for (const n of (ticket.notas ?? [])) {
      const hora = n.created_at ? new Date(n.created_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : '';
      const folioStr = '#' + String(n.folio).padStart(4, '0') + ' ' + hora;
      push(row('  ' + folioStr, '$' + Number(n.total).toFixed(2)));
      push(ln('  ' + norm(n.cliente?.nombre ?? 'MOSTRADOR')));
      for (const p of (n.pagos ?? [])) {
        push(ln('    ' + norm(METODO_LABELS[p.metodo] ?? p.metodo) + ': $' + Number(p.monto).toFixed(2)));
      }
    }
    push(sep('='));
    push(CMD.ALIGN_CENTER, ln('Generado: ' + new Date().toLocaleString('es-MX')));
    push(CMD.ALIGN_LEFT);
    push(CMD.FEED(config.cutFeedLines ?? 5));
    push(CMD.CUT(0));
    return Buffer.concat(parts);
  }

  // ── Nombre empresa / sucursal ──────────────────────────
  push(CMD.ALIGN_CENTER, CMD.BOLD_ON, CMD.DOUBLE_HEIGHT);
  push(ln(ticket.ubicacion?.razon_social ?? ticket.empresa?.nombre ?? 'EMPRESA'));
  push(CMD.NORMAL, CMD.BOLD_OFF);
  if (ticket.ubicacion?.nombre) push(center(ticket.ubicacion.nombre));

  // Datos fiscales debajo del nombre
  if (ticket.ubicacion?.rfc) {
    const rfcLine = 'RFC: ' + ticket.ubicacion.rfc +
      (ticket.ubicacion.telefono ? '  Tel: ' + ticket.ubicacion.telefono : '');
    push(center(rfcLine));
  } else if (ticket.ubicacion?.telefono) {
    push(center('Tel: ' + ticket.ubicacion.telefono));
  }
  if (ticket.ubicacion?.direccion) push(center(ticket.ubicacion.direccion));

  push(CMD.ALIGN_LEFT, sep());

  // ── Folio y fecha ──────────────────────────────────────
  push(row('Nota #' + ticket.nota.folio, ticket.nota.fecha));
  if (ticket.nota.cliente) push(ln('Cliente: ' + ticket.nota.cliente));
  push(sep());

  // ── Productos ──────────────────────────────────────────
  for (const linea of (ticket.lineas ?? [])) {
    const nombre = linea.descripcion || linea.clave;
    push(CMD.BOLD_ON, ln(nombre), CMD.BOLD_OFF);
    const qtyPrecio = '  ' + linea.cantidad + ' x $' + Number(linea.precio).toFixed(2);
    push(row(qtyPrecio, '$' + Number(linea.subtotal).toFixed(2)));
  }

  push(sep('='));

  // ── Total ──────────────────────────────────────────────
  push(CMD.BOLD_ON, CMD.DOUBLE_HEIGHT);
  push(row('TOTAL', '$' + Number(ticket.totales?.total ?? 0).toFixed(2)));
  push(CMD.NORMAL, CMD.BOLD_OFF, sep());

  // ── Forma de pago ──────────────────────────────────────
  if (ticket.tipo_cierre === 'CREDITO') {
    // Mostrar lo que se abonó en esta operación
    const pagosAbono = (ticket.pagos ?? []).filter((p) => Number(p.monto) > 0);
    if (pagosAbono.length > 0) {
      push(ln('ABONO:'));
      for (const pago of pagosAbono) {
        push(row('  ' + norm(pago.metodo), '$' + Number(pago.monto).toFixed(2)));
      }
      push(sep('-'));
    }
    const saldoRestante = Number(ticket.saldo_restante ?? 0);
    if (saldoRestante > 0) {
      push(CMD.BOLD_ON);
      push(row('SALDO PENDIENTE', '$' + saldoRestante.toFixed(2)));
      push(CMD.BOLD_OFF);
      push(center('ESTATUS: CREDITO'));
    } else {
      push(CMD.BOLD_ON);
      push(center('*** PAGADA ***'));
      push(CMD.BOLD_OFF);
    }
  } else if (ticket.tipo_cierre === 'PENDIENTE') {
    push(row('PENDIENTE DE COBRO', '$' + Number(ticket.totales?.total ?? 0).toFixed(2)));
  } else {
    for (const pago of (ticket.pagos ?? [])) {
      if (Number(pago.monto) > 0) {
        push(row(norm(pago.metodo), '$' + Number(pago.monto).toFixed(2)));
      }
    }
    if (Number(ticket.cambio) > 0) {
      push(row('CAMBIO', '$' + Number(ticket.cambio).toFixed(2)));
    }
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
      err
        ? reject(new Error(`No se pudo escribir en ${portPath}: ${err.message}`))
        : resolve();
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
      ], { timeout: 12000, stdio: 'pipe' });

      resolve();
    } catch (err) {
      const stderr = err.stderr ? err.stderr.toString().trim() : err.message;
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
