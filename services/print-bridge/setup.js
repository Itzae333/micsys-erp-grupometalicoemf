'use strict';
/**
 * GrupoMetalicoEMF — Print Bridge Setup v3.0
 *
 * Modos de ejecución:
 *   PrintBridge-Setup.exe              → instala el servicio de Windows
 *   PrintBridge-Setup.exe --service    → inicia el servidor HTTP (usado por el servicio NSSM)
 *   PrintBridge-Setup.exe --uninstall  → desinstala el servicio y borra archivos
 *   PrintBridge-Setup.exe --restart    → reinicia el servicio sin desinstalar
 *
 * Empaquetado con: npm run build:exe
 * Requiere ejecutar como Administrador para install/uninstall/restart.
 *
 * El servicio se registra con NSSM (Non-Sucking Service Manager, nssm.cc) en
 * vez de una Tarea Programada — evita el límite de 5 reintentos automáticos
 * de Task Scheduler y no depende de PowerShell para el registro, lo que lo
 * hace mucho más confiable entre distintas PCs/políticas de grupo.
 */

// SERVICE_NAME debe quedar declarado ANTES del dispatch de abajo — runInstall()
// et al. se ejecutan de inmediato y ya la necesitan.
const SERVICE_NAME = 'GrupoMetalicoEMF-PrintBridge';

const args = process.argv.slice(2);
const mode = args[0] ?? '';

if (mode === '--service') {
  require('./index');
} else if (mode === '--uninstall') {
  runUninstall();
} else if (mode === '--restart') {
  runRestart();
} else {
  runInstall();
}

// ══════════════════════════════════════════════════════════
// Helpers compartidos
// ══════════════════════════════════════════════════════════

function getInstallDir() {
  const path = require('path');
  return path.join(
    process.env.PROGRAMFILES ?? process.env['ProgramFiles'] ?? 'C:\\Program Files',
    'GrupoMetalicoEMF',
    'PrintBridge',
  );
}

/**
 * Ubica nssm.exe: si se distribuyó como archivo suelto junto al exe lo usa
 * directo, si no lo extrae del snapshot embebido de pkg a temp. Mismo
 * patrón que ya usa index.js para send-raw.ps1.
 */
function resolveNssmPath() {
  const path = require('path');
  const fs   = require('fs');
  const os   = require('os');
  const IS_PKG = typeof process.pkg !== 'undefined';
  const execDir = IS_PKG ? path.dirname(process.execPath) : __dirname;

  const candidatos = [
    path.join(execDir, 'vendor', 'nssm.exe'),
    path.join(execDir, 'nssm.exe'),
  ];
  for (const c of candidatos) {
    if (fs.existsSync(c)) return c;
  }

  const tmp = path.join(os.tmpdir(), 'printbridge-nssm.exe');
  if (!fs.existsSync(tmp)) {
    fs.writeFileSync(tmp, fs.readFileSync(path.join(__dirname, 'vendor', 'nssm.exe')));
  }
  return tmp;
}

/** Log persistente en INSTALL_DIR/install.log — si la carpeta no existe aún, solo va a consola. */
function makeLogger(installDir) {
  const fs   = require('fs');
  const path = require('path');
  return function log(line) {
    const msg = `[${new Date().toISOString()}] ${line}`;
    console.log(msg);
    try {
      fs.appendFileSync(path.join(installDir, 'install.log'), msg + '\n');
    } catch {
      // Carpeta de instalación todavía no existe (pasos muy tempranos) — no pasa nada.
    }
  };
}

/** Sondea localhost:7788/ping sin depender de PowerShell. */
function pingServicio(callback, attempts = 16, delayMs = 500) {
  const http = require('http');
  let tries = 0;

  const tryOnce = () => {
    tries++;
    const req = http.get({ host: '127.0.0.1', port: 7788, path: '/ping', timeout: 2000 }, (res) => {
      res.resume();
      callback(true);
    });
    req.on('error', next);
    req.on('timeout', () => { req.destroy(); next(); });
  };
  const next = () => {
    if (tries >= attempts) { callback(false); return; }
    setTimeout(tryOnce, delayMs);
  };
  tryOnce();
}

// ══════════════════════════════════════════════════════════
// Instalación
// ══════════════════════════════════════════════════════════

