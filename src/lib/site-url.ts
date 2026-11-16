const DEVELOPMENT_ORIGIN = "http://localhost:3000";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function canonicalSiteOrigin() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  const production = process.env.NODE_ENV === "production";

  if (!configured) {
    if (production) {
      throw new Error("NEXT_PUBLIC_SITE_URL is required in production and must be the canonical HTTPS origin.");
    }
    return DEVELOPMENT_ORIGIN;
  }

  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    throw new Error("NEXT_PUBLIC_SITE_URL must be an absolute HTTP(S) URL.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("NEXT_PUBLIC_SITE_URL must use HTTP or HTTPS.");
  }
  if (url.username || url.password) {
    throw new Error("NEXT_PUBLIC_SITE_URL must not contain credentials.");
  }
  if (url.href.includes("?") || url.href.includes("#")) {
    throw new Error("NEXT_PUBLIC_SITE_URL must not contain a query string or fragment.");
  }
  if (url.pathname !== "/") {
    throw new Error("NEXT_PUBLIC_SITE_URL must be an origin without a path.");
  }
  if (url.protocol === "http:" && (production || !LOCAL_HOSTS.has(url.hostname))) {
    throw new Error(production
      ? "NEXT_PUBLIC_SITE_URL must use HTTPS in production."
      : "An HTTP NEXT_PUBLIC_SITE_URL is allowed only for localhost development.");
  }

  return url.origin;
}

export function canonicalSiteUrl(path: string) {
  return new URL(path, canonicalSiteOrigin());
}
