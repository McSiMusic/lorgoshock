const CACHE_NAME = "lorgoshock-pwa-v1";

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const scopeUrl = self.registration.scope;
    const cache = await caches.open(CACHE_NAME);
    const response = await fetch(scopeUrl, { cache: "reload" });
    if (!response.ok) throw new Error(`Unable to precache app shell: ${response.status}`);
    await cache.put(scopeUrl, response.clone());

    const html = await response.text();
    const scopePath = new URL(scopeUrl).pathname;
    const assets = Array.from(html.matchAll(/(?:src|href)=["']([^"']+)["']/g), (match) => new URL(match[1], scopeUrl))
      .filter((url) => url.origin === self.location.origin
        && url.pathname.startsWith(scopePath)
        && url.pathname.includes("/_next/static/"));
    const results = await Promise.allSettled(assets.map(async (url) => {
      const asset = await fetch(url);
      if (!asset.ok) throw new Error(`Unable to precache ${url.pathname}: ${asset.status}`);
      await cache.put(url, asset);
    }));
    for (const result of results) {
      if (result.status === "rejected") console.error("Lorgoshock offline asset could not be cached.", result.reason);
    }

    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames
      .filter((name) => name.startsWith("lorgoshock-pwa-") && name !== CACHE_NAME)
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const requestUrl = new URL(request.url);
  const scopeUrl = new URL(self.registration.scope);
  if (requestUrl.origin !== scopeUrl.origin || !requestUrl.pathname.startsWith(scopeUrl.pathname)) return;
  if (requestUrl.pathname === new URL("./service-worker.js", scopeUrl).pathname) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    if (request.mode === "navigate") {
      let response;
      try {
        response = await fetch(request);
      } catch (error) {
        const fallback = await cache.match(request) ?? await cache.match(scopeUrl);
        if (fallback) return fallback;
        throw error;
      }
      if (response.ok) {
        try {
          await cache.put(scopeUrl, response.clone());
        } catch (error) {
          console.error("Lorgoshock app page could not be cached for offline use.", error);
        }
      }
      return response;
    }

    const cached = await cache.match(request);
    const immutableAsset = requestUrl.pathname.includes("/_next/static/");
    if (cached && immutableAsset) return cached;

    let response;
    try {
      response = await fetch(request);
    } catch (error) {
      if (cached) return cached;
      throw error;
    }
    if (response.ok) {
      try {
        await cache.put(request, response.clone());
      } catch (error) {
        console.error(`Lorgoshock resource could not be cached: ${requestUrl.pathname}`, error);
      }
    }
    return response;
  })());
});
