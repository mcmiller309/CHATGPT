import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import http from 'node:http';
import https from 'node:https';
import { EventEmitter } from 'node:events';
import { createApp } from './app.mjs';
import { createHue, makePayload, publicLight } from './hue.mjs';
const id = '12345678-1234-1234-1234-123456789abc';
const light = { id, metadata: { name: 'Desk' }, color: {}, dimming: { min_dim_level: .1 }, color_temperature: {}, signaling: { signal_values: ['on_off'] }, effects: { effect_values: ['breathe', 'no_effect'] } };
let server, port, hue, clock;
function request(path, { method = 'GET', body, token, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path: `/api/${path}`, method, headers: { Host: '127.0.0.1:3001', Origin: 'http://127.0.0.1:3001', 'X-Royalls-Client': 'dashboard', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers } }, res => {
      let data = ''; res.on('data', chunk => data += chunk); res.on('end', () => resolve({ status: res.statusCode, data: JSON.parse(data), headers: res.headers }));
    });
    req.on('error', reject); req.end(body === undefined ? undefined : JSON.stringify(body));
  });
}
async function session() { return (await request('session')).data.token; }
async function enable(token) { return request('mode', { method: 'POST', token, body: { live: true, confirmation: 'ENABLE PHYSICAL CONTROL' } }); }
const command = { lightId: id, action: 'Red', brightness: 80 };
beforeEach(async () => {
  clock = 1000;
  hue = { discover: vi.fn().mockResolvedValue([light]), write: vi.fn().mockResolvedValue([]) };
  server = createApp(hue, { now: () => clock });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); port = server.address().port;
});
afterEach(async () => { vi.restoreAllMocks(); await new Promise(resolve => server.close(resolve)); });
describe('local API security and Hue routing (mock bridge only)', () => {
  it('rejects hostile origin, DNS rebinding, cross-site requests, and missing custom header', async () => {
    for (const headers of [{ Origin: 'https://evil.example' }, { Host: 'evil.example:3001' }, { 'Sec-Fetch-Site': 'cross-site' }, { 'X-Royalls-Client': '' }]) expect((await request('session', { headers })).status).toBe(403);
    expect(hue.discover).not.toHaveBeenCalled();
  });
  it('requires a session and explicit confirmation; discovery is read-only', async () => {
    expect((await request('lights')).status).toBe(401);
    const token = await session();
    const result = await request('lights', { token });
    expect(result.data.lights[0].name).toBe('Desk');
    expect(result.headers['access-control-allow-origin']).toBeUndefined();
    expect((await request('action', { method: 'POST', token, body: command })).status).toBe(403);
    expect((await request('mode', { method: 'POST', token, body: { live: true } })).status).toBe(400);
    expect(hue.write).not.toHaveBeenCalled();
  });
  it('routes a validated command only after confirmation and blocks after disabling', async () => {
    const token = await session(); await enable(token);
    expect((await request('action', { method: 'POST', token, body: command })).status).toBe(200);
    expect(hue.write).toHaveBeenCalledWith(id, expect.objectContaining({ color: { xy: { x: .675, y: .322 } } }));
    expect((await request('action', { method: 'POST', token, body: command })).status).toBe(429);
    await request('mode', { method: 'POST', token, body: { live: false } }); clock += 1000;
    expect((await request('action', { method: 'POST', token, body: command })).status).toBe(403);
    expect(hue.write).toHaveBeenCalledTimes(1);
  });
  it('rejects invalid data, unknown devices and unsupported effects without writes', async () => {
    const token = await session(); await enable(token);
    for (const body of [{ ...command, lightId: '../secret' }, { ...command, brightness: 101 }, { ...command, brightness: '80' }, { ...command, action: '__proto__' }]) expect((await request('action', { method: 'POST', token, body })).status).toBe(400);
    hue.discover.mockResolvedValue([{ id }]);
    expect((await request('action', { method: 'POST', token, body: { ...command, action: 'Pulse' } })).status).toBe(400);
    expect((await request('action', { method: 'POST', token, body: { ...command, lightId: '00000000-0000-0000-0000-000000000000' } })).status).toBe(404);
    expect(hue.write).not.toHaveBeenCalled();
  });
  it('expires sessions and sanitizes upstream errors', async () => {
    const token = await session(); await enable(token);
    hue.discover.mockRejectedValue(new Error('secret-key-upstream-error'));
    const result = await request('lights', { token });
    expect(result.status).toBe(502); expect(JSON.stringify(result)).not.toContain('secret-key');
    clock += 16 * 60_000;
    expect((await request('action', { method: 'POST', token, body: command })).status).toBe(401);
    expect(hue.write).not.toHaveBeenCalled();
  });
  it('rate limits API requests', async () => {
    const token = await session();
    for (let i = 0; i < 119; i++) await request('unknown', { token });
    expect((await request('lights', { token })).status).toBe(429);
  });
  it('blocks a command disarmed while discovery is in progress', async () => {
    const token = await session(); await enable(token);
    let release;
    hue.discover.mockImplementation(() => new Promise(resolve => { release = resolve; }));
    const pending = request('action', { method: 'POST', token, body: command });
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    await request('mode', { method: 'POST', token, body: { live: false } }); release([light]);
    expect((await pending).status).toBe(403); expect(hue.write).not.toHaveBeenCalled();
  });
});
describe('Hue capability translation and TLS', () => {
  it('uses bridge-native bounded flash, supported pulse and blackout', () => {
    expect(makePayload(light, 'Flash', 80)).toEqual({ signaling: { signal: 'on_off', duration: 2400 } });
    expect(makePayload(light, 'Pulse', 80).effects).toEqual({ effect: 'breathe' });
    expect(makePayload(light, 'Blackout', 80)).toEqual({ on: { on: false } });
    expect(makePayload(light, 'Warm white', 80).color_temperature.mirek).toBe(370);
    expect(publicLight({ id }).actions).toEqual(['Blackout']);
  });
  it('fails closed without trusted certificate configuration', () => {
    expect(() => createHue({}).discover()).toThrow('HUE_BRIDGE_IP');
    expect(() => createHue({ HUE_BRIDGE_IP: '192.168.1.249', HUE_APPLICATION_KEY: 'example-test-key' }).discover()).toThrow('trusted Hue CA');
  });
  it('uses certificate-chain and hostname verification and never follows redirects', async () => {
    let options;
    vi.spyOn(https, 'request').mockImplementation((config, callback) => {
      options = config;
      const req = new EventEmitter(); req.setTimeout = () => {}; req.end = () => {
        const res = new EventEmitter(); res.statusCode = 302; callback(res); res.emit('data', '{"errors":[],"data":[]}'); res.emit('end');
      }; return req;
    });
    // Public fixture text is only used by a mocked request; no TLS connection is made.
    const bridge = createHue({ HUE_BRIDGE_IP: '192.168.1.249', HUE_APPLICATION_KEY: 'example-test-key', HUE_CA_CERT_PATH: 'server/hue.mjs', HUE_BRIDGE_ID: '001788fffe123456' });
    await expect(bridge.discover()).rejects.toThrow('rejected');
    expect(options.rejectUnauthorized).toBe(true);
    expect(options.servername).toBe('001788fffe123456');
    expect(options.checkServerIdentity).toBeUndefined(); // Node's secure default remains in effect.
  });
});
