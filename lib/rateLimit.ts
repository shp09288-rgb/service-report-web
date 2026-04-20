// Lightweight in-memory per-IP rate limiter for admin routes.
// Resets on server restart; sufficient for abuse deterrence in a low-traffic
// internal tool. Not a substitute for infrastructure-level rate limiting.

interface Bucket {
  count: number
  resetAt: number
}

const store = new Map<string, Bucket>()

const WINDOW_MS  = 60_000  // 1 minute
const MAX_HITS   = 10      // requests per window per IP

export function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const bucket = store.get(ip)

  if (!bucket || now > bucket.resetAt) {
    store.set(ip, { count: 1, resetAt: now + WINDOW_MS })
    return true
  }

  bucket.count++
  if (bucket.count > MAX_HITS) return false
  return true
}

export function getClientIp(req: Request): string {
  const forwarded = (req.headers as Headers).get('x-forwarded-for')
  return (forwarded?.split(',')[0] ?? 'unknown').trim()
}
