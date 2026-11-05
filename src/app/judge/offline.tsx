'use client'

import { useEffect } from 'react'

/** Installs the judge app's offline copy (public/judge-sw.js) so the page opens with no signal. Production only. */
export function JudgeOffline() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return
    navigator.serviceWorker.register('/judge-sw.js', { scope: '/judge' }).then(async (reg) => {
      const sw = reg.active ?? (await navigator.serviceWorker.ready).active
      // hand over every file this page loaded, including ones the HTML doesn't list
      const urls = performance.getEntriesByType('resource').map((e) => e.name)
      sw?.postMessage({ type: 'cache-urls', urls })
    }, () => { /* not supported / blocked: the app still works online */ })
  }, [])
  return null
}
