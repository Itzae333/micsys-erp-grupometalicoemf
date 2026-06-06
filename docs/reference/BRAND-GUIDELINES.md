# GrupoMetalicoEMF — Brand Guidelines

> Reglas duras de marca para el sistema y las tres empresas del grupo.  
> Leer antes de tocar cualquier logo, color o nombre en la UI.

---

## 1. Jerarquía de marca

```
GrupoMetalicoEMF          ← marca del sistema (el ERP)
├── EMFIMIFAR             ← empresa 1 (tiene su propio logo)
├── Metálicos Lyeva       ← empresa 2 (tiene su propio logo)
└── Láminas Monterrey     ← empresa 3 (tiene su propio logo)
```

El logo de **GrupoMetalicoEMF** aparece en:
- Pantalla de login (centrado, variant `vertical`)
- Sidebar cuando el usuario es **Super Usuario** (no tiene empresa asignada)
- Pantalla de configuración global

El logo de **cada empresa** aparece en:
- Sidebar cuando el usuario tiene empresa asignada (`variant="isotipo"` + nombre)
- Tickets térmicos (en B/N, `variant="isotipo-mono"`)
- PDFs de cotización (en color, `variant="horizontal"`)
- Pantalla de configuración de esa empresa

**Nunca mezclar logos.** Un usuario de EMFIMIFAR no debe ver el logo de Metálicos Lyeva en ningún momento.

---

## 2. El nombre — reglas absolutas

### GrupoMetalicoEMF (el sistema)

| Contexto | Escritura correcta |
|----------|-------------------|
| Nombre del sistema en código | `GrupoMetalicoEMF` |
| Nombre del sistema en UI | `GrupoMetalicoEMF` |
| Wordmark visual | `Metálico` + `EMF` (EMF en rojo) |
| Dominio | `grupometálicoemf.com` (con tilde, si aplica) |

❌ **Nunca:**
- `Grupo Metalico EMF` (con espacios en el nombre del sistema)
- `grupometálicoemf` (minúsculas)
- `GRUPOMETALICOEMF` (todo mayúsculas)
- `GME` o `GEMF` (siglas sueltas)
- `Grupo Metálico` (sin EMF)

### Las tres empresas

| Empresa | Escritura correcta | ❌ Nunca |
|---------|-------------------|----------|
| EMFIMIFAR | `EMFIMIFAR` (todo mayúsculas) | `Emfimifar`, `emfimifar`, `EMFimifar` |
| Metálicos Lyeva | `Metálicos Lyeva` (con tilde, Lyeva con mayúscula) | `Metalicos Lyeva`, `METÁLICOS LYEVA`, `Metalicos lyeva` |
| Láminas Monterrey | `Láminas Monterrey` (con tilde, ambas con mayúscula) | `Laminas Monterrey`, `LÁMINAS MONTERREY`, `Láminas monterrey` |

---

## 3. Paleta de marca — valores exactos

### GrupoMetalicoEMF

| Nombre | Hex | Uso |
|--------|-----|-----|
| Rojo EMF | `#C0392B` | Color primario. Botones, acento EMF en wordmark, sidebar active, badges |
| Rojo claro | `#E74C3C` | Hover states, variante clara del rojo |
| Rojo profundo | `#922B21` | Cara lateral del isotipo, pressed states |
| Acero negro | `#1C1C1C` | Sidebar background |
| Acero oscuro | `#2C2C2C` | Superficies oscuras secundarias |
| Acero medio | `#888880` | Texto secundario, iconos inactivos |
| Acero claro | `#DDDDD8` | Cara superior del isotipo (lámina fría) |
| Blanco industrial | `#F8F7F3` | Background principal de la app |

### Empresas — color de acento individual

Cada empresa puede tener un color de acento diferente en su logo propio. Sin embargo, dentro del sistema ERP usan la paleta de **GrupoMetalicoEMF** (Rojo EMF + Acero). Los logos de empresa solo muestran su color propio en:
- Pantalla de login (si el dominio está configurado por empresa)
- PDFs de cotización
- Tickets

| Empresa | Color propio sugerido | Uso en el sistema |
|---------|----------------------|-------------------|
| EMFIMIFAR | `#C0392B` (Rojo EMF, comparte con el grupo) | Usa paleta del grupo |
| Metálicos Lyeva | `#1A5276` (Azul acero) | Usa paleta del grupo |
| Láminas Monterrey | `#1E8449` (Verde lámina) | Usa paleta del grupo |

