'use strict';
/**
 * GrupoMetalicoEMF — Print Bridge Setup v2.0
 *
 * Modos de ejecución:
 *   PrintBridge-Setup.exe              → instala el servicio en Windows
 *   PrintBridge-Setup.exe --service    → inicia el servidor HTTP (usado por la tarea programada)
 *   PrintBridge-Setup.exe --uninstall  → desinstala la tarea y borra archivos
 *   PrintBridge-Setup.exe --restart    → reinicia la tarea sin desinstalar
 *
 * Empaquetado con: npm run build:exe
 * Requiere ejecutar como Administrador para install/uninstall/restart.
 */

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
// Instalación
// ══════════════════════════════════════════════════════════

function runInstall() {
  const { execFileSync } = require('child_process');
  const path = require('path');
  const fs   = require('fs');
  const os   = require('os');

  const IS_PKG = typeof process.pkg !== 'undefined';

  banner();

  // --- Verificar admin ---
  if (!isAdmin()) {
    console.error('❌  Este instalador requiere privilegios de Administrador.');
    console.error('');
    console.error('    Clic derecho en el archivo → "Ejecutar como administrador"');
    waitEnter(1);
    return;
  }

  const INSTALL_DIR = path.join(
    process.env.PROGRAMFILES ?? process.env['ProgramFiles'] ?? 'C:\\Program Files',
    'GrupoMetalicoEMF',
    'PrintBridge',
  );
  const EXE_DEST  = path.join(INSTALL_DIR, 'PrintBridge.exe');
  const CFG_DEST  = path.join(INSTALL_DIR, 'printer.config.json');
  const PS1_DEST  = path.join(INSTALL_DIR, 'send-raw.ps1');
  const TASK_NAME = 'GrupoMetalicoEMF-PrintBridge';

  // --- Crear directorio ---
  console.log(`📂  Instalando en: ${INSTALL_DIR}`);
  try {
    fs.mkdirSync(INSTALL_DIR, { recursive: true });
  } catch (err) {
    console.error('❌  No se pudo crear el directorio:', err.message);
    waitEnter(1);
    return;
  }

  // --- Copiar PrintBridge.exe (este mismo exe) ---
  try {
    fs.copyFileSync(process.execPath, EXE_DEST);
    console.log('✅  PrintBridge.exe copiado.');
  } catch (err) {
    console.error('❌  Error copiando ejecutable:', err.message);
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
      // Extraer config embebida del snapshot
      fs.writeFileSync(CFG_DEST, fs.readFileSync(path.join(__dirname, 'printer.config.json')));
    }
    console.log('✅  printer.config.json copiado.');
  } catch (err) {
    console.warn('⚠️   printer.config.json no copiado:', err.message);
    console.warn('    El servicio usará configuración por defecto.');
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
  } catch (err) {
    console.error('❌  Error extrayendo send-raw.ps1:', err.message);
    waitEnter(1);
    return;
  }

  // --- Registrar tarea en Programador de Tareas ---
  console.log('⏳  Registrando tarea en Windows...');

  const ps1Script = [
    `$taskName = '${TASK_NAME}'`,
    `$exePath  = '${EXE_DEST.replace(/'/g, "''")}'`,
    '',
    'Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue | Out-Null',
    '',
    "$action    = New-ScheduledTaskAction -Execute $exePath -Argument '--service'",
    '$trigger   = New-ScheduledTaskTrigger -AtStartup',
    '$settings  = New-ScheduledTaskSettingsSet -ExecutionTimeLimit 0 -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 2) -MultipleInstances IgnoreNew',
    "$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest",
    '',
    'Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null',
    'Start-ScheduledTask -TaskName $taskName',
    "Write-Host 'TASK_OK'",
  ].join('\r\n');

  const tmpPs1 = path.join(os.tmpdir(), `pb-install-${Date.now()}.ps1`);

  try {
    fs.writeFileSync(tmpPs1, ps1Script, 'utf8');
    const out = execFileSync('powershell', [
      '-ExecutionPolicy', 'Bypass',
      '-NonInteractive', '-NoProfile',
      '-File', tmpPs1,
    ], { encoding: 'utf8', timeout: 30000 });

    if (!out.includes('TASK_OK')) {
      throw new Error('Respuesta inesperada de PowerShell: ' + out.trim());
    }

    console.log('');
    console.log('  ╔══════════════════════════════════════════════════╗');
    console.log('  ║   ✅  PrintBridge instalado correctamente        ║');
    console.log('  ║                                                  ║');
    console.log('  ║   Directorio : ' + INSTALL_DIR.substring(0, 34).padEnd(34) + '║');
    console.log('  ║   Servicio   : http://localhost:7788             ║');
    console.log('  ║   Inicio     : Automático con Windows            ║');
    console.log('  ║                                                  ║');
    console.log('  ║   Para cambiar impresora:                        ║');
    console.log('  ║   1. Edita printer.config.json en el dir arriba  ║');
    console.log('  ║   2. Vuelve a ejecutar como Admin                ║');
    console.log('  ╚══════════════════════════════════════════════════╝');
    console.log('');
  } catch (err) {
    console.error('❌  Error al registrar la tarea de Windows:', err.message);
    waitEnter(1);
    return;
  } finally {
    try { require('fs').unlinkSync(tmpPs1); } catch {}
  }

  waitEnter(0);
}

