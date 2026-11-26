/**
 * Synthesized sound effects (Web Audio, nothing to download). Every effect says
 * something about the game: a short wooden knock per shell, a brighter clack that
 * climbs in pitch as shells pile into a store, a rattle when the hand scoops up a
 * pit, a two-note call for a capture or an extra turn, and a short phrase at the
 * end. Everything is best-effort: if audio is blocked or missing the game is silent.
 */
export interface Sound {
  enabled: boolean;
  /** A shell landing. `step` counts drops in this move (stores count their own). */
  land(kind: 'house' | 'store' | 'capture', step: number): void;
  scoop(relay: boolean): void;
  capture(count: number): void;
  extraTurn(): void;
  tap(): void;
  end(outcome: 'win' | 'draw' | 'loss'): void;
}

type Ctor = typeof AudioContext;

export function createSound(enabled: boolean): Sound {
  let ctx: AudioContext | null = null;
  let noise: AudioBuffer | null = null;
  let lastKnock = 0;

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

  const noiseBuffer = (c: AudioContext): AudioBuffer => {
    if (noise) return noise;
    const b = c.createBuffer(1, Math.floor(c.sampleRate * 0.25), c.sampleRate);
    const data = b.getChannelData(0);
    let seed = 1;
    for (let i = 0; i < data.length; i++) {
      seed = (seed * 16807) % 2147483647;
      data[i] = (seed / 2147483647) * 2 - 1;
    }
    noise = b;
    return b;
  };

  const tone = (
    freq: number,
    at: number,
    dur: number,
    type: OscillatorType,
    gain: number,
    glideTo?: number,
  ) => {
    const c = ac();
    if (!c) return;
    try {
      const t = c.currentTime + at;
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + dur * 0.6);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(c.destination);
      o.start(t);
      o.stop(t + dur + 0.02);
    } catch {
      /* ignore */
    }
  };

  /** A filtered noise tick: the click of shell on wood. */
  const click = (at: number, freq: number, gain: number, dur = 0.03) => {
    const c = ac();
    if (!c) return;
    try {
      const t = c.currentTime + at;
      const src = c.createBufferSource();
      src.buffer = noiseBuffer(c);
      const f = c.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = freq;
      f.Q.value = 6;
      const g = c.createGain();
      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f).connect(g).connect(c.destination);
      src.start(t, (freq % 7) * 0.01);
      src.stop(t + dur + 0.01);
    } catch {
      /* ignore */
    }
  };

  const s: Sound = {
    enabled,
    land(kind, step) {
      if (!s.enabled) return;
      // Very fast relays would turn into a buzz; keep knocks at least 22 ms apart.
      const now = performance.now();
      if (kind === 'house' && now - lastKnock < 22) return;
      lastKnock = now;
      if (kind === 'house') {
        const f = 420 + ((step * 53) % 140);
        tone(f, 0, 0.06, 'triangle', 0.1, f * 0.55);
        click(0, 2400 + ((step * 97) % 900), 0.05);
      } else if (kind === 'store') {
        // Climbs with every shell banked in the same move.
        const f = 620 * Math.pow(2, Math.min(step, 14) / 12);
        tone(f, 0, 0.1, 'triangle', 0.11);
        click(0, 3600, 0.05);
      } else {
        click(0, 3000 + ((step * 131) % 1200), 0.06, 0.025);
      }
    },
    scoop(relay) {
      if (!s.enabled) return;
      const n = relay ? 4 : 3;
      for (let i = 0; i < n; i++) click(i * 0.028, 1800 + i * 420, 0.07, 0.03);
    },
    capture(count) {
      if (!s.enabled) return;
      const lift = Math.min(count, 12) * 12;
      tone(523 + lift, 0, 0.2, 'sine', 0.13);
      tone(784 + lift, 0.08, 0.28, 'sine', 0.11);
      tone(1046 + lift, 0.16, 0.32, 'triangle', 0.06);
    },
    extraTurn() {
      if (!s.enabled) return;
      tone(784, 0, 0.12, 'sine', 0.12);
      tone(1175, 0.09, 0.22, 'sine', 0.1);
    },
    tap() {
      if (!s.enabled) return;
      click(0, 2000, 0.04, 0.02);
    },
    end(outcome) {
      if (!s.enabled) return;
      const notes =
        outcome === 'win'
          ? [523, 659, 784, 1046, 1318]
          : outcome === 'draw'
            ? [523, 587, 523]
            : [494, 440, 392, 330];
      notes.forEach((f, i) => tone(f, i * 0.12, 0.32, 'triangle', 0.11));
    },
  };
  return s;
}
