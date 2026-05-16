'use client';

import { useEffect, useRef, useState } from 'react';
import { Settings } from 'lucide-react';

export interface ReaderSettings {
  fontSize: 'sm' | 'md' | 'lg';
  font: 'serif' | 'sans';
  width: 'narrow' | 'md' | 'wide';
  theme: 'system' | 'light' | 'dark';
}

const DEFAULTS: ReaderSettings = {
  fontSize: 'md',
  font: 'serif',
  width: 'md',
  theme: 'system',
};

const STORAGE_KEY = 'chaoscitim:reader-settings';

export const FONT_SIZE_MAP: Record<ReaderSettings['fontSize'], string> = {
  sm: '1rem',
  md: '1.15rem',
  lg: '1.35rem',
};

export const WIDTH_CLASS_MAP: Record<ReaderSettings['width'], string> = {
  narrow: 'max-w-xl',
  md: 'max-w-2xl',
  wide: 'max-w-4xl',
};

export const FONT_FAMILY_MAP: Record<ReaderSettings['font'], string> = {
  serif: 'var(--font-fraunces, Fraunces, Georgia, serif)',
  sans: 'var(--font-space-grotesk, "Space Grotesk", system-ui, sans-serif)',
};

function applyTheme(theme: ReaderSettings['theme']) {
  const root = document.documentElement;
  if (theme === 'system') {
    root.removeAttribute('data-theme');
  } else {
    root.setAttribute('data-theme', theme);
  }
}

export function useReaderSettings() {
  const [settings, setSettings] = useState<ReaderSettings>(DEFAULTS);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<ReaderSettings>;
        setSettings({ ...DEFAULTS, ...parsed });
        if (parsed.theme) applyTheme(parsed.theme);
      }
    } catch {
      // corrupt localStorage — use defaults
    }
    setMounted(true);
  }, []);

  const update = <K extends keyof ReaderSettings>(key: K, value: ReaderSettings[K]) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch { /* storage full */ }
      if (key === 'theme') applyTheme(value as ReaderSettings['theme']);
      return next;
    });
  };

  return { settings, update, mounted };
}

// ── Settings panel UI ───────────────────────────────────────────────────────

function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs opacity-60">{label}</span>
      <div className="flex rounded-md border border-foreground/10 overflow-hidden">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`px-2.5 py-1 text-xs transition-colors ${
              value === opt.value
                ? 'bg-accent text-white'
                : 'hover:bg-foreground/[0.06]'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ReaderSettingsButton({
  settings,
  update,
}: {
  settings: ReaderSettings;
  update: <K extends keyof ReaderSettings>(key: K, value: ReaderSettings[K]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Reader settings"
        className={`rounded-full p-1.5 transition-colors ${
          open
            ? 'bg-foreground/10 text-foreground'
            : 'text-foreground/40 hover:bg-foreground/[0.06] hover:text-foreground/70'
        }`}
      >
        <Settings size={14} />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-20 mt-2 w-56 rounded-xl border border-foreground/10 bg-background p-3 shadow-lg flex flex-col gap-3">
          <SegmentedControl
            label="Size"
            value={settings.fontSize}
            onChange={(v) => update('fontSize', v)}
            options={[
              { value: 'sm', label: 'S' },
              { value: 'md', label: 'M' },
              { value: 'lg', label: 'L' },
            ]}
          />
          <SegmentedControl
            label="Font"
            value={settings.font}
            onChange={(v) => update('font', v)}
            options={[
              { value: 'serif', label: 'Serif' },
              { value: 'sans', label: 'Sans' },
            ]}
          />
          <SegmentedControl
            label="Width"
            value={settings.width}
            onChange={(v) => update('width', v)}
            options={[
              { value: 'narrow', label: 'S' },
              { value: 'md', label: 'M' },
              { value: 'wide', label: 'W' },
            ]}
          />
          <SegmentedControl
            label="Theme"
            value={settings.theme}
            onChange={(v) => update('theme', v)}
            options={[
              { value: 'system', label: 'Auto' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ]}
          />
        </div>
      )}
    </div>
  );
}
