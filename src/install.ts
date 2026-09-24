// "Add to home screen" where the browser offers it (Chrome, Edge, Android). The browser's own
// banner is held back and the start screen shows an INSTALL link instead; iOS has no such event —
// there it's Share → Add to Home Screen, and the game works the same once added.

interface InstallPrompt extends Event {
  prompt(): Promise<void>;
}

let offer: InstallPrompt | null = null;

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  offer = e as InstallPrompt;
});
window.addEventListener("appinstalled", () => (offer = null));

export const canInstall = () => offer !== null;

export function install() {
  const prompt = offer;
  offer = null; // one prompt per offer; the browser sends a fresh one if it's declined
  void prompt?.prompt().catch(() => {});
}

/** Offline play: the service worker caches the whole game (scripts/sw.js). Only in real builds. */
export function registerOffline() {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => void navigator.serviceWorker.register("sw.js").catch(() => {}));
}