function runInstall() {
  const { execFileSync } = require('child_process');
  const path = require('path');
  const fs   = require('fs');

  const IS_PKG = typeof process.pkg !== 'undefined';
  const INSTALL_DIR = getInstallDir();
  const log = makeLogger(INSTALL_DIR);

  banner();

  // --- Verificar admin ---
  if (!isAdmin()) {
    console.error('❌  Este instalador requiere privilegios de Administrador.');
    console.error('');
    console.error('    Clic derecho en el archivo → "Ejecutar como administrador"');
    waitEnter(1);
    return;
  }

  const EXE_DEST = path.join(INSTALL_DIR, 'PrintBridge.exe');
  const CFG_DEST = path.join(INSTALL_DIR, 'printer.config.json');
  const PS1_DEST = path.join(INSTALL_DIR, 'send-raw.ps1');
  const STDOUT_LOG = path.join(INSTALL_DIR, 'service-stdout.log');
  const STDERR_LOG = path.join(INSTALL_DIR, 'service-stderr.log');

  // --- Crear directorio ---
  console.log(`📂  Instalando en: ${INSTALL_DIR}`);
  try {
    fs.mkdirSync(INSTALL_DIR, { recursive: true });
  } catch (err) {
    console.error('❌  No se pudo crear el directorio:', err.message);
    waitEnter(1);
    return;
  }
  log('Inicio de instalación. Directorio: ' + INSTALL_DIR);

  // --- Limpiar instalación previa (servicio NSSM viejo o Tarea Programada de una versión anterior) ---
  log('Limpiando instalación previa (si existe)...');
  try { execFileSync('taskkill.exe', ['/F', '/IM', 'PrintBridge.exe'], { stdio: 'pipe' }); } catch {}
  try {
    const nssmPrevio = resolveNssmPath();
    try { execFileSync(nssmPrevio, ['stop', SERVICE_NAME], { stdio: 'pipe' }); } catch {}
    execFileSync(nssmPrevio, ['remove', SERVICE_NAME, 'confirm'], { stdio: 'pipe' });
    log('Servicio NSSM previo detenido y removido.');
  } catch {}
  try {
    execFileSync('schtasks.exe', ['/Delete', '/TN', SERVICE_NAME, '/F'], { stdio: 'pipe' });
    log('Tarea Programada de una versión anterior eliminada.');
  } catch {}

  // --- Copiar PrintBridge.exe (este mismo exe) ---
  try {
    fs.copyFileSync(process.execPath, EXE_DEST);
    console.log('✅  PrintBridge.exe copiado.');
    log('PrintBridge.exe copiado a ' + EXE_DEST);
  } catch (err) {
    console.error('❌  Error copiando ejecutable:', err.message);
    log('ERROR copiando ejecutable: ' + err.message);
    waitEnter(1);
    return;
  }

  // --- Copiar printer.config.json ---
  // Primero busca uno junto al instalador, si no existe usa el embebido (defaults)
  const cfgSrc = IS_PKG
    ? path.join(path.dirname(process.execPath), 'printer.config.json')
    : path.join(__dirname, 'printer.config.json');

  try {
    if (fs.existsSync(cfgSrc)) {
      fs.copyFileSync(cfgSrc, CFG_DEST);
    } else if (IS_PKG) {
      fs.writeFileSync(CFG_DEST, fs.readFileSync(path.join(__dirname, 'printer.config.json')));
    }
    console.log('✅  printer.config.json copiado.');
    log('printer.config.json copiado.');
  } catch (err) {
    console.warn('⚠️   printer.config.json no copiado:', err.message);
    console.warn('    El servicio usará configuración por defecto.');
    log('WARN printer.config.json no copiado: ' + err.message);
  }

  // --- Extraer send-raw.ps1 desde el snapshot ---
  try {
    const ps1Src = IS_PKG
      ? path.join(path.dirname(process.execPath), 'send-raw.ps1')
      : path.join(__dirname, 'send-raw.ps1');

    if (fs.existsSync(ps1Src)) {
      fs.copyFileSync(ps1Src, PS1_DEST);
    } else if (IS_PKG) {
      fs.writeFileSync(PS1_DEST, fs.readFileSync(path.join(__dirname, 'send-raw.ps1')));
    }
    console.log('✅  send-raw.ps1 extraído.');
    log('send-raw.ps1 extraído.');
  } catch (err) {
    console.error('❌  Error extrayendo send-raw.ps1:', err.message);
    log('ERROR extrayendo send-raw.ps1: ' + err.message);
    waitEnter(1);
    return;
  }

  // --- Registrar como Servicio de Windows real (NSSM) ---
  // Corre como LocalSystem al arrancar Windows (sin depender de que un
  // usuario específico inicie sesión). Requiere que la impresora esté
  // instalada "para todos los usuarios" (compartida a nivel de máquina), si
  // no, LocalSystem (Sesión 0) no tiene acceso a ella — ver
  // docs/PRINTER-ALL-USERS.md.
  console.log('⏳  Registrando servicio de Windows...');
  log('Registrando servicio NSSM...');

  try {
    const nssm = resolveNssmPath();
    execFileSync(nssm, ['install', SERVICE_NAME, EXE_DEST, '--service'], { stdio: 'pipe' });
    execFileSync(nssm, ['set', SERVICE_NAME, 'DisplayName', 'GrupoMetalicoEMF Print Bridge'], { stdio: 'pipe' });
    execFileSync(nssm, ['set', SERVICE_NAME, 'Description',
      'Servicio local de impresión térmica ESC/POS para GrupoMetalicoEMF ERP. Puerto 7788.'], { stdio: 'pipe' });
    execFileSync(nssm, ['set', SERVICE_NAME, 'Start', 'SERVICE_AUTO_START'], { stdio: 'pipe' });
    execFileSync(nssm, ['set', SERVICE_NAME, 'ObjectName', 'LocalSystem'], { stdio: 'pipe' });
    execFileSync(nssm, ['set', SERVICE_NAME, 'AppStdout', STDOUT_LOG], { stdio: 'pipe' });
    execFileSync(nssm, ['set', SERVICE_NAME, 'AppStderr', STDERR_LOG], { stdio: 'pipe' });
    execFileSync(nssm, ['set', SERVICE_NAME, 'AppRotateFiles', '1'], { stdio: 'pipe' });
    execFileSync(nssm, ['set', SERVICE_NAME, 'AppRotateBytes', '1048576'], { stdio: 'pipe' });
    // Sin tope de reintentos (a diferencia de la Tarea Programada anterior, limitada a 5).
    execFileSync(nssm, ['set', SERVICE_NAME, 'AppExit', 'Default', 'Restart'], { stdio: 'pipe' });
    execFileSync(nssm, ['set', SERVICE_NAME, 'AppRestartDelay', '3000'], { stdio: 'pipe' });
    log('Servicio NSSM configurado.');
  } catch (err) {
    const stderr = err.stderr ? err.stderr.toString().trim() : err.message;
    console.error('❌  Error al registrar el servicio de Windows:', stderr);
    log('ERROR registrando servicio NSSM: ' + stderr);
    waitEnter(1);
    return;
  }

  // El comando "start" de NSSM a veces reporta "Unexpected status
  // SERVICE_START_PENDING" aunque el servicio sí termine de levantar unos
  // segundos después por su cuenta — no lo tratamos como error fatal, el
  // ping real de abajo es el que manda la verdad.
  try {
    const nssm = resolveNssmPath();
    execFileSync(nssm, ['start', SERVICE_NAME], { stdio: 'pipe' });
    log('Comando de arranque enviado al servicio.');
  } catch (err) {
    const stderr = err.stderr ? err.stderr.toString().trim() : err.message;
    console.warn('⚠️   El comando de arranque no confirmó de inmediato (puede ser normal):', stderr);
    log('WARN nssm start no confirmó de inmediato: ' + stderr);
  }

  // --- Confirma que el servicio realmente levantó antes de darlo por bueno ---
  pingServicio((up) => {
    console.log('');
    console.log('  ╔══════════════════════════════════════════════════╗');
    console.log('  ║   ✅  PrintBridge instalado correctamente        ║');
    console.log('  ║                                                  ║');
    console.log('  ║   Directorio : ' + INSTALL_DIR.substring(0, 34).padEnd(34) + '║');
    console.log('  ║   Servicio   : http://localhost:7788             ║');
    console.log('  ║   Inicio     : Automático con Windows (Servicio) ║');
    console.log('  ║                                                  ║');
    console.log('  ║   Para cambiar impresora:                        ║');
    console.log('  ║   1. Edita printer.config.json en el dir arriba  ║');
    console.log('  ║   2. Corre: PrintBridge.exe --restart            ║');
    console.log('  ╚══════════════════════════════════════════════════╝');
    console.log('');

    log(up
      ? 'Instalación OK — el servicio respondió en localhost:7788.'
      : 'Instalación completada pero el servicio NO respondió en localhost:7788.');

    if (!up) {
      console.warn('⚠️   El servicio no respondió en http://localhost:7788 todavía.');
      console.warn('    Verifica que la impresora esté instalada "para todos los usuarios"');
      console.warn('    (compartida a nivel de máquina) — Local System no ve impresoras que solo');
      console.warn('    existen en el perfil de un usuario. Si no, reinicia la PC.');
      console.warn('    Revisa también: ' + STDERR_LOG);
      console.log('');
    }

    waitEnter(0);
  });
}

