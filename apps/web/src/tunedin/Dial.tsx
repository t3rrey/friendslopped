import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { BANDS, type Spectrum } from '@friendslopped/tunedin';

const R = 200;
const SEND_EVERY_MS = 60;

export interface Needle {
  id: string;
  value: number;
  color: string;
  label: string;
  mine?: boolean;
}

/** Dial value (0 = left, 100 = right) → point on the semicircle. */
function point(value: number, radius = R) {
  const theta = Math.PI * (1 - value / 100);
  return { x: radius * Math.cos(theta), y: -radius * Math.sin(theta) };
}

function wedge(from: number, to: number) {
  const a = point(from);
  const b = point(to);
  return `M0,0 L${a.x},${a.y} A${R},${R} 0 0 1 ${b.x},${b.y} Z`;
}

const BAND_COLORS: Record<number, string> = { 2: '#ffc20e', 3: '#00a651', 4: '#e4202e' };

export function Dial({
  spectrum,
  target,
  needles,
  editable,
  onChange,
  bandsKey,
}: {
  spectrum: Spectrum;
  target: number | null;
  needles: Needle[];
  /** The value being edited, or null when the dial is read-only. */
  editable: { value: number; label: string } | null;
  onChange?: (value: number, final: boolean) => void;
  /** Changes whenever bands should replay their reveal animation. */
  bandsKey: string;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const lastSent = useRef(0);

  const valueAt = (e: PointerEvent) => {
    const svg = svgRef.current!;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.getScreenCTM()!.inverse());
    let angle = Math.atan2(-p.y, p.x);
    if (angle < 0) angle = p.x < 0 ? Math.PI : 0;
    return Math.round((1 - angle / Math.PI) * 1000) / 10;
  };

  const emit = (value: number, final: boolean) => {
    const now = performance.now();
    if (!final && now - lastSent.current < SEND_EVERY_MS) return;
    lastSent.current = now;
    onChange?.(value, final);
  };

  const editValue = drag ?? editable?.value ?? 50;
  const shown = editable
    ? [...needles.filter((n) => !n.mine), { id: 'edit', value: editValue, color: '#fff', label: editable.label, mine: true }]
    : needles;

  const onKeyDown = (e: KeyboardEvent) => {
    if (!editable) return;
    const step = e.shiftKey ? 5 : 1;
    const delta = e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -step : e.key === 'ArrowRight' || e.key === 'ArrowUp' ? step : 0;
    if (!delta) return;
    e.preventDefault();
    emit(Math.min(100, Math.max(0, editable.value + delta)), true);
  };

  const bands =
    target === null
      ? []
      : BANDS.flatMap((b, i) => {
          const inner = i === 0 ? 0 : BANDS[i - 1]!.half;
          return [
            { points: b.points, from: target - b.half, to: target - inner },
            { points: b.points, from: target + inner, to: target + b.half },
          ];
        })
          .map((b) => ({ ...b, from: Math.max(0, b.from), to: Math.min(100, b.to) }))
          .filter((b) => b.to > b.from);

  return (
    <div className={`dial ${editable ? 'dial-editable' : ''}`}>
      <div className="dial-ends">
        <span className="dial-end dial-left">◀ {spectrum.left}</span>
        <span className="dial-end dial-right">{spectrum.right} ▶</span>
      </div>
      <svg
        ref={svgRef}
        viewBox={`${-R - 16} ${-R - 16} ${2 * R + 32} ${R + 40}`}
        role={editable ? 'slider' : 'img'}
        aria-label={editable ? `Dial between ${spectrum.left} and ${spectrum.right}` : 'Dial'}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={editable ? Math.round(editValue) : undefined}
        tabIndex={editable ? 0 : undefined}
        onKeyDown={onKeyDown}
        onPointerDown={(e) => {
          if (!editable) return;
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            // Capture is a nicety; dragging still works inside the dial without it.
          }
          const v = valueAt(e);
          setDrag(v);
          emit(v, false);
        }}
        onPointerMove={(e) => {
          if (drag === null) return;
          const v = valueAt(e);
          setDrag(v);
          emit(v, false);
        }}
        onPointerUp={(e) => {
          if (drag === null) return;
          emit(valueAt(e), true);
          setDrag(null);
        }}
      >
        <path className="dial-rim" d={`M${-R - 12},0 A${R + 12},${R + 12} 0 0 1 ${R + 12},0 Z`} />
        <path className="dial-face" d={wedge(0, 100)} />
        <g key={bandsKey} className="dial-bands">
          {bands.map((b, i) => (
            <path key={i} d={wedge(b.from, b.to)} fill={BAND_COLORS[b.points]} />
          ))}
          {bands
            .filter((b) => b.points === 4)
            .slice(0, 1)
            .map(() => {
              const p = point(target!, R * 0.82);
              return (
                <text key="4" className="dial-band-label" x={p.x} y={p.y}>
                  4
                </text>
              );
            })}
        </g>
        {Array.from({ length: 11 }, (_, i) => {
          const a = point(i * 10, R);
          const b = point(i * 10, R - (i % 5 === 0 ? 18 : 10));
          return <line key={i} className="dial-tick" x1={a.x} y1={a.y} x2={b.x} y2={b.y} />;
        })}
        {shown.map((n) => {
          const tip = point(n.value, R * 0.93);
          const label = point(n.value, R * 0.93 + 2);
          return (
            <g key={n.id} className={`needle ${n.mine ? 'needle-mine' : ''}`}>
              <line x1={0} y1={0} x2={tip.x} y2={tip.y} stroke={n.color} />
              <circle cx={tip.x} cy={tip.y} r={n.mine ? 13 : 10} fill={n.color} />
              <text x={label.x} y={label.y}>
                {n.label}
              </text>
            </g>
          );
        })}
        <circle className="dial-hub" cx={0} cy={0} r={22} />
      </svg>
    </div>
  );
}
