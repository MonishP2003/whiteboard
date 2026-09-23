import { useEffect, useRef, useState, type ReactNode } from "react";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

/** A field whose selected shapes disagree. */
export const MIXED = Symbol("mixed");
export type Maybe<T> = T | typeof MIXED;

/** `get` of every item if they all agree, otherwise MIXED. */
export function common<S, T>(items: S[], get: (item: S) => T): Maybe<T> {
  const first = get(items[0]!);
  return items.every((item) => Object.is(get(item), first)) ? first : MIXED;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function FieldRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2 border-b px-3 py-3 last:border-b-0">
      <h3 className="text-xs font-semibold tracking-wide uppercase">{title}</h3>
      {children}
    </section>
  );
}

interface NumberFieldProps {
  label: string;
  value: Maybe<number>;
  onCommit: (value: number) => void;
  min?: number;
  max?: number;
  className?: string;
}

/**
 * Number input that commits once, on blur or Enter, so typing "120" is one scene change
 * rather than three. Escape abandons the edit.
 */
export function NumberField({ label, value, onCommit, min, max, className }: NumberFieldProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const cancelled = useRef(false);
  const shown = draft ?? (value === MIXED ? "" : String(round2(value)));

  const commit = () => {
    if (draft === null) return;
    setDraft(null);
    if (cancelled.current) return;
    const n = Number(draft);
    if (draft.trim() === "" || !Number.isFinite(n)) return;
    const clamped = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n));
    if (value === MIXED || clamped !== round2(value)) onCommit(clamped);
  };

  return (
    <label className={cn("flex h-8 items-center gap-1 rounded-md border px-2", className)}>
      <span className="w-3 shrink-0 text-xs text-muted-foreground">{label}</span>
      <input
        type="text"
        inputMode="decimal"
        aria-label={label}
        className="w-full min-w-0 bg-transparent text-right text-xs tabular-nums outline-none placeholder:text-muted-foreground"
        placeholder={value === MIXED ? "Mixed" : undefined}
        value={shown}
        onFocus={(e) => {
          cancelled.current = false;
          setDraft(shown);
          e.target.select();
        }}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            cancelled.current = true;
            e.currentTarget.blur();
          }
        }}
      />
    </label>
  );
}

interface SliderFieldProps {
  label: string;
  value: Maybe<number>;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
  /** Every change while dragging: draw it, but don't store it. */
  onPreview: (value: number) => void;
  /** Once, on release (or per key press): store it. */
  onCommit: (value: number) => void;
  /** Drops the preview if the slider goes away mid-drag. */
  onCancel: () => void;
}

export function SliderField(props: SliderFieldProps) {
  const { label, value, min, max, step, format, onPreview, onCommit, onCancel } = props;
  const [live, setLive] = useState<number | null>(null);
  const shown = live ?? (value === MIXED ? null : value);

  const liveRef = useRef(live);
  liveRef.current = live;
  const cancelRef = useRef(onCancel);
  cancelRef.current = onCancel;
  useEffect(() => () => void (liveRef.current !== null && cancelRef.current()), []);

  return (
    <div className="space-y-1.5">
      <FieldRow label={label}>
        <span className="text-xs tabular-nums">{shown === null ? "Mixed" : format(shown)}</span>
      </FieldRow>
      <Slider
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={[shown ?? min]}
        onValueChange={([v]) => {
          if (v === undefined) return;
          setLive(v);
          onPreview(v);
        }}
        onValueCommit={([v]) => {
          setLive(null);
          if (v !== undefined) onCommit(v);
        }}
      />
    </div>
  );
}
