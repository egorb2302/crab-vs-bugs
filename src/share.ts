import { isTouchDevice } from "./input";

// Phones get the system share sheet (Telegram, WhatsApp, Messages, ...). Desktops get a post on X
// and a plain copy of the link — the desktop share sheet rarely has the app anyone wants.

export const canShareNatively = isTouchDevice && typeof navigator.share === "function";

export function postOnX(text: string, url: string) {
  const intent = new URL("https://x.com/intent/post");
  intent.searchParams.set("text", text);
  intent.searchParams.set("url", url);
  window.open(intent, "_blank", "noopener");
}

export async function shareNatively(text: string, url: string) {
  try {
    await navigator.share({ title: "Crab vs Bugs", text, url });
  } catch (e) {
    // closing the sheet is a choice, not a failure; anything else falls back to X
    if ((e as Error).name !== "AbortError") postOnX(text, url);
  }
}

/** Resolves to whether the link actually made it to the clipboard. */
export async function copyLink(url: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    // no clipboard access (old browser, insecure origin): let the player copy it by hand
    window.prompt("Copy this link:", url);
    return false;
  }
}
