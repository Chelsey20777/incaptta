const CACHE_NAME = 'incaptta-mbdi-v2'
const PRECACHE_ASSETS = [
  '/manifest.json',
  '/icon.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-192-maskable.png',
  '/icons/icon-512-maskable.png',
]

function isCacheableRequest(request) {
  if (request.method !== 'GET') return false
  const url = new URL(request.url)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
  if (url.origin !== self.location.origin) return false
  if (
    url.hostname.includes('firestore.googleapis.com') ||
    url.hostname.includes('securetoken.googleapis.com') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('firebaseio.com') ||
    url.hostname.includes('gstatic.com') ||
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/_next/webpack-hmr') ||
    url.pathname.includes('firebase-messaging-sw')
  ) {
    return false
  }
  return true
}

self.addEventListener('install', (event) => {
  self.skipWaiting()
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(
        PRECACHE_ASSETS.map((asset) =>
          cache.add(asset).catch((err) => {
            console.warn('[MBDI SW] Precache skipped:', asset, err)
          })
        )
      )
    )
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME) {
              console.log('[MBDI SW] Deleting old cache:', cacheName)
              return caches.delete(cacheName)
            }
          })
        )
      )
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  if (!isCacheableRequest(event.request)) return

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.status === 200 && response.type === 'basic') {
          const responseToCache = response.clone()
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache).catch(() => {})
          })
        }
        return response
      })
      .catch(async () => {
        const cached = await caches.match(event.request)
        if (cached) return cached
        if (event.request.mode === 'navigate') {
          return caches.match('/') || caches.match('/initiatives')
        }
        throw new Error('Offline and not cached')
      })
  )
})
