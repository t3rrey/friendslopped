// Tiny synth for chunky console-style blips. No audio files needed.
let ctx: AudioContext | null = null;
let muted = localStorage.getItem('fs.muted') === '1';

function audio() {
  ctx ??= new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'square', gain = 0.06) {
  if (muted) return;
  const a = audio();
  const t = a.currentTime + start;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(a.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

const seq = (notes: number[], step: number, type?: OscillatorType, gain?: number) =>
  notes.forEach((f, i) => tone(f, i * step, step * 1.6, type, gain));

export const sfx = {
  get muted() {
    return muted;
  },
  toggleMute() {
    muted = !muted;
    localStorage.setItem('fs.muted', muted ? '1' : '0');
    return muted;
  },
  click: () => tone(880, 0, 0.06, 'square', 0.04),
  select: () => seq([660, 990], 0.05),
  back: () => seq([520, 390], 0.05),
  join: () => seq([523, 659, 784], 0.07, 'triangle', 0.08),
  phase: () => seq([392, 523, 659], 0.09, 'triangle', 0.08),
  night: () => seq([330, 262, 196, 165], 0.14, 'triangle', 0.09),
  death: () => seq([220, 185, 147, 110], 0.16, 'sawtooth', 0.05),
  buzz: () => seq([140, 120], 0.08, 'sawtooth', 0.05),
  fanfare: () => seq([523, 523, 523, 659, 784, 1047], 0.11, 'square', 0.05),
};
