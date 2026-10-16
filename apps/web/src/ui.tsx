import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { sfx } from './sfx.ts';
import { playerColor } from './colors.ts';

type Tone = 'a' | 'b' | 'c' | 'red' | 'z';

export function Button({
  tone = 'a',
  size,
  sound = 'click',
  className = '',
  onClick,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Tone; size?: 'sm' | 'lg'; sound?: keyof typeof sfx | null }) {
  return (
    <button
      type="button"
      className={`btn btn-${tone} ${size ? `btn-${size}` : ''} ${className}`}
      onClick={(e) => {
        if (sound) (sfx[sound] as () => void)();
        onClick?.(e);
      }}
      {...rest}
    />
  );
}

export function Panel({ title, children, className = '', accent }: { title?: ReactNode; children: ReactNode; className?: string; accent?: Tone }) {
  return (
    <section className={`panel ${accent ? `panel-${accent}` : ''} ${className}`}>
      {title && <h2 className="panel-title">{title}</h2>}
      {children}
    </section>
  );
}

export function Stepper({
  label,
  value,
  min,
  max,
  onChange,
  disabled,
  hint,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <div className="stepper">
      <div className="stepper-label">
        {label}
        {hint && <small>{hint}</small>}
      </div>
      <div className="stepper-controls">
        <Button tone="c" size="sm" sound="back" aria-label={`Fewer ${label}`} disabled={disabled || value <= min} onClick={() => onChange(value - 1)}>
          −
        </Button>
        <span className="stepper-value">{value}</span>
        <Button tone="c" size="sm" sound="select" aria-label={`More ${label}`} disabled={disabled || value >= max} onClick={() => onChange(value + 1)}>
          +
        </Button>
      </div>
    </div>
  );
}

export function Avatar({ name, color, size = 'md', dead }: { name: string; color: number; size?: 'sm' | 'md' | 'lg'; dead?: boolean }) {
  return (
    <span className={`avatar avatar-${size} ${dead ? 'avatar-dead' : ''}`} style={{ ['--c' as string]: playerColor(color) }}>
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

/** Chunky extruded title text, one bouncing letter at a time. */
export function ChunkyText({ text, className = '' }: { text: string; className?: string }) {
  return (
    <span className={`chunky ${className}`} aria-label={text}>
      {[...text].map((ch, i) => (
        <span key={i} aria-hidden style={{ ['--i' as string]: i }}>
          {ch === ' ' ? ' ' : ch}
        </span>
      ))}
    </span>
  );
}
