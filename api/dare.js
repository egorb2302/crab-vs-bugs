import { cardImage, encodePNG } from "../scripts/art.mjs";
import { LEVELS } from "./_levels.js";

// Short dare links with a picture of their own, rewritten here by vercel.json:
//   /r/<level id | all>/<seconds>            a page whose link preview is that dare's card; people go straight on to
//                                            the game at /?beat=…&time=…, where src/challenge.ts takes over
//   /r/<level id | all>/<seconds>/card.png   the card itself
// Nothing is stored or counted: the link is the whole dare, the same as the ?beat= form.

const MAX_TIME = 24 * 3600;
// same inputs, same bytes: let the CDN keep a card for good (a deploy starts a fresh cache anyway)
const CACHE = "public, max-age=3600, s-maxage=31536000";

/** Same as formatTime in src/ui.ts. */
function formatTime(seconds) {
  const tenths = Math.floor(seconds * 10);
  const m = Math.floor(tenths / 600);
  const s = Math.floor(tenths / 10) % 60;
  return `${m}:${String(s).padStart(2, "0")}.${tenths % 10}`;
}

const titleCase = (name) => name.toLowerCase().replace(/\b[a-z]/g, (ch) => ch.toUpperCase());

function parse(beat, time) {
  if (!/^\d{1,5}(\.\d+)?$/.test(time ?? "")) return null;
  const seconds = Math.floor(Number(time) * 10) / 10;
  if (seconds < 0.1 || seconds > MAX_TIME) return null;
  if (beat === "all") {
    return {
      beat,
      seconds,
      // the finale's location for the whole run
      theme: LEVELS[LEVELS.length - 1].theme,
      subtitle: `ALL ${LEVELS.length} LEVELS`,
      title: `Can you beat ${formatTime(seconds)} across all ${LEVELS.length} levels?`,
      description: `Every level of Crab vs Bugs back to back. Finish faster than ${formatTime(seconds)} to win the dare. A tiny pixel platformer that plays right in your browser.`,
    };
  }
  const index = LEVELS.findIndex((level) => level.id === beat);
  if (index === -1) return null;
  const level = LEVELS[index];
  return {
    beat,
    seconds,
    theme: level.theme,
    subtitle: `${index + 1}. ${level.name}`,
    title: `Can you beat ${formatTime(seconds)} on ${titleCase(level.name)}?`,
    description: `${titleCase(level.name)} is level ${index + 1} of Crab vs Bugs. Clear it faster than ${formatTime(seconds)} to win the dare. A tiny pixel platformer that plays right in your browser.`,
  };
}

const escape = (text) => text.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

function page(dare, origin) {
  const path = `/r/${dare.beat}/${dare.seconds.toFixed(1)}`;
  const play = `/?beat=${dare.beat}&time=${dare.seconds.toFixed(1)}`;
  const card = `${origin}${path}/card.png`;
  const [title, description] = [escape(dare.title), escape(dare.description)];
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title} · Crab vs Bugs</title>
    <meta name="description" content="${description}" />
    <meta name="theme-color" content="#1a1c2c" />
    <link rel="icon" type="image/png" href="/favicon.png" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="Crab vs Bugs" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description}" />
    <meta property="og:url" content="${origin}${path}" />
    <meta property="og:image" content="${card}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="${escape(`Crab vs Bugs dare: beat ${formatTime(dare.seconds)}, ${dare.subtitle}`)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:description" content="${description}" />
    <meta name="twitter:image" content="${card}" />
    <meta http-equiv="refresh" content="0; url=${escape(play)}" />
    <script>location.replace(${JSON.stringify(play)})</script>
    <style>
      html { background: #1a1c2c; color: #f4f4f4; font: 16px/1.5 monospace; }
      body { display: grid; place-items: center; min-height: 100vh; margin: 0; }
      a { color: #ffcd75; }
    </style>
  </head>
  <body>
    <a href="${escape(play)}">Take the dare in Crab vs Bugs</a>
  </body>
</html>
`;
}

export function GET(request) {
  const url = new URL(request.url);
  const dare = parse(url.searchParams.get("beat"), url.searchParams.get("time"));
  // a mistyped or doctored link still lands somewhere useful
  if (!dare) return Response.redirect(new URL("/", url.origin), 302);

  if (url.searchParams.has("card")) {
    const png = encodePNG(cardImage({ theme: dare.theme, time: formatTime(dare.seconds), subtitle: dare.subtitle }));
    return new Response(png, { headers: { "content-type": "image/png", "cache-control": CACHE } });
  }
  return new Response(page(dare, url.origin), {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": CACHE },
  });
}

export { GET as HEAD };
