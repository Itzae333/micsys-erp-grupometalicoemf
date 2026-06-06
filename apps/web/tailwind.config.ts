import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Rojo EMF — color primario del sistema
        brand: {
          50: '#FEF2F1',
          100: '#FDDDD9',
          200: '#FBBBB3',
          300: '#F7897D',
          400: '#F0584A',
          500: '#E74C3C',   // Rojo claro / hover
          600: '#C0392B',   // ★ PRIMARIO — Rojo EMF
          700: '#992D20',   // Rojo profundo
          800: '#7A2318',
          900: '#5C1A11',
        },
        // Acero — neutros industriales
        steel: {
          900: '#1C1C1C',   // negro industrial (sidebar bg)
          800: '#2C2C2C',   // superficies oscuras
          700: '#3D3D3D',   // bordes en modo oscuro
          600: '#5A5A58',   // texto muted en dark
          500: '#888880',   // texto secundario / iconos inactivos
          400: '#AAAAAA',   // placeholders
          300: '#CCCCCA',   // bordes default
          200: '#E0E0DE',   // bordes hover
          100: '#F2F2F0',   // background sección
          50:  '#F8F7F3',   // off-white industrial (surface principal)
        },
        // Semánticos operativos
        status: {
          paid:       '#065F46',  // verde — pagada / finalizada
          credit:     '#92400E',  // ámbar — a crédito / pendiente
          pending:    '#1E3A5F',  // azul oscuro — nota provisional
          alert:      '#C0392B',  // rojo — cancelada / alerta
          incomplete: '#6B21A8',  // morado — carga incompleta
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        'display-lg': ['28px', { lineHeight: '1.2', fontWeight: '700' }],
        'display-md': ['22px', { lineHeight: '1.25', fontWeight: '700' }],
        'display-sm': ['18px', { lineHeight: '1.3', fontWeight: '600' }],
        'body-lg':    ['16px', { lineHeight: '1.5', fontWeight: '400' }],
        'body':       ['14px', { lineHeight: '1.6', fontWeight: '400' }],
        'body-sm':    ['13px', { lineHeight: '1.5', fontWeight: '400' }],
        'table':      ['13px', { lineHeight: '1.4', fontWeight: '400' }],
        'table-header': ['11px', { lineHeight: '1.4', fontWeight: '600' }],
        'eyebrow':    ['11px', { lineHeight: '1.4', fontWeight: '600' }],
        'meta':       ['11px', { lineHeight: '1.4', fontWeight: '500' }],
        'mono':       ['13px', { lineHeight: '1.4', fontWeight: '400' }],
      },
    },
  },
  plugins: [],
};

export default config;
