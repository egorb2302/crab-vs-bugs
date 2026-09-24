import type { LevelDef } from "./levels";
import type { ThemeName } from "./themes";
import { CHUNK_H, CHUNK_W, LEGEND } from "./validate";

// A custom level travels inside its link: /#play=<code>. The code is the map as JSON, deflated
// where the browser can (CompressionStream), in URL-safe base64 — a whole level is a few hundred
// characters. After the # it never reaches a server; nothing is uploaded or stored anywhere.

export const THEME_NAMES: ThemeName[] = ["meadow", "desert", "cavern", "frost", "magma"];
export const MAX_CHUNKS = 30;
/** What the game's font (and a link preview) can show, kept short enough for the HUD */
export const NAME_PATTERN = /^[A-Z0-9 .,!?'&:-]{1,16}$/;
export const CUSTOM_ID = "custom";

interface Payload {
  v: 1;
  n: string;
  t: ThemeName;
  /** the 12 full-width rows, trailing sky trimmed */
  m: string[];
}

const toBase64Url = (bytes: Uint8Array) => {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const fromBase64Url = (text: string) => {
  const bin = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
};

const canDeflate = typeof CompressionStream === "function" && typeof DecompressionStream === "function";

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

/** The level as full-width rows, one string per row. */
export function levelRows(def: Pick<LevelDef, "chunks">): string[] {
  return Array.from({ length: CHUNK_H }, (_, r) => def.chunks.map((chunk) => (chunk[r] ?? "").padEnd(CHUNK_W)).join(""));
}

/** Full-width rows back into 20×12 chunks, rows trimmed the way levels.ts writes them. */
export function rowsToChunks(rows: string[]): string[][] {
  const count = Math.max(1, Math.ceil(Math.max(...rows.map((row) => row.length)) / CHUNK_W));
  return Array.from({ length: count }, (_, i) =>
    Array.from({ length: CHUNK_H }, (_, r) => (rows[r] ?? "").slice(i * CHUNK_W, (i + 1) * CHUNK_W).trimEnd()),
  );
}

export async function encodeLevel(def: Pick<LevelDef, "name" | "theme" | "chunks">): Promise<string> {
  const payload: Payload = { v: 1, n: def.name, t: def.theme, m: levelRows(def).map((row) => row.trimEnd()) };
  const json = new TextEncoder().encode(JSON.stringify(payload));
  return canDeflate ? "z" + toBase64Url(await pipe(json, new CompressionStream("deflate-raw"))) : "j" + toBase64Url(json);
}

/** Null for anything that isn't a well-formed level: a broken link just opens the game. */
export async function decodeLevel(code: string): Promise<LevelDef | null> {
  try {
    const kind = code[0];
    let bytes: Uint8Array = fromBase64Url(code.slice(1));
    if (kind === "z") {
      if (!canDeflate) return null;
      bytes = await pipe(bytes, new DecompressionStream("deflate-raw"));
    } else if (kind !== "j") return null;
    const data = JSON.parse(new TextDecoder().decode(bytes)) as Partial<Payload>;
    if (data.v !== 1 || typeof data.n !== "string" || !NAME_PATTERN.test(data.n)) return null;
    if (!THEME_NAMES.includes(data.t as ThemeName)) return null;
    const rows = data.m;
    if (!Array.isArray(rows) || rows.length !== CHUNK_H) return null;
    for (const row of rows) {
      if (typeof row !== "string" || row.length > MAX_CHUNKS * CHUNK_W) return null;
      if ([...row].some((ch) => !LEGEND.includes(ch))) return null;
    }
    return { id: CUSTOM_ID, name: data.n, theme: data.t as ThemeName, chunks: rowsToChunks(rows) };
  } catch {
    return null;
  }
}

/** `#play=<code>` (a shared level) or `#test=<code>` (straight from the editor), if the page has one. */
export function levelFromHash(hash = location.hash): { code: string; test: boolean } | null {
  const match = hash.match(/^#(play|test)=([A-Za-z0-9_-]+)$/);
  return match ? { code: match[2], test: match[1] === "test" } : null;
}
