// Service worker pour GitHub Pages : cache l'application ET deck.pdf.
// Si tu modifies l'interface et que l'iPad garde une ancienne version,
// incrémente CACHE_VERSION (kiosk-v1 -> kiosk-v2).
const CACHE_VERSION = "github-kiosk-v1";
const SHELL_CACHE = `pdf-kiosk-shell-${CACHE_VERSION}`;
const PDF_CACHE = `pdf-kiosk-pdf-${CACHE_VERSION}`;

const BASE = new URL("./", self.registration.scope);
const urlFor = (path) => new URL(path, BASE).href;
const DECK_URL = urlFor("deck.pdf");

const SHELL_ASSETS = [
  "./",
  "index.html",
  "app.js",
  "styles.css",
  "vendor/pdf.min.mjs",
  "vendor/pdf.worker.min.mjs",
  "manifest.webmanifest",
  "icon.svg"
].map(urlFor);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith("pdf-kiosk-") && key !== SHELL_CACHE && key !== PDF_CACHE)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

async function cachePdf(event) {
  const cache = await caches.open(PDF_CACHE);
  const cached = await cache.match(event.request);

  const network = fetch(event.request, { cache: "reload" })
    .then(async (response) => {
      if (response && response.ok) await cache.put(event.request, response.clone());
      return response;
    })
    .catch(() => null);

  // Offline et rapide : la copie locale est prioritaire.
  if (cached) {
    event.waitUntil(network);
    return cached;
  }

  const fresh = await network;
  return fresh || new Response("PDF indisponible hors ligne : ouvre-le une première fois avec Internet.", { status: 503 });
}

async function shellStrategy(event) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(event.request);
  if (cached) return cached;

  try {
    const response = await fetch(event.request);
    if (response && response.ok) await cache.put(event.request, response.clone());
    return response;
  } catch {
    if (event.request.mode === "navigate") {
      return (await cache.match(urlFor("index.html"))) || Response.error();
    }
    return Response.error();
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.href.split("#")[0] === DECK_URL) {
    event.respondWith(cachePdf(event));
  } else {
    event.respondWith(shellStrategy(event));
  }
});
