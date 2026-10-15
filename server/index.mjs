import { createApp } from './app.mjs';
import { createHue } from './hue.mjs';
// Never log process.env, Hue credentials, or upstream response bodies.
if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0') throw new Error('TLS verification must remain enabled');
createApp(createHue(), { production: process.env.NODE_ENV !== 'development' }).listen(3001, '127.0.0.1', () => console.log('Royalls local backend: http://127.0.0.1:3001 (simulation by default)'));
