'use client';

import { useState, useEffect } from 'react';
import { Printer, CheckCircle2, XCircle, RefreshCw, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const LS_KEY = 'print_bridge_config';

interface PrintConfig {
  transport: 'network' | 'windows-port' | 'windows-printer';
  network_ip: string;
  network_port: number;
  windows_port: string;
  printer_name: string;
  copias: number;
}

const DEFAULT_CONFIG: PrintConfig = {
  transport: 'network',
  network_ip: '192.168.1.100',
  network_port: 9100,
  windows_port: 'COM3',
  printer_name: 'Ticketera',
  copias: 2,
};

function loadConfig(): PrintConfig {
  if (typeof window === 'undefined') return DEFAULT_CONFIG;
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? { ...DEFAULT_CONFIG, ...JSON.parse(raw) } : { ...DEFAULT_CONFIG };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export default function TicketeraConfigPage() {
  const [cfg, setCfg] = useState<PrintConfig>(DEFAULT_CONFIG);
  const [saved, setSaved] = useState(false);
  const [pingStatus, setPingStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [pingMsg, setPingMsg] = useState('');

  useEffect(() => {
    setCfg(loadConfig());
  }, []);

  function save() {
    localStorage.setItem(LS_KEY, JSON.stringify(cfg));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function ping() {
    setPingStatus('loading');
    setPingMsg('');
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const res = await fetch('http://localhost:7788/ping', { signal: controller.signal });
      clearTimeout(timer);
      if (res.ok) {
        const data = await res.json() as { status: string; transport: string; version: string };
        setPingStatus('ok');
        setPingMsg(`Conectado · ${data.transport} · v${data.version}`);
      } else {
        setPingStatus('error');
        setPingMsg('Respuesta inesperada del servicio');
      }
    } catch {
      setPingStatus('error');
      setPingMsg('No se pudo conectar — verifica que el servicio PrintBridge esté corriendo');
    }
  }

  const set = <K extends keyof PrintConfig>(key: K, val: PrintConfig[K]) =>
    setCfg((prev) => ({ ...prev, [key]: val }));

  return (
    <div className="p-8 max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-brand-100 flex items-center justify-center">
          <Printer className="h-5 w-5 text-brand-600" />
        </div>
        <div>
          <h1 className="text-display-sm font-bold text-steel-900">Configuración de Ticketera</h1>
          <p className="text-body-sm text-steel-500">Ajustes del servicio PrintBridge (solo este equipo)</p>
        </div>
      </div>

      {/* Estado de conexión */}
      <div className="bg-white border border-steel-200 rounded-xl p-5 space-y-4">
        <h2 className="text-body font-semibold text-steel-800">Probar conexión</h2>
        <p className="text-body-sm text-steel-500">
          El servicio PrintBridge debe estar corriendo en este equipo en <code className="font-mono text-brand-700">localhost:7788</code>.
        </p>
        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            onClick={() => void ping()}
            disabled={pingStatus === 'loading'}
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${pingStatus === 'loading' ? 'animate-spin' : ''}`} />
            Probar conexión
          </Button>
          {pingStatus === 'ok' && (
            <span className="flex items-center gap-1.5 text-body-sm text-green-700 font-medium">
              <CheckCircle2 className="h-4 w-4" /> {pingMsg}
            </span>
          )}
          {pingStatus === 'error' && (
            <span className="flex items-center gap-1.5 text-body-sm text-red-600">
              <XCircle className="h-4 w-4" /> {pingMsg}
            </span>
          )}
        </div>
      </div>

      {/* Transporte */}
      <div className="bg-white border border-steel-200 rounded-xl p-5 space-y-4">
        <h2 className="text-body font-semibold text-steel-800">Tipo de conexión</h2>
        <div className="grid grid-cols-3 gap-3">
          {([
            { val: 'network',         label: 'Red (TCP)',       sub: 'IP + puerto 9100' },
            { val: 'windows-port',    label: 'Puerto Windows',  sub: 'COM3, USB001…' },
            { val: 'windows-printer', label: 'Cola Windows',    sub: 'Por nombre' },
          ] as const).map((opt) => (
            <button
              key={opt.val}
              type="button"
              onClick={() => set('transport', opt.val)}
              className={`border rounded-xl p-3 text-left transition-colors ${
                cfg.transport === opt.val
                  ? 'border-brand-500 bg-brand-50'
                  : 'border-steel-200 hover:border-steel-300'
              }`}
            >
              <p className={`text-body-sm font-medium ${cfg.transport === opt.val ? 'text-brand-700' : 'text-steel-800'}`}>
                {opt.label}
              </p>
              <p className="text-meta text-steel-400">{opt.sub}</p>
            </button>
          ))}
        </div>

        {/* Network fields */}
        {cfg.transport === 'network' && (
          <div className="grid grid-cols-2 gap-4 pt-2">
            <div>
              <label className="block text-body-sm font-medium text-steel-700 mb-1.5">IP de la impresora</label>
              <Input
                value={cfg.network_ip}
                onChange={(e) => set('network_ip', e.target.value)}
                placeholder="192.168.1.100"
              />
            </div>
            <div>
              <label className="block text-body-sm font-medium text-steel-700 mb-1.5">Puerto</label>
              <Input
                type="number"
                value={cfg.network_port}
                onChange={(e) => set('network_port', Number(e.target.value))}
                placeholder="9100"
              />
            </div>
          </div>
        )}

        {/* Windows port field */}
        {cfg.transport === 'windows-port' && (
          <div className="pt-2">
            <label className="block text-body-sm font-medium text-steel-700 mb-1.5">Puerto (COM3, USB001, LPT1…)</label>
            <Input
              value={cfg.windows_port}
              onChange={(e) => set('windows_port', e.target.value)}
              placeholder="COM3"
              className="max-w-xs"
            />
          </div>
        )}

        {/* Windows printer name */}
        {cfg.transport === 'windows-printer' && (
          <div className="pt-2">
            <label className="block text-body-sm font-medium text-steel-700 mb-1.5">Nombre de impresora (Windows)</label>
            <Input
              value={cfg.printer_name}
              onChange={(e) => set('printer_name', e.target.value)}
              placeholder="Ticketera"
              className="max-w-xs"
            />
          </div>
        )}
      </div>

      {/* Copias */}
      <div className="bg-white border border-steel-200 rounded-xl p-5 space-y-4">
        <h2 className="text-body font-semibold text-steel-800">Copias por defecto al cobrar</h2>
        <p className="text-body-sm text-steel-500">Número de tickets que se imprimen automáticamente cuando se cierra una nota.</p>
        <div className="flex gap-3">
          {[1, 2, 3].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => set('copias', n)}
              className={`w-12 h-12 rounded-xl border text-body font-bold transition-colors ${
                cfg.copias === n
                  ? 'border-brand-500 bg-brand-50 text-brand-700'
                  : 'border-steel-200 text-steel-600 hover:border-steel-300'
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      {/* Nota */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
        <p className="text-body-sm text-amber-800">
          Esta configuración se guarda en el navegador de este equipo. Cada computadora puede tener su propia configuración de ticketera.
          Para cambiar la IP/puerto en el servicio PrintBridge, edita <code className="font-mono">printer.config.json</code> junto al ejecutable.
        </p>
      </div>

      {/* Guardar */}
      <div className="flex items-center gap-3">
        <Button onClick={save}>
          <Save className="h-3.5 w-3.5 mr-1.5" />
          Guardar configuración
        </Button>
        {saved && (
          <span className="flex items-center gap-1.5 text-body-sm text-green-700 font-medium">
            <CheckCircle2 className="h-4 w-4" /> Guardado
          </span>
        )}
      </div>
    </div>
  );
}
