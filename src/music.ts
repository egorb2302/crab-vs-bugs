import { audioContext, isMuted } from "./sfx";
import type { ThemeName } from "./themes";

// A chiptune loop per location, made on the fly by the same kind of oscillators as the sound
// effects — no audio files. Chords are written by hand; the melody is generated from them with
// a fixed seed, so each world always plays the same tune. Notes are scheduled slightly ahead
// on the audio clock, which keeps the beat steady whatever the frame rate does.

type Quality = "maj" | "min";

interface Track {
  bpm: number;
  /** one chord per bar, bass-octave MIDI root + quality; the 16-bar loop cycles through them */
  chords: [root: number, quality: Quality][];
  /** the melody lives in this key and scale (semitones above the key) */
  key: number;
  scale: number[];
  bass: "half" | "pulse";
  arp: "up" | "updown";
  /** an arpeggio note every N sixteenths */
  arpEvery: 1 | 2 | 4;
  /** octaves above the bass root */
  arpOctave: number;
  arpWave: OscillatorType;
  leadWave: OscillatorType;
  drums: "none" | "soft" | "drive";
  echo: boolean;
  seed: number;
}

const HARMONIC_MINOR = [0, 2, 3, 5, 7, 8, 11];

const TRACKS: Record<ThemeName, Track> = {
  meadow: {
    bpm: 116,
    chords: [[48, "maj"], [43, "maj"], [45, "min"], [41, "maj"]], // C G Am F
    key: 60,
    scale: [0, 2, 4, 5, 7, 9, 11],
    bass: "half",
    arp: "updown",
    arpEvery: 2,
    arpOctave: 1,
    arpWave: "square",
    leadWave: "square",
    drums: "soft",
    echo: false,
    seed: 3,
  },
  desert: {
    bpm: 104,
    chords: [[50, "min"], [48, "maj"], [46, "maj"], [45, "maj"]], // Dm C Bb A
    key: 62,
    scale: HARMONIC_MINOR,
    bass: "pulse",
    arp: "up",
    arpEvery: 2,
    arpOctave: 1,
    arpWave: "triangle",
    leadWave: "square",
    drums: "soft",
    echo: false,
    seed: 11,
  },
  cavern: {
    bpm: 84,
    chords: [[45, "min"], [41, "maj"], [38, "min"], [40, "maj"]], // Am F Dm E
    key: 57,
    scale: HARMONIC_MINOR,
    bass: "half",
    arp: "up",
    arpEvery: 4,
    arpOctave: 2,
    arpWave: "triangle",
    leadWave: "triangle",
    drums: "none",
    echo: true,
    seed: 7,
  },
  frost: {
    bpm: 96,
    chords: [[40, "min"], [48, "maj"], [43, "maj"], [50, "maj"]], // Em C G D
    key: 64,
    scale: [0, 2, 3, 5, 7, 8, 10],
    bass: "half",
    arp: "updown",
    arpEvery: 1,
    arpOctave: 2,
    arpWave: "triangle",
    leadWave: "square",
    drums: "none",
    echo: true,
    seed: 5,
  },
  magma: {
    bpm: 138,
    chords: [[48, "min"], [44, "maj"], [46, "maj"], [43, "maj"]], // Cm Ab Bb G
    key: 60,
    scale: HARMONIC_MINOR,
    bass: "pulse",
    arp: "up",
    arpEvery: 2,
    arpOctave: 1,
    arpWave: "square",
    leadWave: "square",
    drums: "drive",
    echo: false,
    seed: 13,
  },
};

// ---------------------------------------------------------------- composing

type Voice = "bass" | "arp" | "lead" | "kick" | "snare" | "hat";

interface Note {
  voice: Voice;
  midi: number;
  /** length in sixteenths */
  len: number;
}

const BARS = 16;
const STEPS = BARS * 16;

// [start, length] in sixteenths — one bar of melody rhythm each
const RHYTHMS: [number, number][][] = [
  [[0, 4], [4, 2], [6, 2], [8, 4], [12, 4]],
  [[0, 2], [2, 2], [4, 4], [8, 2], [10, 2], [12, 4]],
  [[0, 2], [4, 2], [6, 2], [8, 6], [14, 2]],
  [[0, 3], [3, 3], [6, 2], [8, 4], [12, 2], [14, 2]],
];
const CADENCE: [number, number][] = [[0, 6], [6, 2], [8, 8]];
const STEPS_AND_LEAPS = [-1, 1, -1, 1, -2, 2, 3, -3];

