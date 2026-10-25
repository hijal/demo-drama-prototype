import { createRemoteJWKSet, jwtVerify } from 'jose'
import { timingSafeEqual } from 'node:crypto'
export async function verifySecret(provided: string, expected: string) {
  if (!expected) return false
  const encode = new TextEncoder()
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', encode.encode(provided)),
    crypto.subtle.digest('SHA-256', encode.encode(expected)),
  ])
  return timingSafeEqual(new Uint8Array(a), new Uint8Array(b))
}
export async function authorized(request: Request, env: Env) {
  if (new URL(request.url).pathname.startsWith('/api/gpu/'))
    return verifySecret(request.headers.get('X-GPU-Key') || '', env.GPU_KEY)
  if (String(env.AUTH_MODE) === 'local')
    return ['localhost', '127.0.0.1', 'studio.test', '[::1]'].includes(
      new URL(request.url).hostname,
    )
  const team = String(env.ACCESS_TEAM),
    aud = String(env.ACCESS_AUD),
    owner = String(env.OWNER_EMAIL)
  if (!team || !aud || !owner) return false
  const token = request.headers.get('Cf-Access-Jwt-Assertion')
  if (!token || !/^[a-zA-Z0-9-]+$/.test(team)) return false
  const issuer = `https://${team}.cloudflareaccess.com`
  try {
    const { payload } = await jwtVerify(
      token,
      createRemoteJWKSet(new URL(issuer + '/cdn-cgi/access/certs')),
      { issuer, audience: aud, algorithms: ['RS256'] },
    )
    return (
      typeof payload.email === 'string' &&
      payload.email.toLowerCase() === owner.toLowerCase()
    )
  } catch {
    return false
  }
}
