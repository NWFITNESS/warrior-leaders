// Judge app offline support (scope /judge).
// - The /judge page: network first (3 s), falls back to the copy saved on this phone.
// - Next.js build files (/_next/static, hashed so they never change), fonts and brand images: saved on first use.
// - Everything else (Supabase calls etc.) is left alone: the app already keeps scores on the phone and syncs them.
const CACHE = 'wl-judge-v1'
const PAGE = '/judge'

// Save the page plus every script/style it references, so it can boot with no signal.
async function savePage(res) {
  const cache = await caches.open(CACHE)
  await cache.put(PAGE, res.clone())
  const html = await res.clone().text()
  const assets = [...new Set([...html.matchAll(/(?:src|href)="(\/(?:_next\/static|brand)\/[^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, '&')))]
  await Promise.all(assets.map(async (url) => {
    if (await cache.match(url)) return
    try { const r = await fetch(url); if (r.ok) await cache.put(url, r) } catch { /* next time */ }
  }))
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    try { const res = await fetch(PAGE, { cache: 'no-store' }); if (res.ok) await savePage(res) } catch { /* offline at install */ }
    await self.skipWaiting()
  })())
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith('wl-judge-') && key !== CACHE) await caches.delete(key)
    await self.clients.claim()
  })())
})

// The page tells us which files it actually loaded (lazy chunks the HTML doesn't list).
self.addEventListener('message', (event) => {
  const urls = event.data && event.data.type === 'cache-urls' ? event.data.urls : null
  if (!Array.isArray(urls)) return
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE)
    await Promise.all(urls.map(async (url) => {
      try {
        const u = new URL(url, self.location.origin)
        if (u.origin !== self.location.origin || !isStatic(u.pathname)) return
        if (await cache.match(u.pathname + u.search)) return
        const r = await fetch(u.pathname + u.search)
        if (r.ok) await cache.put(u.pathname + u.search, r)
      } catch { /* ignore */ }
    }))
  })())
})

const isStatic = (path) => path.startsWith('/_next/static/') || path.startsWith('/brand/') || /\.(?:woff2?|svg|png|ico)$/.test(path)

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  // the judge page itself
  if (req.mode === 'navigate' && (url.pathname === PAGE || url.pathname === PAGE + '/')) {
    event.respondWith((async () => {
      const timeout = new Promise((resolve) => setTimeout(() => resolve(null), 3000))
      const network = fetch(req).then(async (res) => { if (res.ok) await savePage(res.clone()); return res }).catch(() => null)
      const res = await Promise.race([network, timeout])
      if (res) return res
      const cached = await caches.match(PAGE)
      return cached || (await network) || new Response('Offline: open the judge page once with signal first.', { status: 503, headers: { 'Content-Type': 'text/plain' } })
    })())
    return
  }

  // build files, fonts, images: cache first (hashed names never change)
  if (isStatic(url.pathname)) {
    event.respondWith((async () => {
      const cached = await caches.match(url.pathname + url.search)
      if (cached) return cached
      const res = await fetch(req)
      if (res.ok) { const cache = await caches.open(CACHE); await cache.put(url.pathname + url.search, res.clone()) }
      return res
    })())
  }
})