function rng(seed: number) {
  let a = seed * 2654435761;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const chordTones = (root: number, q: Quality) => [root, root + (q === "maj" ? 4 : 3), root + 7];

function compose(track: Track): Note[][] {
  const steps: Note[][] = Array.from({ length: STEPS }, () => []);
  const at = (step: number, note: Note) => steps[step % STEPS].push(note);
  const random = rng(track.seed);
  const degreeToMidi = (d: number) => track.key + track.scale[((d % 7) + 7) % 7] + 12 * Math.floor(d / 7);

  // a four-bar melody over the chords: a random walk through the scale that lands on a chord
  // tone on every strong beat and ends on the tonic
  const phrase = (): [step: number, len: number, midi: number][] => {
    const out: [number, number, number][] = [];
    let degree = 2 + Math.floor(random() * 3);
    for (let bar = 0; bar < 4; bar++) {
      const [root, q] = track.chords[bar % track.chords.length];
      const pcs = chordTones(root, q).map((m) => m % 12);
      const rhythm = bar === 3 ? CADENCE : RHYTHMS[Math.floor(random() * RHYTHMS.length)];
      rhythm.forEach(([start, len], i) => {
        const strong = start % 8 === 0;
        const last = bar === 3 && i === rhythm.length - 1;
        if (!strong && !last && random() < 0.15) return; // breathe
        // mostly steps, sometimes a leap, never the same note twice; turn back near the edges
        let move = STEPS_AND_LEAPS[Math.floor(random() * STEPS_AND_LEAPS.length)];
        if ((degree <= 1 && move < 0) || (degree >= 8 && move > 0)) move = -move;
        degree += move;
        if (strong) {
          for (const off of [0, -1, 1, -2, 2, -3, 3]) {
            if (pcs.includes(degreeToMidi(degree + off) % 12)) {
              degree += off;
              break;
            }
          }
        }
        if (last) degree = degree >= 4 ? 7 : 0;
        out.push([bar * 16 + start, len, degreeToMidi(degree)]);
      });
    }
    return out;
  };
  const phraseA = phrase();
  const phraseB = phrase();

  for (let bar = 0; bar < BARS; bar++) {
    const [root, q] = track.chords[bar % track.chords.length];
    const base = bar * 16;
    const tones = chordTones(root, q);

    if (track.bass === "half") {
      at(base, { voice: "bass", midi: root, len: 8 });
      at(base + 8, { voice: "bass", midi: bar % 2 ? root + 7 : root, len: 8 });
    } else {
      for (let i = 0; i < 8; i++) at(base + i * 2, { voice: "bass", midi: root + (i % 2 ? 12 : 0), len: 2 });
    }

    const arpNotes = [...tones, root + 12].map((m) => m + 12 * track.arpOctave);
    const order = track.arp === "up" ? [0, 1, 2, 3] : [0, 1, 2, 3, 2, 1];
    for (let s = 0, i = 0; s < 16; s += track.arpEvery, i++) {
      at(base + s, { voice: "arp", midi: arpNotes[order[i % order.length]], len: track.arpEvery });
    }

    // the drums come in after a two-bar intro
    if (bar >= 2 && track.drums !== "none") {
      const kicks = track.drums === "drive" ? [0, 4, 8, 12] : [0, 8];
      for (const s of kicks) at(base + s, { voice: "kick", midi: 0, len: 1 });
      for (const s of [2, 6, 10, 14]) at(base + s, { voice: "hat", midi: 0, len: 1 });
      if (track.drums === "drive") for (const s of [4, 12]) at(base + s, { voice: "snare", midi: 0, len: 1 });
    }
  }

  // bars 0-3 are just the band; then melody A, B, A
  const lead = (notes: [number, number, number][], fromBar: number) => {
    for (const [step, len, midi] of notes) at(fromBar * 16 + step, { voice: "lead", midi, len });
  };
  lead(phraseA, 4);
  lead(phraseB, 8);
  lead(phraseA, 12);
  return steps;
}

// ---------------------------------------------------------------- playing

const LEVEL = 0.55;
const LOOKAHEAD = 0.15; // seconds of notes queued ahead of the audio clock
const freq = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

interface Playing {
  name: ThemeName;
  track: Track;
  steps: Note[][];
  bus: GainNode | null;
  step: number;
  /** audio-clock time of the next step; 0 = start from "now" */
  next: number;
  target: number;
}

let current: Playing | null = null;
let duckUntil = 0;
let noise: AudioBuffer | null = null;

function noiseBuffer(ctx: AudioContext) {
  if (noise) return noise;
  noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.2), ctx.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return noise;
}

