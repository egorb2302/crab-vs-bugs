import kaplay from "kaplay";

// Portrait phones get a square view (narrower, with extra sky) so sprites stay readable;
// everything else is 16:9. Layout code reads k.width()/k.height() instead of assuming either.
const portrait = window.innerHeight > window.innerWidth;

export const k = kaplay({
  width: portrait ? 240 : 320,
  height: portrait ? 240 : 180,
  letterbox: true,
  crisp: true,
  pixelDensity: Math.min(window.devicePixelRatio || 1, 2),
  canvas: document.querySelector<HTMLCanvasElement>("#game")!,
  background: [26, 28, 44],
  font: "pixel",
  touchToMouse: true,
  global: false,
  debug: import.meta.env.DEV,
});

export const COLORS = {
  sky: k.rgb(26, 28, 44),
  ink: k.rgb(13, 14, 23),
  white: k.rgb(244, 244, 244),
  muted: k.rgb(148, 176, 194),
  orange: k.rgb(217, 119, 87),
  red: k.rgb(177, 62, 83),
  yellow: k.rgb(255, 205, 117),
  green: k.rgb(167, 240, 112),
};
