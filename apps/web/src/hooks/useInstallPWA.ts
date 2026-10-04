'use client';

import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface InstallPWA {
  canInstall: boolean;
  install: () => Promise<void>;
  isInstalled: boolean;
  // iPhone/iPad no disparan `beforeinstallprompt`: se instala a mano desde
  // Safari (Compartir → Agregar a inicio), así que hay que guiar al usuario.
  isIOS: boolean;
  isIOSSafari: boolean;
}

function detectIOS(): { isIOS: boolean; isIOSSafari: boolean } {
  if (typeof navigator === 'undefined') return { isIOS: false, isIOSSafari: false };
  const ua = navigator.userAgent;
  // iPadOS 13+ se presenta como "Macintosh": se distingue por la pantalla táctil.
  const isIOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  // Chrome/Firefox/Edge/Opera en iOS (y los navegadores dentro de otras apps,
  // como WhatsApp o Facebook) no pueden instalar: solo Safari.
  const otroNavegador = /CriOS|FxiOS|EdgiOS|OPiOS|FBAN|FBAV|Instagram|Line\/|MicroMessenger/.test(ua);
  return { isIOS, isIOSSafari: isIOS && !otroNavegador };
}

export function useInstallPWA(): InstallPWA {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [ios, setIos] = useState({ isIOS: false, isIOSSafari: false });

  useEffect(() => {
    // Detecta si ya está instalada como app standalone
    // En iOS Safari el indicador es `navigator.standalone`.
    if (window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone) {
      setIsInstalled(true);
    }
    setIos(detectIOS());

    function handleBeforeInstall(e: Event) {
      e.preventDefault();
      setPrompt(e as BeforeInstallPromptEvent);
    }

    function handleInstalled() {
      setIsInstalled(true);
      setPrompt(null);
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  async function install(): Promise<void> {
    if (!prompt) return;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
    }
    setPrompt(null);
  }

  return {
    canInstall: !!prompt && !isInstalled,
    install,
    isInstalled,
    isIOS: ios.isIOS,
    isIOSSafari: ios.isIOSSafari,
  };
}
