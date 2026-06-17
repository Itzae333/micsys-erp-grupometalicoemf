import { PrismaClient, TipoUbicacion, RolUsuario, TipoColumna, TipoPago } from '../src/generated/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

// Config base para cada empresa: las columnas que tendrá su Matriz
const COLUMNAS_BASE = [
  { tipo: TipoColumna.DESCRIPCION, numero: 1, label: 'Nombre',      orden: 1 },
  { tipo: TipoColumna.DESCRIPCION, numero: 2, label: 'Tipo',        orden: 2 },
  { tipo: TipoColumna.EXISTENCIA,  numero: 1, label: 'Existencias', orden: 3 },
  { tipo: TipoColumna.PRECIO,      numero: 1, label: 'Publico',     orden: 4 },
  { tipo: TipoColumna.PRECIO,      numero: 2, label: 'Mayoreo',     orden: 5 },
];

async function seedColumnas(empresaId: string, ubicacionId: string, prefix: string) {
  for (const col of COLUMNAS_BASE) {
    const id = `${prefix}-${col.tipo.toLowerCase()}-${col.numero}`;
    await prisma.configColumnasUbicacion.upsert({
      where: { empresa_id_ubicacion_id_tipo_numero: { empresa_id: empresaId, ubicacion_id: ubicacionId, tipo: col.tipo, numero: col.numero } },
      update: { label: col.label, orden: col.orden },
      create: { id, empresa_id: empresaId, ubicacion_id: ubicacionId, ...col },
    });
  }
}

async function seedMostrador(ubicacionId: string, id: string) {
  await prisma.cliente.upsert({
    where: { id },
    update: { precio_num: 1, limite_credito: 0 },
    create: {
      id,
      ubicacion_id: ubicacionId,
      nombre: 'MOSTRADOR',
      precio_num: 1,
      limite_credito: 0,
      saldo_pendiente: 0,
    },
  });
}

