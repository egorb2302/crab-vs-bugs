// The service worker that lets the game run offline once it has been opened (or installed).
// This is a template: scripts/build-sw.mjs fills in the version and the file list after
// `vite build` and writes the result to dist/sw.js.
//
// - The whole game (page, bundle, font, sprites, icons) is fetched into one cache on install.
// - Page loads go to the network first, so an online player always gets the latest build;
//   offline, or on a network that takes too long, the cached page answers instead.
// - Everything else is served from the cache when it's there.
// - Dare links (/r/…) need the function on the server; offline they go straight to the game
//   with the same dare in the ?beat= form. /api/ is never touched.

const VERSION = "__VERSION__";
const FILES = /* __FILES__ */ [];

const PREFIX = "crab-vs-bugs-";
const CACHE = PREFIX + VERSION;
const SLOW_NETWORK_MS = 3000;
const scope = new URL(self.registration.scope);
const page = new URL("index.html", scope).href;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // past the HTTP cache: a new version must not pick up yesterday's sprite
      .then((cache) => cache.addAll(FILES.map((file) => new Request(new URL(file, scope), { cache: "reload" }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith(PREFIX) && key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

async function openPage(request) {
  const path = new URL(request.url).pathname.slice(scope.pathname.length);
  const dare = path.match(/^r\/([^/]+)\/([^/]+)\/?$/);
  const offline = async () => {
    if (dare) return Response.redirect(new URL(`./?beat=${dare[1]}&time=${dare[2]}`, scope).href, 302);
    // the page itself if it's one of ours (editor.html), otherwise the game
    return (await caches.match(request, { ignoreSearch: true, ignoreVary: true })) ?? caches.match(page, { ignoreVary: true });
  };
  const network = fetch(request);
  const slow = new Promise((resolve) => setTimeout(resolve, SLOW_NETWORK_MS, null));
  const answer = await Promise.race([network.catch(() => null), slow]);
  if (answer) return answer;
  // no answer, or not yet: the cached game if there is one, otherwise whatever the network says
  return (await offline()) ?? network;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== scope.origin) return;
  const path = url.pathname.slice(scope.pathname.length);
  if (path.startsWith("api/")) return;
  if (request.mode === "navigate") return event.respondWith(openPage(request));
  if (path.startsWith("r/")) return; // dare cards are drawn by the function
  // a script tag asks with an Origin header, the precache didn't: match on the URL alone
  event.respondWith(caches.match(request, { ignoreVary: true }).then((hit) => hit ?? fetch(request)));
});
