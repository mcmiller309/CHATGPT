import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { makePayload, publicLight } from './hue.mjs';
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function createApp(hue, { now = Date.now, production = true } = {}) {
  const sessions = new Map();
  let bucket = { start: now(), count: 0 }, busy = false, lastAction = -Infinity;
  const origins = production ? ['http://127.0.0.1:3001'] : ['http://127.0.0.1:3001', 'http://127.0.0.1:5173'];
  return createServer({ requestTimeout: 15000, headersTimeout: 10000, maxHeaderSize: 8192 }, async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
    const json = (code, data) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); };
    if (req.headers.host !== '127.0.0.1:3001') return json(403, { error: 'Invalid host' });
    const path = req.url;
    if (!path?.startsWith('/api/')) {
      if (req.method !== 'GET') return json(405, { error: 'Method not allowed' });
      try {
        const relative = path === '/' ? 'index.html' : decodeURIComponent(path.slice(1));
        const file = resolve('dist', relative);
        if (!file.startsWith(resolve('dist') + '/') || relative.startsWith('.')) return json(404, { error: 'Not found' });
        const content = await readFile(file);
        const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
        if (!types[extname(file)]) return json(404, { error: 'Not found' });
        res.writeHead(200, { 'Content-Type': types[extname(file)] }); res.end(content);
      } catch { json(404, { error: 'Build the dashboard first' }); }
      return;
    }
    // Custom header prevents simple cross-origin requests; no CORS permission is emitted.
    if (req.headers['x-royalls-client'] !== 'dashboard' || (req.headers.origin && !origins.includes(req.headers.origin)) || (req.headers['sec-fetch-site'] && !['same-origin', 'none'].includes(req.headers['sec-fetch-site']))) return json(403, { error: 'Untrusted browser request' });
    if (now() - bucket.start > 60_000) bucket = { start: now(), count: 0 };
    if (++bucket.count > 120) return json(429, { error: 'Request limit exceeded; wait one minute' });
    for (const [key, session] of sessions) if (session.expires < now()) sessions.delete(key);
    if (path === '/api/session' && req.method === 'GET') {
      if (sessions.size >= 20) return json(429, { error: 'Session limit exceeded' });
      const token = randomBytes(32).toString('hex');
      sessions.set(token, { expires: now() + 15 * 60_000, live: false, lastAction: -Infinity });
      return json(200, { token });
    }
    const session = sessions.get(req.headers.authorization?.replace(/^Bearer /, ''));
    if (!session) return json(401, { error: 'Session expired; reconnect to Hue' });
    try {
      if (path === '/api/lights' && req.method === 'GET') return json(200, { lights: (await hue.discover()).map(publicLight) });
      if (req.method !== 'POST' || req.headers['content-type'] !== 'application/json') return json(405, { error: 'JSON POST required' });
      let body = '';
      for await (const chunk of req) { body += chunk; if (body.length > 2048) return json(413, { error: 'Request too large' }); }
      let data;
      try { data = JSON.parse(body); } catch { return json(400, { error: 'Invalid JSON' }); }
      if (!data || typeof data !== 'object' || Array.isArray(data)) return json(400, { error: 'Invalid request' });
      if (path === '/api/mode') {
        if (typeof data.live !== 'boolean' || (data.live && data.confirmation !== 'ENABLE PHYSICAL CONTROL')) return json(400, { error: 'Explicit physical-control confirmation required' });
        session.live = data.live;
        return json(200, { live: session.live });
      }
      if (path !== '/api/action') return json(404, { error: 'Not found' });
      if (!session.live) return json(403, { error: 'Physical control is disabled' });
      if (!uuid.test(data.lightId ?? '')) return json(400, { error: 'Invalid light ID' });
      if (busy || now() - lastAction < 800) return json(429, { error: 'Lighting commands are limited; wait before retrying' });
      busy = true;
      try {
        const light = (await hue.discover()).find(light => light.id === data.lightId);
        if (!light) return json(404, { error: 'Selected light is unavailable' });
        let payload;
        try { payload = makePayload(light, data.action, data.brightness); } catch (error) { return json(400, { error: error.message }); }
        // Check again after asynchronous discovery in case this session was disarmed.
        if (!session.live || session.expires < now()) return json(403, { error: 'Physical control is disabled' });
        session.lastAction = now(); lastAction = now();
        await hue.write(light.id, payload);
        return json(200, { accepted: true });
      } finally { busy = false; }
    } catch { return json(502, { error: 'Hue unavailable. Check local .env, bridge authentication, trusted CA, bridge ID and network.' }); }
  });
}
