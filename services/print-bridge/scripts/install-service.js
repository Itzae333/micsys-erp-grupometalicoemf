/**
 * Instala el Print Bridge como servicio Windows usando node-windows.
 * Ejecutar con: node scripts/install-service.js
 * REQUIERE terminal abierta como Administrador.
 */

const path = require('path');
const fs   = require('fs');

// Verificar que node-windows está disponible
try {
  require('node-windows');
} catch {
  console.error('❌ Falta dependencia: corre "npm install" primero.');
  process.exit(1);
}

const { Service } = require('node-windows');

const scriptPath  = path.join(__dirname, '..', 'index.js');
const configPath  = path.join(__dirname, '..', 'printer.config.json');

// Verificar que existe el archivo principal
if (!fs.existsSync(scriptPath)) {
  console.error('❌ No se encontró index.js en:', scriptPath);
  process.exit(1);
}

// Advertir si no hay config
if (!fs.existsSync(configPath)) {
  console.warn('⚠️  printer.config.json no encontrado.');
  console.warn('   El servicio usará defaults. Edita el archivo y reinicia el servicio.');
} else {
  try {
    const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    console.log('📋 Configuración detectada:');
    console.log('   Transporte :', cfg.transport ?? 'network');
    if (cfg.transport === 'windows-printer') {
      console.log('   Impresora  :', cfg.printerName ?? 'Ticketera');
    } else if (cfg.transport === 'network') {
      console.log('   IP:Puerto  :', `${cfg.network?.ip}:${cfg.network?.port}`);
    } else {
      console.log('   Puerto     :', cfg.windowsPort ?? 'COM3');
    }
  } catch {
    console.warn('⚠️  printer.config.json no es JSON válido.');
  }
}

console.log('\n⏳ Instalando servicio Windows...\n');

const svc = new Service({
  name:        'GrupoMetalicoEMF Print Bridge',
  description: 'Servicio local de impresión térmica ESC/POS para GrupoMetalicoEMF ERP. Puerto 7788.',
  script:       scriptPath,
  nodeOptions: ['--max_old_space_size=128'],
  // Reintentar automáticamente si el proceso muere
  wait: 2,
  grow: 0.5,
});

svc.on('install', () => {
  svc.start();
  console.log('✅ Servicio instalado e iniciado.');
  console.log('');
  console.log('   Nombre  : GrupoMetalicoEMF Print Bridge');
  console.log('   URL     : http://localhost:7788');
  console.log('   Config  : ' + configPath);
  console.log('');
  console.log('   Para verificar: abre services.msc o ejecuta en PowerShell:');
  console.log('   Get-Service "GrupoMetalicoEMF*"');
  console.log('');
  console.log('   Para desinstalar: node scripts/uninstall-service.js (como Admin)');
});

svc.on('alreadyinstalled', () => {
  console.warn('⚠️  El servicio ya está instalado.');
  console.warn('   Si quieres reinstalarlo, desinstálalo primero:');
  console.warn('   node scripts/uninstall-service.js');
});

svc.on('error', (err) => {
  console.error('❌ Error al instalar el servicio:', err.message ?? err);
  console.error('   Asegúrate de ejecutar la terminal como Administrador.');
});

svc.install();
