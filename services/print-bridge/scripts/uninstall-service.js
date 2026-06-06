/**
 * Desinstala el Print Bridge del administrador de servicios Windows.
 * Ejecutar con: node scripts/uninstall-service.js
 * REQUIERE terminal abierta como Administrador.
 */

const path = require('path');

try {
  require('node-windows');
} catch {
  console.error('❌ Falta dependencia: corre "npm install" primero.');
  process.exit(1);
}

const { Service } = require('node-windows');

const svc = new Service({
  name:   'GrupoMetalicoEMF Print Bridge',
  script:  path.join(__dirname, '..', 'index.js'),
});

svc.on('uninstall', () => {
  console.log('✅ Servicio desinstalado correctamente.');
  console.log('   Ya no arrancará automáticamente al iniciar Windows.');
});

svc.on('notinstalled', () => {
  console.warn('⚠️  El servicio no está instalado.');
});

svc.on('error', (err) => {
  console.error('❌ Error al desinstalar:', err.message ?? err);
  console.error('   Asegúrate de ejecutar la terminal como Administrador.');
});

console.log('⏳ Desinstalando servicio...');
svc.uninstall();
