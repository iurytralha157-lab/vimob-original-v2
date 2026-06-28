const META_OAUTH_PARAMS = [
  "meta_oauth_data",
  "meta_oauth_status",
  "meta_oauth_flow_id",
  "meta_oauth_error",
];

export function stripMetaOAuthParams(url: URL): URL {
  const cleanUrl = new URL(url.toString());

  for (const param of META_OAUTH_PARAMS) {
    cleanUrl.searchParams.delete(param);
  }

  if (cleanUrl.hash === "#_=_") {
    cleanUrl.hash = "";
  }

  return cleanUrl;
}

export function buildMetaOAuthReturnUrl(): string {
  const cleanUrl = stripMetaOAuthParams(new URL(window.location.href));
  cleanUrl.searchParams.set("tab", "integrations");
  return cleanUrl.toString();
}

export function replaceCurrentUrlWithoutMetaOAuthParams(): void {
  const cleanUrl = stripMetaOAuthParams(new URL(window.location.href));
  const cleanPath = `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`;

  if (cleanPath !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
    window.history.replaceState({}, "", cleanPath);
  }
}

export function parseMetaOAuthPayload(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch (_rawError) {
    return JSON.parse(decodeURIComponent(raw));
  }
}
