'use client';

import { useEffect, useState } from 'react';

/**
 * Registers the service worker on mount and exposes a small "install"
 * affordance when the browser fires beforeinstallprompt. Touch-only
 * platforms (iOS Safari) don't fire that event and instead expose
 * "Add to Home Screen" in the share sheet — nothing to do here for them.
 *
 * Disabled in dev to avoid HMR conflicts. Re-enable manually for
 * testing by setting NEXT_PUBLIC_SW_DEV=1.
 */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function SwRegister() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;

    const devEnabled = process.env.NEXT_PUBLIC_SW_DEV === '1';
    const isProduction = process.env.NODE_ENV === 'production';
    if (!isProduction && !devEnabled) return;

    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.error('[sw] registration failed:', err);
    });

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
    };
  }, []);

  if (!installPrompt || dismissed) return null;

  return (
    <div
      role="dialog"
      aria-label="Install ChaosCitim"
      className="fixed bottom-4 left-1/2 z-50 flex w-[min(92vw,28rem)] -translate-x-1/2 items-center gap-3 rounded-lg bg-foreground px-4 py-3 text-sm text-background shadow-lg"
    >
      <span className="flex-1">
        Install ChaosCitim for offline reading.
      </span>
      <button
        type="button"
        onClick={async () => {
          await installPrompt.prompt();
          await installPrompt.userChoice;
          setInstallPrompt(null);
        }}
        className="rounded bg-accent px-3 py-1 font-medium hover:opacity-90"
      >
        Install
      </button>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="text-background/70 hover:text-background"
        aria-label="Dismiss install prompt"
      >
        ✕
      </button>
    </div>
  );
}
