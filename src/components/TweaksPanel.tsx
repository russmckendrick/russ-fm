import { useEffect, useState } from 'react';
import { X, SlidersHorizontal, RotateCcw } from 'lucide-react';
import { useTweaks, TweaksState } from '@/hooks/useTweaks';
import { cn } from '@/lib/utils';

/**
 * Dev-only tweaks panel. Hidden in the UI — opened with
 * `Cmd+Shift+D` (mac) or `Ctrl+Shift+D` (others). Public site ships
 * with the `redesignConfig` defaults locked in; this panel only
 * exists so the author can tune things in place.
 */
export function TweaksPanel() {
  const [open, setOpen] = useState(false);
  const { state, update, reset, defaults } = useTweaks();

  // Keyboard shortcut: Cmd/Ctrl + Shift + D
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.shiftKey && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === 'Escape' && open) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open) return null;

  const isDirty =
    state.density !== defaults.density ||
    state.monoLabels !== defaults.monoLabels ||
    state.coverColor !== defaults.coverColor ||
    Math.abs(state.tintStrength - defaults.tintStrength) > 0.001;

  return (
    <div
      role="dialog"
      aria-label="Tweaks panel"
      className="fixed bottom-5 right-5 z-[100] w-[320px] border border-rule-strong bg-paper font-grot text-ink shadow-[0_30px_60px_-20px_rgba(14,13,11,0.35)]"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-rule-strong bg-paper-2/60 px-4 py-2.5">
        <div className="flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-dim">
          <SlidersHorizontal className="h-3.5 w-3.5" />
          <span>Tweaks · Dev</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={reset}
            disabled={!isDirty}
            aria-label="Reset"
            className={cn(
              "flex h-7 w-7 items-center justify-center border border-rule transition-colors",
              isDirty ? "text-ink hover:bg-paper-2" : "text-ink-dim/40"
            )}
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close tweaks"
            className="flex h-7 w-7 items-center justify-center border border-rule text-ink transition-colors hover:bg-paper-2"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-4 px-4 py-4">
        <SegControl
          label="Density"
          value={state.density}
          options={[
            { value: 'sparse', label: 'Sparse' },
            { value: 'medium', label: 'Medium' },
            { value: 'dense', label: 'Dense' },
          ]}
          onChange={(v) => update({ density: v as TweaksState['density'] })}
        />

        <Toggle
          label="Mono labels"
          checked={state.monoLabels}
          onChange={(v) => update({ monoLabels: v })}
        />

        <Toggle
          label="Cover colour"
          checked={state.coverColor}
          onChange={(v) => update({ coverColor: v })}
        />

        <Slider
          label="Tint intensity"
          value={state.tintStrength}
          onChange={(v) => update({ tintStrength: v })}
        />
      </div>

      <div className="border-t border-rule px-4 py-2 text-center font-mono text-[10px] uppercase tracking-[0.08em] text-ink-dim">
        <kbd className="border border-rule-strong bg-paper-2 px-1.5 py-0.5">⌘/⌃</kbd>
        <span className="mx-1">+</span>
        <kbd className="border border-rule-strong bg-paper-2 px-1.5 py-0.5">⇧</kbd>
        <span className="mx-1">+</span>
        <kbd className="border border-rule-strong bg-paper-2 px-1.5 py-0.5">D</kbd>
        <span className="ml-2">toggles</span>
      </div>
    </div>
  );
}

function SegControl({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <div className="mb-2 font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-dim">
        {label}
      </div>
      <div className="flex border border-rule-strong">
        {options.map((opt) => {
          const active = opt.value === value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              className={cn(
                "flex-1 border-r border-rule py-1.5 font-mono text-[11px] uppercase tracking-[0.06em] transition-colors last:border-r-0",
                active ? "bg-ink text-paper" : "text-ink hover:bg-paper-2"
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-dim">
      <span>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-5 w-9 border border-rule-strong transition-colors",
          checked ? "bg-ink" : "bg-paper"
        )}
      >
        <span
          className={cn(
            "absolute top-[1px] h-[15px] w-[15px] bg-paper transition-[left]",
            checked ? "left-[19px] bg-paper" : "left-[1px] bg-ink"
          )}
        />
      </button>
    </label>
  );
}

function Slider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-dim">
        <span>{label}</span>
        <span className="tabular-nums">{value.toFixed(2)}</span>
      </div>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none bg-paper-2 accent-ink"
        aria-label={label}
      />
    </div>
  );
}
