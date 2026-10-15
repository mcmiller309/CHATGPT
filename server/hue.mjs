import https from 'node:https';
import { readFileSync } from 'node:fs';
import { isIP } from 'node:net';
export const allowedActions = ['Red', 'Blue', 'Purple', 'Green', 'Warm white', 'Flash', 'Pulse', 'Blackout', 'Brightness'];
const xy = { Red: { x: .675, y: .322 }, Blue: { x: .167, y: .04 }, Purple: { x: .265, y: .115 }, Green: { x: .409, y: .518 } };
export function makePayload(light, action, brightness) {
  if (!allowedActions.includes(action) || !Number.isFinite(brightness) || brightness < 0 || brightness > 100) throw new Error('Invalid lighting action');
  if (action === 'Blackout') return { on: { on: false } };
  if (action === 'Flash') {
    if (!light.signaling?.signal_values?.includes('on_off')) throw new Error('Flash is unsupported by this light');
    return { signaling: { signal: 'on_off', duration: 2400 } };
  }
  if (action === 'Pulse') {
    if (!light.effects?.effect_values?.includes('breathe')) throw new Error('Pulse is unsupported by this light');
    return { on: { on: true }, effects: { effect: 'breathe' } };
  }
  const payload = { on: { on: brightness > 0 } };
  if (light.dimming) payload.dimming = { brightness: Math.max(light.dimming.min_dim_level ?? .1, brightness) };
  else if (action === 'Brightness') throw new Error('Brightness is unsupported by this light');
  if (light.effects?.effect_values?.includes('no_effect')) payload.effects = { effect: 'no_effect' };
  if (action === 'Warm white') {
    if (!light.color_temperature) throw new Error('Warm white is unsupported by this light');
    const schema = light.color_temperature.mirek_schema;
    payload.color_temperature = { mirek: Math.min(schema?.mirek_maximum ?? 500, Math.max(schema?.mirek_minimum ?? 153, 370)) };
  } else if (xy[action]) {
    if (!light.color) throw new Error('Color is unsupported by this light');
    payload.color = { xy: xy[action] }; // Bridge clamps to the light's supported gamut.
  }
  return payload;
}
export function createHue(env = process.env) {
  let options;
  function configuration() {
    if (options) return options;
    const ip = env.HUE_BRIDGE_IP;
    if (!ip || isIP(ip) !== 4 || !/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip)) throw new Error('Configure a private IPv4 HUE_BRIDGE_IP');
    if (!env.HUE_APPLICATION_KEY || !/^[a-zA-Z0-9_-]{10,128}$/.test(env.HUE_APPLICATION_KEY)) throw new Error('Configure HUE_APPLICATION_KEY in the local .env');
    if (!env.HUE_CA_CERT_PATH || !/^[a-fA-F0-9]{16}$/.test(env.HUE_BRIDGE_ID ?? '')) throw new Error('Configure a trusted Hue CA PEM and 16-digit bridge ID for verified TLS');
    options = { hostname: ip, servername: env.HUE_BRIDGE_ID.toLowerCase(), ca: readFileSync(env.HUE_CA_CERT_PATH), rejectUnauthorized: true, port: 443, headers: { 'hue-application-key': env.HUE_APPLICATION_KEY, 'Content-Type': 'application/json' } };
    return options;
  }
  function request(method, path, body) {
    const config = configuration();
    return new Promise((resolve, reject) => {
      const req = https.request({ ...config, method, path: `/clip/v2/resource/${path}` }, res => {
        let text = '';
        res.on('data', chunk => { text += chunk; if (text.length > 1_000_000) req.destroy(new Error('Response too large')); });
        res.on('end', () => {
          try { const result = JSON.parse(text); if (res.statusCode !== 200 || !Array.isArray(result.errors) || result.errors.length) throw new Error(); resolve(result.data); }
          catch { reject(new Error('Hue request rejected; check bridge authentication and capabilities')); }
        });
      });
      req.setTimeout(5000, () => req.destroy(new Error('timeout')));
      req.on('error', () => reject(new Error('Hue connection failed; check address, trusted certificate, bridge ID and connectivity')));
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  }
  return { discover: () => request('GET', 'light'), write: (id, body) => request('PUT', `light/${id}`, body) };
}
export function publicLight(light) {
  return { id: light.id, name: light.metadata?.name ?? 'Hue light', actions: allowedActions.filter(action => { try { makePayload(light, action, 80); return true; } catch { return false; } }) };
}
