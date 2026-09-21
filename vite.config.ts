import { defineConfig } from "vite";

// X only unfurls cards with absolute image URLs, so OG tags need the real origin.
// SITE_URL wins; on Vercel the production domain is picked up automatically.
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const siteUrl = (
  env.SITE_URL ?? (env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}` : "")
).replace(/\/$/, "");

export default defineConfig({
  base: "./",
  plugins: [
    {
      name: "site-url",
      transformIndexHtml: (html) => html.replaceAll("__SITE_URL__", siteUrl),
    },
  ],
});
