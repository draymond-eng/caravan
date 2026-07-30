/* Caravan - service worker. App-shell caching so the app opens offline.
   Bump CACHE when you change core files. */
const CACHE = "caravan-v17";
const CORE = [
  "./",
  "./index.html",
  "./css/styles.css",
  "./js/app.js",
  "./js/config.js",
  "./js/backend.js",
  "./manifest.webmanifest",
  "./assets/icon.svg",
  "./assets/icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

// Let the page trigger immediate activation of a freshly-installed worker.
self.addEventListener("message", (e) => { if (e.data === "skip-waiting") self.skipWaiting(); });

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* ---- Push notifications ---------------------------------------------------
   A host posts an update and every installed phone on that trip gets it on the
   lock screen. Tapping the notification opens straight to that trip.
   -------------------------------------------------------------------------- */
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.title || "SquadTrip", {
    body: d.body || "",
    icon: "./assets/icon-512.png",
    badge: "./assets/icon-512.png",
    tag: d.tag || "squadtrip",
    renotify: true,
    data: { url: d.url || "./" },
  }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const target = (e.notification.data && e.notification.data.url) || "./";
  e.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
    const hit = wins.find((w) => w.url.indexOf(target) !== -1);
    if (hit) return hit.focus();
    return clients.openWindow(target);
  }));
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Same-origin app shell: NETWORK-FIRST so an actively-developed app always
  // shows the latest build when online; fall back to cache when offline.
  if (url.origin === location.origin) {
    e.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      }).catch(() => caches.match(req).then((hit) => hit || caches.match("./index.html")))
    );
    return;
  }
  // Cross-origin (map tiles, Leaflet): network-first, cache as backup.
  e.respondWith(
    fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match(req))
  );
});