// ══════════════════════════════════════════════════════════
// Desinstalación
// ══════════════════════════════════════════════════════════

function runUninstall() {
  const { execFileSync } = require('child_process');
  const path = require('path');
  const fs   = require('fs');
  const os   = require('os');

  banner();

  if (!isAdmin()) {
    console.error('❌  Se requieren privilegios de Administrador.');
    waitEnter(1);
    return;
  }

  const TASK_NAME  = 'GrupoMetalicoEMF-PrintBridge';
  const INSTALL_DIR = path.join(
    process.env.PROGRAMFILES ?? process.env['ProgramFiles'] ?? 'C:\\Program Files',
    'GrupoMetalicoEMF',
    'PrintBridge',
  );

  console.log('⏳  Deteniendo y eliminando tarea...');

  const ps1Script = [
    `$taskName = '${TASK_NAME}'`,
    'Stop-ScheduledTask  -TaskName $taskName -ErrorAction SilentlyContinue',
    'Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue | Out-Null',
    "Write-Host 'TASK_REMOVED'",
  ].join('\r\n');

  const tmpPs1 = path.join(os.tmpdir(), `pb-uninstall-${Date.now()}.ps1`);

  try {
    fs.writeFileSync(tmpPs1, ps1Script, 'utf8');
    execFileSync('powershell', [
      '-ExecutionPolicy', 'Bypass',
      '-NonInteractive', '-NoProfile',
      '-File', tmpPs1,
    ], { encoding: 'utf8', timeout: 20000 });

    console.log('✅  Tarea eliminada.');
  } catch (err) {
    console.warn('⚠️   Error al eliminar tarea:', err.message);
  } finally {
    try { fs.unlinkSync(tmpPs1); } catch {}
  }

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
  const path = require('path');
  const fs   = require('fs');
  const os   = require('os');

  if (!isAdmin()) {
    console.error('❌  Se requieren privilegios de Administrador.');
    waitEnter(1);
    return;
  }

  const TASK_NAME = 'GrupoMetalicoEMF-PrintBridge';

  const ps1Script = [
    `$taskName = '${TASK_NAME}'`,
    'Stop-ScheduledTask  -TaskName $taskName -ErrorAction SilentlyContinue',
    'Start-ScheduledTask -TaskName $taskName',
    "Write-Host 'RESTARTED'",
  ].join('\r\n');

  const tmpPs1 = path.join(os.tmpdir(), `pb-restart-${Date.now()}.ps1`);

  try {
    fs.writeFileSync(tmpPs1, ps1Script, 'utf8');
    execFileSync('powershell', [
      '-ExecutionPolicy', 'Bypass',
      '-NonInteractive', '-NoProfile',
      '-File', tmpPs1,
    ], { encoding: 'utf8', timeout: 20000 });

    console.log('✅  PrintBridge reiniciado.');
  } catch (err) {
    console.error('❌  Error al reiniciar:', err.message);
  } finally {
    try { fs.unlinkSync(tmpPs1); } catch {}
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
  console.log('  ║   GrupoMetalicoEMF — Print Bridge Setup v2.0    ║');
  console.log('  ╚══════════════════════════════════════════════════╝');
  console.log('');
}

function waitEnter(exitCode) {
  const readline = require('readline');
  console.log('Presiona Enter para cerrar...');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question('', () => { rl.close(); process.exit(exitCode); });
}
