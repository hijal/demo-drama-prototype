#!/usr/bin/env node
/** Svelte frontend + existing ComfyUI API, on one port for local use and Colab. */
const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')
const { pipeline } = require('node:stream')
const dev = process.argv.includes('--dev')
process.env.NODE_ENV = dev ? 'development' : 'production'
process.env.NEXT_TELEMETRY_DISABLED = '1'
const hostname = process.env.BIND_HOST || '127.0.0.1'
const port = Number(process.env.PORT || 3000)
const dist = path.join(__dirname, 'web', 'dist')
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
}
function serveFrontend(req, res) {
  if (!['GET', 'HEAD'].includes(req.method)) {
    res.writeHead(405, { Allow: 'GET, HEAD' })
    res.end()
    return
  }
  let pathname
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname)
  } catch {
    res.writeHead(400)
    res.end()
    return
  }
  if (
    pathname.includes('\0') ||
    pathname.split('/').some((segment) => segment.startsWith('.'))
  ) {
    res.writeHead(404)
    res.end()
    return
  }
  let file = path.resolve(dist, '.' + pathname)
  if (file !== dist && !file.startsWith(dist + path.sep)) {
    res.writeHead(404)
    res.end()
    return
  }
  let stat
  try {
    stat = fs.statSync(file)
    if (!stat.isFile()) stat = undefined
  } catch {}
  if (!stat) {
    if (path.extname(pathname)) {
      res.writeHead(404)
      res.end()
      return
    }
    file = path.join(dist, 'index.html')
    try {
      stat = fs.statSync(file)
    } catch {
      res.writeHead(503, { 'Content-Type': 'text/plain' })
      res.end('Frontend build missing. Run npm run build.')
      return
    }
  }
  res.writeHead(200, {
    'Content-Type': mime[path.extname(file)] || 'application/octet-stream',
    'Content-Length': stat.size,
    'Cache-Control': file.includes(path.sep + 'assets' + path.sep)
      ? 'public, max-age=31536000, immutable'
      : 'no-cache',
    'X-Content-Type-Options': 'nosniff',
  })
  if (req.method === 'HEAD') {
    res.end()
    return
  }
  pipeline(fs.createReadStream(file), res, () => {})
}
async function start() {
  const next = require('next')
  const app = next({
    dir: __dirname,
    hostname,
    port,
    dev,
    webpack: true,
    turbopack: false,
  })
  await app.prepare()
  const handleApi = app.getRequestHandler()
  let vite
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname
    const pipelineUrl = process.env.PIPELINE_URL || (dev ? 'http://127.0.0.1:8790' : '')
    if (pipelineUrl && /^\/api\/(projects|status|media|gpu)(?:\/|$|\?)/.test(req.url)) {
      if (!['GET', 'HEAD'].includes(req.method) && !req.url.startsWith('/api/gpu/') && req.headers.origin !== `http://${req.headers.host}`) {
        res.writeHead(403, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({error:'Cross-origin write rejected'})); return
      }
      const target = new URL(req.url, pipelineUrl)
      if (target.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(target.hostname)) {
        res.writeHead(503); res.end('Local pipeline proxy requires a loopback HTTP endpoint'); return
      }
      const upstream = http.request(target, {method:req.method,headers:{...req.headers,host:target.host,origin:target.origin}}, response => {
        res.writeHead(response.statusCode || 502, response.headers); response.pipe(res)
      })
      upstream.on('error', () => { if(!res.headersSent) res.writeHead(502,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Pipeline backend is unavailable. Start npm run dev:pipeline.'})) })
      req.on('aborted', () => upstream.destroy()); req.pipe(upstream); return
    }
    if (pathname === '/api' || pathname.startsWith('/api/')) {
      void handleApi(req, res)
      return
    }
    if (dev)
      vite.middlewares(req, res, () => {
        res.writeHead(404)
        res.end()
      })
    else serveFrontend(req, res)
  })
  if (dev) {
    const { createServer } = await import(
      require.resolve('vite', { paths: [path.join(__dirname, 'web')] })
    )
    vite = await createServer({
      configFile: path.join(__dirname, 'web', 'vite.config.ts'),
      root: path.join(__dirname, 'web'),
      server: { middlewareMode: true, ws: { server } },
    })
  }
  server.listen(port, hostname, () =>
    console.log(`Svelte Studio: http://${hostname}:${port}`),
  )
  server.on('error', (error) => {
    console.error(error.message)
    process.exitCode = 1
  })
  async function stop() {
    await vite?.close()
    server.close()
    await app.close()
    process.exit(0)
  }
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)
}
if (require.main === module)
  start().catch((error) => {
    console.error('Failed to start Studio:', error.message)
    process.exitCode = 1
  })
module.exports = { serveFrontend }
