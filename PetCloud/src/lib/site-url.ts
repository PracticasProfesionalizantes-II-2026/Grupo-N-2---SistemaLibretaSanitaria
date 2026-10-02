/** Default origin when NEXT_PUBLIC_SITE_URL is not set (local development). */
const DEFAULT_SITE_URL = "http://localhost:3000";

/**
 * Public origin of the site, without trailing slash. Comes from
 * `NEXT_PUBLIC_SITE_URL` and falls back to `http://localhost:3000`.
 */
export function getSiteUrlFromEnv() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL || DEFAULT_SITE_URL;
  return configured.replace(/\/$/, "");
}

/** Async variant kept for server components and actions. */
export async function getSiteUrl() {
  return getSiteUrlFromEnv();
}
