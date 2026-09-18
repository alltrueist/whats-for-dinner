// sw.js — Service Worker
// ─────────────────────────────────────────────────────────────────────────────
// Provides offline support and caching for the PWA.
// Strategy:
//   - App shell (HTML, CSS, JS) → Cache First
//   - Firebase / API calls       → Network Only (never cache auth or data)
// ─────────────────────────────────────────────────────────────────────────────

const CACHE_NAME    = 'wfd-v1';
const CACHE_TIMEOUT = 5000; // ms before falling back to cache on slow network

// Files to cache on install (app shell)
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/css/palettes.css',
  '/css/app.css',
  '/js/config.js',
  '/js/firebase.js',
  '/js/utils.js',
  '/js/auth.js',
  '/js/db.js',
  '/js/router.js',
  '/js/state.js',
  '/js/app.js',
  '/js/screens/login.js'
];

// URLs that should NEVER be cached
const BYPASS_PATTERNS = [
  /firebaseapp\.com/,
  /googleapis\.com/,
  /gstatic\.com\/firebasejs/,
  /kroger\.com/,
  /aldi\.us/
];


// ─── Install ──────────────────────────────────────────────────────────────────

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[SW] Pre-caching app shell');
      return cache.addAll(PRECACHE_URLS).catch(err => {
        // Non-fatal: some files may not exist yet
        console.warn('[SW] Pre-cache partial failure:', err);
      });
    }).then(() => self.skipWaiting())
  );
});


// ─── Activate ─────────────────────────────────────────────────────────────────

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => {
            console.log('[SW] Deleting old cache:', key);
            return caches.delete(key);
          })
      )
    ).then(() => self.clients.claim())
  );
});


// ─── Fetch ────────────────────────────────────────────────────────────────────

self.addEventListener('fetch', event => {
  const url = event.request.url;

  // Never intercept non-GET requests or bypassed URLs
  if (event.request.method !== 'GET') return;
  if (BYPASS_PATTERNS.some(pattern => pattern.test(url))) return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      // Stale-while-revalidate: return cache immediately, update in background
      const fetchPromise = fetch(event.request)
        .then(response => {
          if (response && response.status === 200 && response.type === 'basic') {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => null);

      return cached || fetchPromise;
    })
  );
});


// ─── Push Notifications ───────────────────────────────────────────────────────

self.addEventListener('push', event => {
  if (!event.data) return;

  let data = {};
  try { data = event.data.json(); } catch { data = { title: 'What\'s for Dinner?', body: event.data.text() }; }

  const options = {
    body:    data.body    || '',
    icon:    data.icon    || '/icons/icon-192.png',
    badge:   data.badge   || '/icons/icon-192.png',
    tag:     data.tag     || 'wfd-notification',
    data:    data.url     ? { url: data.url } : {},
    actions: data.actions || []
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'What\'s for Dinner?', options)
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(windowClients => {
        const existingWindow = windowClients.find(c => c.url === url && 'focus' in c);
        if (existingWindow) return existingWindow.focus();
        if (clients.openWindow) return clients.openWindow(url);
      })
  );
});
