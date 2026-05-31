/**
 * CoachOS Service Worker — handles push notifications and offline caching.
 *
 * Push payload format:
 *   { title, body, url, icon }
 */

const CACHE_NAME = "coachos-v1";
const PRECACHE_URLS = ["/", "/offline"];

// Install — pre-cache shell
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS).catch(() => {}))
  );
  self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Push — show notification
self.addEventListener("push", (event) => {
  let data = { title: "CoachOS", body: "New activity", url: "/", icon: "/icon-192.png" };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch { /* ignore parse error */ }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body:  data.body,
      icon:  data.icon ?? "/icon-192.png",
      badge: "/icon-192.png",
      data:  { url: data.url ?? "/" },
      vibrate: [200, 100, 200],
      tag:  "coachos-push",
      renotify: true,
    })
  );
});

// Notification click — focus or open the deep-link URL
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((c) => c.url.includes(self.location.origin));
      if (existing) return existing.focus().then((c) => c.navigate(url));
      return self.clients.openWindow(url);
    })
  );
});
