import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { ServiceWorkerProvider } from '@/components/pwa/ServiceWorkerProvider';
import { InstallPWABanner } from '@/components/pwa/InstallPWABanner';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: {
    template: '%s · GrupoMetalicoEMF',
    default: 'GrupoMetalicoEMF — Sistema de Gestión Industrial',
  },
  description: 'ERP industrial multi-empresa para el Grupo Metálico EMF',
  manifest: '/manifest.json',
  icons: {
    icon: '/brand/grupo/favicon.svg',
    apple: '/brand/grupo/isotipo-color.svg',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#C0392B',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={inter.variable}>
      <body>
        <ServiceWorkerProvider>
          {children}
          <InstallPWABanner />
        </ServiceWorkerProvider>
      </body>
    </html>
  );
}
