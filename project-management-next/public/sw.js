const CACHE_PREFIX = 'incaptta-pro-'
const CACHE_NAME = `${CACHE_PREFIX}v2`
const PRECACHE_ASSETS = [
  '/',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-192-maskable.png',
  '/icons/icon-512-maskable.png',
  '/icons/chat-192.png',
  '/icon.png',
]

function isCacheableRequest(request) {
  const url = new URL(request.url)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
  if (url.origin !== self.location.origin) return false
  if (
    url.hostname.includes('firestore.googleapis.com') ||
    url.hostname.includes('securetoken.googleapis.com') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('firebaseio.com') ||
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/_next/webpack-hmr')
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
            console.warn('[ServiceWorker] Precache skipped:', asset, err)
          })
        )
      )
    )
  )
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME) {
              console.log('[ServiceWorker] Deleting old cache:', cacheName)
              return caches.delete(cacheName)
            }
          })
        )
      )
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return
  if (!isCacheableRequest(event.request)) return

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.status === 200 && response.type === 'basic') {
          const responseToCache = response.clone()
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache).catch((err) => {
              console.warn('[ServiceWorker] Cache put skipped:', err)
            })
          })
        }
        return response
      })
      .catch(async () => {
        const cachedResponse = await caches.match(event.request)
        if (cachedResponse) return cachedResponse
        if (event.request.mode === 'navigate') {
          const homeFallback = await caches.match('/')
          if (homeFallback) return homeFallback
        }
        return Response.error()
      })
  )
})
