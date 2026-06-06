# ⚙️ GrupoMetalicoEMF — Guía de Ejecución con Claude Code

> **GrupoMetalicoEMF** es el ERP industrial para el Grupo Metálico EMF.  
> Gestiona tres empresas (EMFIMIFAR, Metálicos Lyeva, Láminas Monterrey) con manufactura, inventario parametrizable, ventas con ticketera térmica, crédito, compras, RH y reportería.

---

## 📂 Estructura del proyecto

```
grupoMetalicoEMF/
├── docs/
│   ├── fases/
│   │   ├── 00-PROYECTO-MAESTRO.md          ★ LEER PRIMERO SIEMPRE
│   │   ├── 01-FASE-FUNDACION.md
│   │   ├── 02-FASE-INVENTARIO.md
│   │   ├── 03-FASE-VENTAS.md
│   │   ├── 04-FASE-CLIENTES-CREDITO.md
│   │   └── 05-08-FASES-ENTRADAS-COMPRAS-RH-REPORTES.md
│   ├── DESIGN-SYSTEM.md                    ★ LEER ANTES DE CADA SESIÓN DE UI
│   └── reference/
│       ├── mockups.html                    ★ REFERENCIA VISUAL OBLIGATORIA
│       └── BRAND-GUIDELINES.md
│
├── apps/
│   ├── web/                                ← Next.js 14 (PWA)
│   └── api/                               ← NestJS + Prisma
│
└── services/
    └── print-bridge/                       ← Servicio Windows para ticketera térmica
```

---

## 🎨 Antes de escribir UNA línea de UI

**OBLIGATORIO** leer estos archivos antes de generar cualquier componente:

1. `docs/DESIGN-SYSTEM.md` → paleta, tipografía, componentes base, naming
2. `docs/reference/BRAND-GUIDELINES.md` → reglas de marca (logos de las 3 empresas)
3. `docs/reference/mockups.html` → pantallas de referencia visual

---

## 🚀 Cómo empezar

### 1. Clonar y preparar

```bash
git clone [repo] grupoMetalicoEMF
cd grupoMetalicoEMF

# Levantar PostgreSQL + Redis local
docker compose up -d

# Instalar dependencias
pnpm install

# Correr migraciones iniciales
pnpm --filter api prisma migrate dev
pnpm --filter api prisma db seed

# Iniciar dev servers
pnpm dev   # levanta api en :3001 y web en :3000
```

### 2. Iniciar Claude Code

```bash
cd grupoMetalicoEMF
claude
```

### 3. Prompt inicial recomendado (COPIAR TAL CUAL)

```
Vamos a construir GrupoMetalicoEMF, un ERP industrial para un grupo
de empresas de manufactura metálica en México.

Para la funcionalidad de turbo y todo eso basate en este otro ERP que se creo con al isma tencogli mismaverison todo tal cual para el deligue identico D:\itzae\WorkSpace-Mictlan-System-final\hemocore\micsys-erp-hemocore

Antes de escribir CUALQUIER código, lee estos archivos en orden:

1. docs/fases/00-PROYECTO-MAESTRO.md
   → Arquitectura, stack, roles, lógica del inventario parametrizable
     y estrategia de impresión térmica.

2. docs/DESIGN-SYSTEM.md
   → Paleta, tipografía, componentes base. Leer SIEMPRE antes de UI.

3. docs/reference/BRAND-GUIDELINES.md
   → Reglas de marca: logos de las 3 empresas y del grupo.

4. docs/reference/mockups.html
   → Pantallas de referencia visual.

5. docs/fases/01-FASE-FUNDACION.md
   → Primera fase a implementar.

Cuando termines de leer, confírmame:
- El nombre del sistema y las 3 empresas del grupo
- Los 7 roles del sistema y su scope
- El stack técnico (frontend, backend, BD, impresión)
- Las 8 fases del roadmap con sus dependencias
- El concepto clave del inventario parametrizable

Luego procederemos:
- UNA fase a la vez
- Cada feature: schema Prisma → servicios NestJS → tests → endpoints → UI
- La UI debe respetar el design system y los mockups
- Conventional Commits en cada cambio
- Si tienes dudas de negocio, pregunta antes de asumir
```

### 4. Prompt para sesión de UI

```
Vamos a implementar [pantalla].

1. Lee docs/DESIGN-SYSTEM.md sección "Componentes base"
2. Abre docs/reference/mockups.html y revisa el mockup #[N]
3. Revisa qué componentes existen en apps/web/components/ui/
4. Lista los nuevos componentes a crear

NO empieces a codificar hasta confirmar el plan visual conmigo.
```

### 5. Prompt para sesión de backend

```
Vamos a implementar [módulo] de la Fase [N].

1. Lee docs/fases/0N-FASE-XXX.md sección [módulo]
2. Revisa el schema Prisma existente para identificar relaciones
3. Propón schema delta, servicios, DTOs y endpoints
4. Si hay decisiones de negocio ambiguas, pregunta antes

Empieza con el schema. La UI la vemos después.
```

---

## 📖 Orden de las fases

