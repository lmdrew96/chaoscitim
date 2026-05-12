// Offline fallback. The service worker serves this when a navigation
// request fails and there's no cached copy of the requested page.
// Reading texts you've already opened still work — they're cached by
// the SW on first successful navigation.
export default function OfflinePage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="mb-4 text-2xl font-bold">You&apos;re offline</h1>
      <p className="mb-4 text-foreground/80">
        ChaosCitim can&apos;t reach the network right now. Any text you&apos;ve
        opened before is still readable — go back and pick one from your
        library, or wait until you&apos;re reconnected.
      </p>
      <p className="text-sm text-foreground/60">
        Pages and assets are cached as you visit them. New texts and library
        updates will appear when you&apos;re online again.
      </p>
    </main>
  );
}
