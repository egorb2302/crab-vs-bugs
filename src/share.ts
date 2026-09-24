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

/**
 * A file (the run clip): into the share sheet where phones take files, otherwise downloaded.
 * Resolves to false only when the player closed the share sheet.
 */
export async function shareFile(file: File, text: string, url: string): Promise<boolean> {
  if (canShareNatively && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: "Crab vs Bugs", text: `${text} ${url}` });
      return true;
    } catch (e) {
      if ((e as Error).name === "AbortError") return false;
      // some share targets turn files down: save it instead
    }
  }
  const href = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = href;
  a.download = file.name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 60_000);
  return true;
}
