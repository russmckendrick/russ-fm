import { init } from '@plausible-analytics/tracker'

const PLAUSIBLE_DOMAIN = 'russ.fm'

let initialized = false

export function initAnalytics() {
  if (initialized || !import.meta.env.PROD) {
    return
  }

  init({
    domain: PLAUSIBLE_DOMAIN,
    autoCapturePageviews: true,
    outboundLinks: true,
    fileDownloads: true,
    formSubmissions: true,
    bindToWindow: true,
    logging: false,
  })

  initialized = true
}
