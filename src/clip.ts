import fontUrl from "@fontsource/press-start-2p/files/press-start-2p-latin-400-normal.woff2?url";
import { k } from "./k";

// A clip of the end of a run, without recording the whole run. While a level plays, the last few
// seconds sit in a ring of snapshots at game resolution, all in one atlas canvas — a GPU copy
// every other frame, nothing encoded. At the flag the ring stops. Asked for a clip, it is played
// back, blown up with hard pixel edges, through a MediaRecorder, with an end card on top.
// Where the browser can't record a canvas, the end card alone comes out as a PNG.

const FPS = 30;
const SECONDS = 6;
const SLOTS = FPS * SECONDS;
const CARD_SECONDS = 2.5;
const SCALE = 4; // 320×180 → 1280×720
const ATLAS_MAX = 4096; // widest texture every phone GPU takes
const FONT = "clip-pixel";

const INK = "#0d0e17";
const COLOR = { orange: "#d97757", muted: "#94b0c2", white: "#f4f4f4", yellow: "#ffcd75", green: "#a7f070", sky: "#1a1c2c" };

// ---------------------------------------------------------------- capture

let atlas: CanvasRenderingContext2D | null = null;
let W = 0;
let H = 0;
let cols = 0;
const times = new Float64Array(SLOTS);
let count = 0; // frames taken since the level started; the newest is in slot (count - 1) % SLOTS
let loop = 0;
let last = -Infinity;

function snap(now: number) {
  loop = requestAnimationFrame(snap);
  // a hair under 1/30 s, so 60 Hz takes every other frame instead of drifting
  if (now - last < 1000 / FPS - 4 || !atlas) return;
  last = now;
  // Kaplay letterboxes into the canvas: take just the game's rectangle. The canvas keeps its
  // drawing buffer, and this runs in its own animation frame, so it always holds a whole frame.
  const src = k.canvas;
  const s = Math.min(src.width / W, src.height / H);
  const slot = count % SLOTS;
  atlas.drawImage(src, (src.width - W * s) / 2, (src.height - H * s) / 2, W * s, H * s, (slot % cols) * W, Math.floor(slot / cols) * H, W, H);
  times[slot] = now;
  count++;
}

/** A level starts: forget the last one and keep the newest few seconds from here on. */
export function startCapture() {
  stopCapture();
  count = 0;
  last = -Infinity;
  if (!atlas || W !== k.width() || H !== k.height()) {
    W = k.width();
    H = k.height();
    cols = Math.floor(ATLAS_MAX / W);
    const canvas = document.createElement("canvas");
    canvas.width = cols * W;
    canvas.height = Math.ceil(SLOTS / cols) * H;
    atlas = canvas.getContext("2d");
    if (!atlas) return;
    atlas.imageSmoothingEnabled = false;
  }
  loop = requestAnimationFrame(snap);
}

/** The run is over: hold on to what's there. */
export function stopCapture() {
  cancelAnimationFrame(loop);
}

export const hasClip = () => count > 0;

// ---------------------------------------------------------------- playback

export interface Card {
  heading: string;
  subtitle: string;
  time: string;
}

const pickType = () =>
  typeof MediaRecorder === "undefined" || !("captureStream" in HTMLCanvasElement.prototype)
    ? undefined
    : ["video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find((type) =>
        MediaRecorder.isTypeSupported(type),
      );

/** Whether this browser can record a video clip; without it, a clip is a still end card. */
export const canRecord = pickType() !== undefined;

let fontReady: Promise<unknown> | null = null;
function loadFont() {
  fontReady ??= new FontFace(FONT, `url(${fontUrl})`)
    .load()
    .then((face) => document.fonts.add(face))
    .catch(() => {}); // monospace it is
  return fontReady;
}

function makeCanvas() {
  const canvas = document.createElement("canvas");
  canvas.width = W * SCALE;
  canvas.height = H * SCALE;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  return { canvas, ctx };
}

function drawSnapshot(ctx: CanvasRenderingContext2D, frame: number) {
  const slot = frame % SLOTS;
  ctx.drawImage(atlas!.canvas, (slot % cols) * W, Math.floor(slot / cols) * H, W, H, 0, 0, W * SCALE, H * SCALE);
}