| # | Archivo | Módulo | Por qué este orden |
|---|---------|--------|--------------------|
| 0 | `00-PROYECTO-MAESTRO.md` | Visión y arquitectura | Lectura previa obligatoria |
| 1 | `01-FASE-FUNDACION.md` | Auth, empresas, ubicaciones, config columnas | La base de todo |
| 2 | `02-FASE-INVENTARIO.md` | Productos, precios parametrizables, proveedores | Sin inventario no hay ventas |
| 3 | `03-FASE-VENTAS.md` | Carrito, pagos, tickets, carga almacén | El corazón operativo |
| 4 | `04-FASE-CLIENTES-CREDITO.md` | Clientes, cuentas, cargos, abonos | Cierra el ciclo financiero cliente |
| 5 | `05-08-...md` §Entradas | Movimientos de inventario | Alimenta el inventario desde fábricas y proveedores |
| 6 | `05-08-...md` §Compras | OCs, cuentas por pagar | Gestión de proveedores |
| 7 | `05-08-...md` §RH | Empleados, asistencia, producción | Independiente, puede ir en paralelo con 5-6 |
| 8 | `05-08-...md` §Reportes | Dashboards, exports, corte de caja | Necesita todas las fases anteriores |

**No paralelizar fases 1-4.** Las dependencias son fuertes. Las fases 5, 6 y 7 pueden desarrollarse en paralelo entre sí una vez terminadas las fases 1 y 2.

---

## ✅ Checklist de cierre por fase

```
[ ] Migraciones Prisma aplicadas y reversibles (prisma migrate deploy funciona)
[ ] Tests con cobertura >70% en lógica de negocio
[ ] Swagger documenta todos los endpoints nuevos
[ ] UI probada en mobile 390px y tablet 1280x800
[ ] Offline: la feature degrada correctamente sin conexión
[ ] Naming respeta DESIGN-SYSTEM.md
[ ] Conventional Commits limpios
[ ] PR mergeado a main con review
[ ] Deploy a staging exitoso
[ ] Demo de 3-5 min grabada del flujo completo
```

---

## 🔧 Prompts útiles

**Para empezar una fase:**
```
Lee la sección de la Fase [N] en docs/fases/. Dame el plan de
implementación por días para 1 dev. Identifica dependencias y riesgos.
Recuerda el design system y los mockups para cualquier UI.
```

**Para validar antes de cerrar fase:**
```
Repasemos los criterios de aceptación de la Fase [N]. Por cada uno,
valida con código y tests reales. Reporta estatus y qué falta.
```

**Si algo se complica:**
```
Estoy atorado con [problema]. Pregunta lo que necesites para entender
el contexto. No quiero parches; quiero la solución correcta.
```

**Para el Print Bridge:**
```
Vamos a implementar el servicio de impresión térmica.
Lee la sección "Print Bridge" en 00-PROYECTO-MAESTRO.md y
la sección "Print Bridge" en 03-FASE-VENTAS.md.
Necesito: el servicio Express, los comandos ESC/POS para ticket de cobro
y ticket de carga parcial, y el script de instalación como servicio Windows.
```

---

## 🎯 Decisiones pendientes antes de arrancar

1. **Hosting:** Railway (rápido, ~$30/mes para MVP) vs DigitalOcean con Docker Compose (~$40/mes, más control). Recomendación: Railway para MVP.
2. **Dominio:** ¿`app.grupometalicoemf.com` o se configura por cliente?
3. **Facturación CFDI:** ¿Se integra en fase 1 del roadmap comercial o se deja para después? Si sí, decidir PAC (Facturama recomendado para iniciar).
4. **Logo por empresa:** Los logos de EMFIMIFAR, Metálicos Lyeva y Láminas Monterrey deben subirse a R2 antes del primer deploy.
5. **Ticketera:** ¿Qué marca y modelo usan actualmente? (Para ajustar los comandos ESC/POS del Print Bridge — Epson TM-T20, Star, Bixolon, etc. todos usan ESC/POS pero con pequeñas diferencias.)

---

## ⚠️ Riesgos principales

- **El guard de empresa/ubicación** es lo más crítico de la Fase 1. Un bug aquí expone datos de una empresa a otra.
- **Inventario parametrizable:** el schema de `ConfigColumnasUbicacion` es inmutable después de la Fase 2. Definirlo bien desde el inicio.
- **Concurrencia en ventas:** dos cajeros vendiendo el mismo producto simultáneamente puede generar existencia negativa. El sistema lo maneja en el paso de carga (almacenista), no en la captura de venta.
- **Offline con crédito:** las ventas a crédito requieren conexión para verificar el límite del cliente. Esto es una restricción de diseño explícita, no un bug.
- **Print Bridge en Windows:** el instalador debe ser probado en una máquina limpia con diferentes versiones de Windows (10 y 11). Node.js debe estar incluido en el instalador o verificarse su presencia.
- **Consistencia inter-empresa:** cuando EMFIMIFAR vende a Metálicos Lyeva, la salida de una debe generar la entrada de la otra. Este flujo de doble registro debe ser transaccional.

---

## 💼 Notas de operación por empresa

### EMFIMIFAR
- Manufactura anaqueles, góndolas y estantería metálica.
- Tiene Matriz (manufactura + venta), Fábrica(s) y PV(s).
- La Matriz opera compras a proveedores de lámina y pintura.

### Metálicos Lyeva
- Mismo giro que EMFIMIFAR pero operación independiente.
- Puede comprar lámina a Láminas Monterrey (venta inter-empresa).

### Láminas Monterrey
- Vende y fabrica láminas.
- Sus clientes pueden ser externos y también las otras dos empresas del grupo.
- El precio inter-empresa es diferente al precio de lista pública.

---

**¡A construirlo!** ⚙️🔩

*GrupoMetalicoEMF ERP · v1.0.0 · junio 2026*
