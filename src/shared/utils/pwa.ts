export function isStaticAsset(url: string): boolean {
  try {
    const u = new URL(url);
    return /\.(?:js|css|woff2?|png|svg|ico|webmanifest)$/.test(u.pathname);
  } catch {
    return false;
  }
}

export function isApiGetRequest(request: Request): boolean {
  try {
    const u = new URL(request.url);
    return u.pathname.startsWith('/api/') && request.method === 'GET';
  } catch {
    return false;
  }
}