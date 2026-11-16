/**
 * Small synthesized sound effects (Web Audio, no audio files to download): a
 * wooden "tok" per shell, a chime for captures and extra turns, a short tune at
 * the end. Everything is best-effort: if audio is blocked or missing, the game
 * stays silent instead of failing.
 */
export interface Sound {
  enabled: boolean;
  drop(step: number): void;
  capture(): void;
  extraTurn(): void;
  end(outcome: 'win' | 'draw' | 'loss'): void;
}

type Ctor = typeof AudioContext;

export function createSound(enabled: boolean): Sound {
  let ctx: AudioContext | null = null;
  const ac = (): AudioContext | null => {
    try {
      if (!ctx) {
        const C: Ctor | undefined =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: Ctor }).webkitAudioContext;
        if (!C) return null;
        ctx = new C();
      }
      if (ctx.state === 'suspended') void ctx.resume();
      return ctx;
    } catch {
      return null;
    }
  };

  const tone = (freq: number, at: number, dur: number, type: OscillatorType, gain: number) => {
    const c = ac();
    if (!c) return;
    try {
      const t = c.currentTime + at;
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(c.destination);
      o.start(t);
      o.stop(t + dur + 0.02);
    } catch {
      /* ignore */
    }
  };

  const s: Sound = {
    enabled,
    drop(step) {
      if (!s.enabled) return;
      // A dry wooden knock whose pitch wanders a little so long sowings don't drone.
      tone(520 + ((step * 37) % 160), 0, 0.07, 'triangle', 0.12);
    },
    capture() {
      if (!s.enabled) return;
      tone(660, 0, 0.18, 'sine', 0.14);
      tone(990, 0.07, 0.24, 'sine', 0.1);
    },
    extraTurn() {
      if (!s.enabled) return;
      tone(784, 0, 0.12, 'sine', 0.12);
      tone(1046, 0.08, 0.2, 'sine', 0.1);
    },
    end(outcome) {
      if (!s.enabled) return;
      const notes =
        outcome === 'win'
          ? [523, 659, 784, 1046]
          : outcome === 'draw'
            ? [523, 587, 523]
            : [494, 440, 392];
      notes.forEach((f, i) => tone(f, i * 0.13, 0.28, 'triangle', 0.12));
    },
  };
  return s;
}