> **Nota:** dentro de la app (sidebar, botones, navegación) todas las empresas usan la misma paleta de GrupoMetalicoEMF. Los colores propios de empresa solo aparecen en los documentos que salen del sistema (tickets, PDFs, cotizaciones).

---

## 4. El isotipo — descripción para reproducción

El isotipo de GrupoMetalicoEMF representa **láminas metálicas apiladas en perspectiva isométrica**. Tres planos visibles:

```
Composición:
- Cara frontal derecha  → Rojo EMF (#C0392B)
- Cara frontal izquierda → Rojo profundo (#922B21)
- Cara superior         → Rojo claro (#E74C3C)
- Segunda lámina (arriba, desplazada) → Acero claro (#DDDDD8), opacidad 0.7
```

En **modo monocromático** (tickets térmicos B/N):
- Cara frontal derecha  → Negro (#1C1C1C)
- Cara frontal izquierda → Gris oscuro (#555)
- Cara superior         → Gris medio (#888)
- Segunda lámina        → Gris claro (#CCC)

En **modo blanco** (sobre fondo oscuro, sidebar):
- Cara frontal derecha  → Blanco (#FFFFFF)
- Cara frontal izquierda → Blanco 80% (rgba(255,255,255,0.8))
- Cara superior         → Blanco 60%
- Segunda lámina        → Blanco 40%

---

## 5. Tamaños mínimos y espaciado

### Tamaños mínimos del isotipo

| Contexto | Tamaño mínimo |
|----------|--------------|
| Favicon (browser tab) | 16×16px |
| App icon (PWA, móvil) | 48×48px |
| Sidebar (colapsado) | 24×24px |
| Sidebar (expandido, junto al nombre) | 26×26px |
| Login / onboarding | 48×48px |
| PDF / cotización | 32×32px |
| Ticket térmico | 28×28px |

**Nunca** usar el isotipo por debajo de 16px — pierde legibilidad.

### Espacio de protección

Alrededor del logo siempre debe existir un espacio libre equivalente a **0.5× el ancho del isotipo**.

```
Ej: isotipo de 26px → espacio mínimo de 13px en todos lados
```

---

## 6. Variantes del componente Logo

El componente `<Logo>` exportado en `apps/web/components/brand/Logo.tsx` soporta estas variantes:

```typescript
type LogoVariant = 
  | 'horizontal'      // isotipo + wordmark horizontal → login, onboarding, PDFs
  | 'vertical'        // isotipo + wordmark apilado → splash, pantalla de login
  | 'isotipo'         // solo el isotipo en color → sidebar expandido
  | 'isotipo-mono'    // solo el isotipo en B/N → tickets térmicos
  | 'isotipo-blanco'  // solo el isotipo en blanco → sidebar (fondo oscuro)
  | 'wordmark'        // solo el texto Metálico + EMF, sin isotipo → espacio reducido

type EmpresaSlug =
  | 'grupo'             // GrupoMetalicoEMF
  | 'emfimifar'         // EMFIMIFAR
  | 'metalicos-lyeva'   // Metálicos Lyeva
  | 'laminas-monterrey' // Láminas Monterrey
```

### Uso correcto por contexto

```tsx
// Sidebar (fondo oscuro, empresa asignada)
<Logo variant="isotipo-blanco" empresa="emfimifar" size={26} />

// Sidebar Super Usuario (sin empresa)
<Logo variant="isotipo-blanco" empresa="grupo" size={26} />

// Pantalla de login
<Logo variant="vertical" empresa="grupo" size={48} />

// Ticket térmico (impresión B/N)
<Logo variant="isotipo-mono" empresa="emfimifar" size={28} />

// PDF de cotización (color, con nombre)
<Logo variant="horizontal" empresa="emfimifar" size={32} />

// Favicon (generado en build time, no usa el componente React)
// → /public/brand/grupo/favicon.svg
```

---

## 7. Archivos de assets

Todos los SVGs deben estar en `apps/web/public/brand/`:

```
public/brand/
├── grupo/
│   ├── logo-horizontal.svg       ← isotipo + wordmark horizontal
│   ├── logo-vertical.svg         ← isotipo + wordmark apilado
│   ├── isotipo-color.svg         ← solo isotipo, color completo
│   ├── isotipo-mono.svg          ← solo isotipo, B/N
│   ├── isotipo-blanco.svg        ← solo isotipo, blanco (para dark bg)
│   └── favicon.svg               ← también copia en /public/favicon.svg
│
├── emfimifar/
│   ├── logo.svg                  ← logo principal de EMFIMIFAR
│   ├── isotipo.svg               ← solo isotipo de EMFIMIFAR
│   └── logo-mono.svg             ← para tickets
│
├── metalicos-lyeva/
│   ├── logo.svg
│   ├── isotipo.svg
│   └── logo-mono.svg
│
└── laminas-monterrey/
    ├── logo.svg
    ├── isotipo.svg
    └── logo-mono.svg
```

> **Nota:** los logos de las 3 empresas (`emfimifar/`, `metalicos-lyeva/`, `laminas-monterrey/`) los sube el Admin de cada empresa desde la pantalla de configuración. Los archivos en `/public/brand/grupo/` son los únicos que vienen en el repositorio por default.

---

## 8. El wordmark en código — regla única

```tsx
// ✅ SIEMPRE así — "EMF" en brand-600, "Metálico" en neutro
<span className="font-bold tracking-tight text-steel-900">
  Metálico<span className="text-brand-600">EMF</span>
</span>

// En sidebar (fondo oscuro)
<span className="font-bold tracking-tight text-white">
  Metálico<span className="text-brand-400">EMF</span>
</span>

// "GRUPO" encima, siempre en light/muted con tracking
<span className="font-light text-steel-500 text-[11px] tracking-[2px] uppercase">
  GRUPO
</span>
```

---

## 9. Lo que nunca debes hacer

### Con el nombre
- ❌ Escribir "Grupo Metalico EMF" con espacios (es `GrupoMetalicoEMF`)
- ❌ Añadir sufijos legales al nombre del sistema ("GrupoMetalicoEMF S.A." — el nombre legal va solo en los datos fiscales de la ubicación)
- ❌ Abreviarlo como "GME", "GEMF" o "El sistema"
- ❌ Usar emojis junto al nombre en la UI operativa

### Con el color
- ❌ Usar `red-600` de Tailwind en lugar de `brand-600` — no es el mismo rojo
- ❌ Usar el hex `#C0392B` hardcodeado en componentes — usar siempre `brand-600`
- ❌ Poner el isotipo en color sobre fondo rojo — usar `isotipo-blanco` sobre fondos oscuros/rojos
- ❌ Usar el rojo para cualquier cosa que no sea acción primaria, error crítico o marca

### Con el isotipo
- ❌ Distorsionar las proporciones del isotipo (no estirar horizontalmente)
- ❌ Rotar el isotipo
- ❌ Añadir sombras o efectos al isotipo
- ❌ Recrear el isotipo con emojis (🔴⬛)
- ❌ Usar una versión antigua del isotipo — siempre del archivo SVG fuente

### Con los logos de empresas
- ❌ Mostrar el logo de EMFIMIFAR a un usuario de Metálicos Lyeva
- ❌ Escalar el logo de empresa debajo de su tamaño mínimo
- ❌ Mostrar logos de empresa sin el contexto correcto de empresa/ubicación cargado

---

## 10. Checklist antes de hacer commit con cambios de marca

```
[ ] El nombre del sistema aparece como "GrupoMetalicoEMF" (sin espacios intermedios)
[ ] "EMF" siempre en brand-600 cuando aparece en el wordmark
[ ] El componente <Logo> se usa con la variant y empresa correcta para ese contexto
[ ] El sidebar oscuro usa isotipo-blanco, no el isotipo en color
[ ] Los tickets usan isotipo-mono (B/N)
[ ] Los PDFs usan la variant horizontal con el logo de la empresa correcta
[ ] No hay hex #C0392B hardcodeado — solo brand-600
[ ] Los logos de empresa solo se muestran al usuario de esa empresa
[ ] Los archivos SVG fuente están en /public/brand/ correctamente estructurados
```

---

*GrupoMetalicoEMF ERP · Brand Guidelines v1.0.0 · junio 2026*
