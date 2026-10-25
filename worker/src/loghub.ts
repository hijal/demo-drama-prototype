import { DurableObject } from 'cloudflare:workers'
export class LogHub extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    ctx.storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS logs (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, job TEXT, line TEXT NOT NULL)',
    )
  }
  append(job: string, lines: string[]) {
    for (const line of lines.slice(0, 30)) {
      const at = Date.now(),
        text = line.slice(0, 1000)
      const row = this.ctx.storage.sql
        .exec<{ id: number }>(
          'INSERT INTO logs (at,job,line) VALUES (?,?,?) RETURNING id',
          at,
          job,
          text,
        )
        .one()
      const message = JSON.stringify({ ...row, at, job, line: text })
      for (const socket of this.ctx.getWebSockets())
        try {
          socket.send(message)
        } catch {
          socket.close(1011)
        }
    }
    this.ctx.storage.sql.exec(
      'DELETE FROM logs WHERE id NOT IN (SELECT id FROM logs ORDER BY id DESC LIMIT 500)',
    )
  }
  async fetch(request: Request) {
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket')
      return Response.json(
        this.ctx.storage.sql
          .exec('SELECT * FROM logs ORDER BY id DESC LIMIT 500')
          .toArray()
          .reverse(),
      )
    const pair = new WebSocketPair()
    this.ctx.acceptWebSocket(pair[1])
    pair[1].send(
      JSON.stringify({
        history: this.ctx.storage.sql
          .exec('SELECT * FROM logs ORDER BY id DESC LIMIT 500')
          .toArray()
          .reverse(),
      }),
    )
    return new Response(null, { status: 101, webSocket: pair[0] })
  }
  webSocketMessage(socket: WebSocket, message: string | ArrayBuffer) {
    if (message === 'ping') socket.send('pong')
  }
  webSocketClose(socket: WebSocket, code: number) {
    socket.close(code)
  }
}
