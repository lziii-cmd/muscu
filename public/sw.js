/*
 * Service worker écrit à la main.
 *
 * Stratégie, volontairement minimale :
 *   - la coquille de l'application est précachée pour que l'app s'ouvre sans
 *     réseau, en salle à 23h ;
 *   - les appels de données passent par le réseau d'abord, avec repli sur le
 *     cache : mieux vaut une donnée fraîche quand elle est disponible ;
 *   - les écritures ne passent JAMAIS par ici. Elles sont mises en file dans
 *     IndexedDB côté application, ce qui survit à un onglet fermé.
 */

const VERSION = "v1";
const SHELL_CACHE = `muscu-shell-${VERSION}`;
const DATA_CACHE = `muscu-data-${VERSION}`;

const SHELL_ASSETS = ["/", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== SHELL_CACHE && key !== DATA_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  // Les écritures sont gérées par la file d'attente applicative.
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Ne jamais mettre en cache la synchronisation ni l'authentification.
  if (url.pathname.startsWith("/api/sync") || url.pathname.startsWith("/api/auth")) return;

  const isNavigation = request.mode === "navigate";

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          const cacheName = isNavigation ? SHELL_CACHE : DATA_CACHE;
          caches.open(cacheName).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        if (isNavigation) {
          const shell = await caches.match("/");
          if (shell) return shell;
        }
        return new Response("Hors ligne", {
          status: 503,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      }),
  );
});