function makeBus(ctx: AudioContext, track: Track) {
  const bus = ctx.createGain();
  bus.gain.value = 0;
  bus.connect(ctx.destination);
  if (track.echo) {
    // one feedback delay: caves and ice ring a little
    const delay = ctx.createDelay(1);
    delay.delayTime.value = (60 / track.bpm) * 0.75;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.3;
    const wet = ctx.createGain();
    wet.gain.value = 0.35;
    bus.connect(delay).connect(feedback).connect(delay);
    delay.connect(wet).connect(ctx.destination);
  }
  return bus;
}

function tone(ctx: AudioContext, out: AudioNode, wave: OscillatorType, hz: number, t0: number, dur: number, volume: number) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = wave;
  osc.frequency.setValueAtTime(hz, t0);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(volume, t0 + 0.008);
  gain.gain.exponentialRampToValueAtTime(volume * 0.6, t0 + Math.min(0.08, dur * 0.5));
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(out);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function drum(ctx: AudioContext, out: AudioNode, voice: Voice, t0: number) {
  if (voice === "kick") {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.setValueAtTime(150, t0);
    osc.frequency.exponentialRampToValueAtTime(45, t0 + 0.12);
    gain.gain.setValueAtTime(0.14, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.14);
    osc.connect(gain).connect(out);
    osc.start(t0);
    osc.stop(t0 + 0.16);
    return;
  }
  const hat = voice === "hat";
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  const filter = ctx.createBiquadFilter();
  filter.type = hat ? "highpass" : "bandpass";
  filter.frequency.value = hat ? 7000 : 1800;
  const gain = ctx.createGain();
  const len = hat ? 0.03 : 0.12;
  gain.gain.setValueAtTime(hat ? 0.03 : 0.06, t0);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
  src.connect(filter).connect(gain).connect(out);
  src.start(t0);
  src.stop(t0 + len + 0.02);
}

function play(ctx: AudioContext, p: Playing, bus: GainNode, note: Note, t0: number, stepDur: number) {
  const dur = note.len * stepDur;
  const { arpWave, leadWave } = p.track;
  switch (note.voice) {
    case "bass":
      return tone(ctx, bus, "triangle", freq(note.midi), t0, dur * 0.9, 0.09);
    case "arp":
      return tone(ctx, bus, arpWave, freq(note.midi), t0, Math.min(dur, 0.35) * 0.9, arpWave === "square" ? 0.014 : 0.035);
    case "lead":
      return tone(ctx, bus, leadWave, freq(note.midi), t0, dur * 0.95, leadWave === "square" ? 0.022 : 0.05);
    default:
      return drum(ctx, bus, note.voice, t0);
  }
}

function tick() {
  const ctx = audioContext();
  const p = current;
  if (!ctx || ctx.state !== "running" || !p) return;
  const bus = (p.bus ??= makeBus(ctx, p.track));

  const now = ctx.currentTime;
  const target = isMuted() ? 0 : now < duckUntil ? LEVEL * 0.2 : LEVEL;
  if (target !== p.target) {
    bus.gain.setTargetAtTime(target, now, 0.08);
    p.target = target;
  }
  if (isMuted()) {
    p.next = 0;
    return;
  }

  const stepDur = 60 / p.track.bpm / 4;
  // first run, or the clock got ahead of us (a long hitch): pick up from now
  if (p.next === 0 || p.next < now - 0.1) p.next = now + 0.05;
  while (p.next < now + LOOKAHEAD) {
    for (const note of p.steps[p.step]) play(ctx, p, bus, note, p.next, stepDur);
    p.step = (p.step + 1) % STEPS;
    p.next += stepDur;
  }
}

window.setInterval(tick, 30);

const composed = new Map<ThemeName, Note[][]>();

/** Switch to a location's tune. Asking for the tune that's already on changes nothing. */
export function playMusic(name: ThemeName) {
  if (current?.name === name) return;
  const ctx = audioContext();
  const old = current?.bus;
  if (old && ctx) {
    old.gain.setTargetAtTime(0, ctx.currentTime, 0.15);
    window.setTimeout(() => old.disconnect(), 1500);
  }
  if (!composed.has(name)) composed.set(name, compose(TRACKS[name]));
  current = { name, track: TRACKS[name], steps: composed.get(name)!, bus: null, step: 0, next: 0, target: -1 };
}

/** Pull the music down for a moment so a jingle can be heard. */
export function duckMusic(seconds: number) {
  const ctx = audioContext();
  if (ctx) duckUntil = ctx.currentTime + seconds;
}