async function main() {
  console.log('🌱 Seeding GrupoMetalicoEMF...');

  // ── Empresas ──────────────────────────────────────────────
  const emfimifar = await prisma.empresa.upsert({
    where: { id: 'emfimifar-id' },
    update: {},
    create: {
      id: 'emfimifar-id',
      nombre: 'EMFIMIFAR',
      razon_social: 'EMFIMIFAR S.A. de C.V.',
      rfc: 'EMF000101ABC',
    },
  });

  const metalicosLyeva = await prisma.empresa.upsert({
    where: { id: 'metalicos-lyeva-id' },
    update: {},
    create: {
      id: 'metalicos-lyeva-id',
      nombre: 'Metálicos Lyeva',
      razon_social: 'Metálicos Lyeva S.A. de C.V.',
      rfc: 'MLY000101DEF',
    },
  });

  const laminasMonterrey = await prisma.empresa.upsert({
    where: { id: 'laminas-monterrey-id' },
    update: {},
    create: {
      id: 'laminas-monterrey-id',
      nombre: 'Láminas Monterrey',
      razon_social: 'Láminas Monterrey S.A. de C.V.',
      rfc: 'LMO000101GHI',
    },
  });

  // ── Una Matriz por empresa ────────────────────────────────
  const emfMatriz = await prisma.ubicacion.upsert({
    where: { id: 'emf-matriz-id' },
    update: {},
    create: {
      id: 'emf-matriz-id',
      empresa_id: emfimifar.id,
      nombre: 'Matriz EMFIMIFAR',
      tipo: TipoUbicacion.MATRIZ,
      municipio: 'Monterrey',
      estado: 'Nuevo León',
    },
  });

  const lyevaMatriz = await prisma.ubicacion.upsert({
    where: { id: 'lyeva-matriz-id' },
    update: {},
    create: {
      id: 'lyeva-matriz-id',
      empresa_id: metalicosLyeva.id,
      nombre: 'Matriz Metálicos Lyeva',
      tipo: TipoUbicacion.MATRIZ,
      municipio: 'Monterrey',
      estado: 'Nuevo León',
    },
  });

  const laminasMatriz = await prisma.ubicacion.upsert({
    where: { id: 'laminas-matriz-id' },
    update: {},
    create: {
      id: 'laminas-matriz-id',
      empresa_id: laminasMonterrey.id,
      nombre: 'Matriz Láminas Monterrey',
      tipo: TipoUbicacion.MATRIZ,
      municipio: 'Monterrey',
      estado: 'Nuevo León',
    },
  });

  // ── ConfigColumnas por Matriz ─────────────────────────────
  // Cada empresa tiene: Nombre, Tipo (descripciones) + Existencias + Publico, Mayoreo (precios)
  await seedColumnas(emfimifar.id,       emfMatriz.id,    'emf-col');
  await seedColumnas(metalicosLyeva.id,  lyevaMatriz.id,  'lyeva-col');
  await seedColumnas(laminasMonterrey.id, laminasMatriz.id, 'laminas-col');

  // ── Cliente Mostrador (precio_num=1 → Publico, crédito=0) ─
  await seedMostrador(emfMatriz.id,    'mostrador-emf-id');
  await seedMostrador(lyevaMatriz.id,  'mostrador-lyeva-id');
  await seedMostrador(laminasMatriz.id, 'mostrador-laminas-id');

  // ── Super Usuario ─────────────────────────────────────────
  const superHash = await argon2.hash('SuperPass2026!');
  const superUsuario = await prisma.usuario.upsert({
    where: { email: 'super@grupometalicoemf.com' },
    update: { password_hash: superHash },
    create: {
      empresa_id: emfimifar.id,
      nombre: 'Super',
      apellidos: 'Usuario',
      email: 'super@grupometalicoemf.com',
      password_hash: superHash,
      rol: RolUsuario.SUPER_USUARIO,
    },
  });

  // ── Admins por empresa ────────────────────────────────────
  const adminEmfHash = await argon2.hash('AdminEmf2026!');
  const adminEmf = await prisma.usuario.upsert({
    where: { email: 'admin@emfimifar.com' },
    update: {},
    create: {
      empresa_id: emfimifar.id,
      nombre: 'Admin',
      apellidos: 'EMFIMIFAR',
      email: 'admin@emfimifar.com',
      password_hash: adminEmfHash,
      rol: RolUsuario.ADMIN,
    },
  });

  const adminLyevaHash = await argon2.hash('AdminLyeva2026!');
  const adminLyeva = await prisma.usuario.upsert({
    where: { email: 'admin@metalicoslyeva.com' },
    update: {},
    create: {
      empresa_id: metalicosLyeva.id,
      nombre: 'Admin',
      apellidos: 'Metálicos Lyeva',
      email: 'admin@metalicoslyeva.com',
      password_hash: adminLyevaHash,
      rol: RolUsuario.ADMIN,
    },
  });

  const adminLaminasHash = await argon2.hash('AdminLaminas2026!');
  const adminLaminas = await prisma.usuario.upsert({
    where: { email: 'admin@laminasmonterrey.com' },
    update: {},
    create: {
      empresa_id: laminasMonterrey.id,
      nombre: 'Admin',
      apellidos: 'Láminas Monterrey',
      email: 'admin@laminasmonterrey.com',
      password_hash: adminLaminasHash,
      rol: RolUsuario.ADMIN,
    },
  });

  // ── Usuarios operativos EMFIMIFAR ─────────────────────────
  const encargadoHash = await argon2.hash('Encargado2026!');
  const encargado = await prisma.usuario.upsert({
    where: { email: 'encargado@emfimifar.com' },
    update: {},
    create: {
      empresa_id: emfimifar.id,
      nombre: 'Carlos',
      apellidos: 'Encargado',
      email: 'encargado@emfimifar.com',
      password_hash: encargadoHash,
      rol: RolUsuario.ENCARGADO,
    },
  });

  const vendedorHash = await argon2.hash('Vendedor2026!');
  const vendedor = await prisma.usuario.upsert({
    where: { email: 'vendedor@emfimifar.com' },
    update: {},
    create: {
      empresa_id: emfimifar.id,
      nombre: 'Ana',
      apellidos: 'Vendedora',
      email: 'vendedor@emfimifar.com',
      password_hash: vendedorHash,
      rol: RolUsuario.VENDEDOR,
    },
  });

  const almacenistaHash = await argon2.hash('Almacenista2026!');
  const almacenista = await prisma.usuario.upsert({
    where: { email: 'almacenista@emfimifar.com' },
    update: {},
    create: {
      empresa_id: emfimifar.id,
      nombre: 'José',
      apellidos: 'Almacenista',
      email: 'almacenista@emfimifar.com',
      password_hash: almacenistaHash,
      rol: RolUsuario.ALMACENISTA,
    },
  });

  // ── Asignaciones usuario ↔ ubicación ─────────────────────
  const asignaciones = [
    { usuario_id: superUsuario.id, ubicacion_id: emfMatriz.id },
    { usuario_id: adminEmf.id,     ubicacion_id: emfMatriz.id },
    { usuario_id: adminLyeva.id,   ubicacion_id: lyevaMatriz.id },
    { usuario_id: adminLaminas.id, ubicacion_id: laminasMatriz.id },
    { usuario_id: encargado.id,    ubicacion_id: emfMatriz.id },
    { usuario_id: vendedor.id,     ubicacion_id: emfMatriz.id },
    { usuario_id: almacenista.id,  ubicacion_id: emfMatriz.id },
  ];

  for (const asig of asignaciones) {
    await prisma.usuarioUbicacion.upsert({
      where: { usuario_id_ubicacion_id: asig },
      update: {},
      create: asig,
    });
  }

  // ── Áreas de trabajo por empresa ─────────────────────────
  const areasBase = [
    { sufijo: 'emf',     empresaId: emfimifar.id },
    { sufijo: 'lyeva',   empresaId: metalicosLyeva.id },
    { sufijo: 'laminas', empresaId: laminasMonterrey.id },
  ];

  for (const { sufijo, empresaId } of areasBase) {
    await prisma.area.upsert({
      where: { empresa_id_nombre: { empresa_id: empresaId, nombre: 'Administración' } },
      update: {},
      create: { id: `area-admin-${sufijo}`,   empresa_id: empresaId, nombre: 'Administración', tipo_pago: TipoPago.POR_HORA },
    });
    await prisma.area.upsert({
      where: { empresa_id_nombre: { empresa_id: empresaId, nombre: 'Corte' } },
      update: {},
      create: { id: `area-corte-${sufijo}`,   empresa_id: empresaId, nombre: 'Corte',   tipo_pago: TipoPago.POR_PIEZA },
    });
    await prisma.area.upsert({
      where: { empresa_id_nombre: { empresa_id: empresaId, nombre: 'Troquel' } },
      update: {},
      create: { id: `area-troquel-${sufijo}`, empresa_id: empresaId, nombre: 'Troquel', tipo_pago: TipoPago.POR_PIEZA },
    });
  }

  // ── Empleados EMFIMIFAR vinculados a usuarios ─────────────
  // Encargado, vendedor y almacenista son empleados. Admin NO.
  await prisma.empleado.upsert({
    where: { id: 'emp-encargado-emf' },
    update: {},
    create: {
      id:                   'emp-encargado-emf',
      empresa_id:           emfimifar.id,
      nombre:               encargado.nombre,
      apellidos:            encargado.apellidos,
      puesto:               'Encargado de Sucursal',
      area_id:              'area-admin-emf',
      usuario_id:           encargado.id,
      salario_diario:       350,
      fecha_ingreso:        new Date('2024-01-15'),
      descuento_por_30min:  25,   // $25 por cada 30 min tarde
    },
  });

  await prisma.empleado.upsert({
    where: { id: 'emp-vendedor-emf' },
    update: {},
    create: {
      id:                   'emp-vendedor-emf',
      empresa_id:           emfimifar.id,
      nombre:               vendedor.nombre,
      apellidos:            vendedor.apellidos,
      puesto:               'Vendedora',
      area_id:              'area-admin-emf',
      usuario_id:           vendedor.id,
      salario_diario:       280,
      fecha_ingreso:        new Date('2024-03-01'),
      descuento_por_30min:  20,   // $20 por cada 30 min tarde
    },
  });

  await prisma.empleado.upsert({
    where: { id: 'emp-almacenista-emf' },
    update: {},
    create: {
      id:                   'emp-almacenista-emf',
      empresa_id:           emfimifar.id,
      nombre:               almacenista.nombre,
      apellidos:            almacenista.apellidos,
      puesto:               'Almacenista',
      area_id:              'area-corte-emf',
      usuario_id:           almacenista.id,
      salario_diario:       260,
      fecha_ingreso:        new Date('2024-06-01'),
      minimo_piezas_semana: 200,  // mínimo 200 piezas/semana
      sancion_por_pieza:    5,    // $5 por pieza faltante
    },
  });

  // ── Resumen ───────────────────────────────────────────────
  console.log('');
  console.log('✅ Seed completado');
  console.log('');
  console.log('Columnas configuradas por empresa (Matriz):');
  console.log('  descripcion_1 → Nombre');
  console.log('  descripcion_2 → Tipo');
  console.log('  existencia_1  → Existencias');
  console.log('  precio_1      → Publico');
  console.log('  precio_2      → Mayoreo');
  console.log('');
  console.log('Áreas creadas por empresa: Administración (POR_HORA), Corte (POR_PIEZA), Troquel (POR_PIEZA)');
  console.log('');
  console.log('Empleados EMFIMIFAR (vinculados a usuario del sistema):');
  console.log('  emp-encargado-emf  → Carlos Encargado      → encargado@emfimifar.com');
  console.log('  emp-vendedor-emf   → Ana Vendedora         → vendedor@emfimifar.com');
  console.log('  emp-almacenista-emf→ José Almacenista      → almacenista@emfimifar.com');
  console.log('');
  console.log('Clientes Mostrador creados (precio_num=1 → Publico, crédito=0):');
  console.log('  EMFIMIFAR        → mostrador-emf-id');
  console.log('  Metálicos Lyeva  → mostrador-lyeva-id');
  console.log('  Láminas Monterrey → mostrador-laminas-id');
  console.log('');
  console.log('Credenciales:');
  console.log('  super@grupometalicoemf.com    → SuperPass2026!    (SUPER_USUARIO)');
  console.log('  admin@emfimifar.com           → AdminEmf2026!     (ADMIN - EMFIMIFAR)');
  console.log('  admin@metalicoslyeva.com      → AdminLyeva2026!   (ADMIN - Metálicos Lyeva)');
  console.log('  admin@laminasmonterrey.com    → AdminLaminas2026! (ADMIN - Láminas Monterrey)');
  console.log('  encargado@emfimifar.com       → Encargado2026!    (ENCARGADO)');
  console.log('  vendedor@emfimifar.com        → Vendedor2026!     (VENDEDOR)');
  console.log('  almacenista@emfimifar.com     → Almacenista2026!  (ALMACENISTA)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