/** The last frame of the run, dimmed, with the result on it. `t` is seconds into the card. */
function drawCard(ctx: CanvasRenderingContext2D, card: Card, t: number) {
  if (count > 0) drawSnapshot(ctx, count - 1);
  else {
    ctx.fillStyle = COLOR.sky;
    ctx.fillRect(0, 0, W * SCALE, H * SCALE);
  }
  ctx.globalAlpha = 0.75 * Math.min(1, t / 0.3);
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, W * SCALE, H * SCALE);
  ctx.globalAlpha = Math.min(1, Math.max(0, (t - 0.15) / 0.2));
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  const cy = H / 2 - 6;
  const line = (text: string, y: number, size: number, color: string) => {
    ctx.font = `${size * SCALE}px ${FONT}, monospace`;
    const shadow = Math.max(1, Math.round(size / 8)) * SCALE;
    ctx.fillStyle = INK;
    ctx.fillText(text, (W / 2) * SCALE + shadow, y * SCALE + shadow);
    ctx.fillStyle = color;
    ctx.fillText(text, (W / 2) * SCALE, y * SCALE);
  };
  line("CRAB VS BUGS", cy - 50, 8, COLOR.orange);
  line(card.heading, cy - 34, 16, COLOR.green);
  line(card.subtitle, cy - 12, 8, COLOR.muted);
  line(card.time, cy + 4, 24, COLOR.yellow);
  line("CAN YOU BEAT IT?", cy + 38, 8, COLOR.white);
  line(location.host, cy + 52, 8, COLOR.muted);
  ctx.globalAlpha = 1;
}

/** The end card on its own, as a PNG — for browsers that can't record video. */
export async function makeStill(card: Card): Promise<Blob> {
  await loadFont();
  const { canvas, ctx } = makeCanvas();
  drawCard(ctx, card, CARD_SECONDS);
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("no PNG"))), "image/png"));
}

/**
 * Plays the held frames into a video, in real time (that's how MediaRecorder works): at most
 * SECONDS of the run, then the end card. `progress` gets 0…1; `signal` aborts.
 */
export async function makeVideo(card: Card, progress: (share: number) => void, signal: AbortSignal): Promise<Blob> {
  const type = pickType();
  if (!type || count === 0) throw new Error("nothing to record");
  await loadFont();
  signal.throwIfAborted();

  const first = Math.max(0, count - SLOTS);
  const end = times[(count - 1) % SLOTS];
  // snapshots are at most SECONDS old anyway; the clip starts at the first one
  const start = times[first % SLOTS];
  const run = (end - start) / 1000 + 1 / FPS;
  const total = run + CARD_SECONDS;

  const { canvas, ctx } = makeCanvas();
  drawSnapshot(ctx, first);
  const stream = canvas.captureStream(FPS);
  const recorder = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 5_000_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);

  return new Promise<Blob>((resolve, reject) => {
    let raf = 0;
    let playhead = 0;
    let prev = performance.now();
    let frame = first;
    let failed: unknown = null;

    // a hidden tab gets no animation frames: pause the recording rather than film a freeze
    const onVisibility = () => {
      if (recorder.state === "inactive") return;
      if (document.hidden) recorder.pause();
      else {
        prev = performance.now();
        recorder.resume();
      }
    };
    const finish = (error?: unknown) => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVisibility);
      signal.removeEventListener("abort", onAbort);
      failed = error ?? null;
      if (recorder.state !== "inactive") recorder.stop();
      else done();
    };
    const done = () => {
      stream.getTracks().forEach((track) => track.stop());
      if (failed) reject(failed);
      else resolve(new Blob(chunks, { type: recorder.mimeType || type }));
    };
    const onAbort = () => finish(signal.reason);
    recorder.onstop = done;
    recorder.onerror = (e) => finish((e as ErrorEvent).error ?? new Error("recording failed"));

    const tick = (now: number) => {
      playhead += Math.min(now - prev, 100) / 1000;
      prev = now;
      if (playhead < run) {
        const at = start + playhead * 1000;
        while (frame + 1 < count && times[(frame + 1) % SLOTS] <= at) frame++;
        drawSnapshot(ctx, frame);
      } else {
        drawCard(ctx, card, playhead - run);
      }
      progress(Math.min(1, playhead / total));
      if (playhead >= total) return finish();
      raf = requestAnimationFrame(tick);
    };

    document.addEventListener("visibilitychange", onVisibility);
    signal.addEventListener("abort", onAbort);
    recorder.start(1000);
    raf = requestAnimationFrame(tick);
  });
}

/** crab-vs-bugs-hop-scotch-24.3.mp4 */
export function clipName(beat: string, seconds: string, blob: Blob) {
  const ext = blob.type.startsWith("image/png") ? "png" : blob.type.includes("mp4") ? "mp4" : "webm";
  return `crab-vs-bugs-${beat}-${seconds}.${ext}`;
}