// ══════════════════════════════════════════════════════════
// Desinstalación
// ══════════════════════════════════════════════════════════

function runUninstall() {
  const { execFileSync } = require('child_process');
  const fs = require('fs');

  const INSTALL_DIR = getInstallDir();
  const log = makeLogger(INSTALL_DIR);

  banner();

  if (!isAdmin()) {
    console.error('❌  Se requieren privilegios de Administrador.');
    waitEnter(1);
    return;
  }

  console.log('⏳  Deteniendo y eliminando el servicio...');
  log('Inicio de desinstalación.');

  try {
    const nssm = resolveNssmPath();
    try { execFileSync(nssm, ['stop', SERVICE_NAME], { stdio: 'pipe' }); } catch {}
    execFileSync(nssm, ['remove', SERVICE_NAME, 'confirm'], { stdio: 'pipe' });
    console.log('✅  Servicio eliminado.');
    log('Servicio NSSM detenido y removido.');
  } catch (err) {
    console.warn('⚠️   Error al eliminar el servicio:', err.message);
    log('WARN error eliminando servicio NSSM: ' + err.message);
  }

  // Por si quedó una Tarea Programada de una instalación anterior a NSSM.
  try { execFileSync('schtasks.exe', ['/Delete', '/TN', SERVICE_NAME, '/F'], { stdio: 'pipe' }); } catch {}
  try { execFileSync('taskkill.exe', ['/F', '/IM', 'PrintBridge.exe'], { stdio: 'pipe' }); } catch {}

  // Borrar directorio de instalación
  try {
    fs.rmSync(INSTALL_DIR, { recursive: true, force: true });
    console.log('✅  Archivos eliminados.');
  } catch (err) {
    console.warn('⚠️   No se pudo eliminar el directorio:', err.message);
    console.warn('    Puedes borrarlo manualmente:', INSTALL_DIR);
  }

  console.log('');
  console.log('  PrintBridge ha sido desinstalado.');
  console.log('');

  waitEnter(0);
}

// ══════════════════════════════════════════════════════════
// Reinicio
// ══════════════════════════════════════════════════════════

function runRestart() {
  const { execFileSync } = require('child_process');

  if (!isAdmin()) {
    console.error('❌  Se requieren privilegios de Administrador.');
    waitEnter(1);
    return;
  }

  try {
    const nssm = resolveNssmPath();
    execFileSync(nssm, ['restart', SERVICE_NAME], { stdio: 'pipe' });
    console.log('✅  PrintBridge reiniciado.');
  } catch (err) {
    const stderr = err.stderr ? err.stderr.toString().trim() : err.message;
    console.error('❌  Error al reiniciar:', stderr);
  }
}

// ══════════════════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════════════════

function isAdmin() {
  try {
    require('child_process').execSync('net session', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function banner() {
  console.log('');
  console.log('  ╔══════════════════════════════════════════════════╗');
  console.log('  ║   GrupoMetalicoEMF — Print Bridge Setup v3.0    ║');
  console.log('  ╚══════════════════════════════════════════════════╝');
  console.log('');
}

function waitEnter(exitCode) {
  const readline = require('readline');
  console.log('Presiona Enter para cerrar...');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question('', () => { rl.close(); process.exit(exitCode); });
}
