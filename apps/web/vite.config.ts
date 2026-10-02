/**
 * Dev serves the page here and proxies everything the server owns to it, so the
 * browser talks to one origin in development and in production alike.
 */
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * Where apps/server listens in development. `PORT=4000 bun run dev` moves
 * both, because the server reads the same variable.
 */
const SERVER_ORIGIN = `http://localhost:${process.env.PORT ?? '3001'}`;

/**
 * Set `M8_DEV_HTTPS=1` when the dev server sits behind an https reverse proxy,
 * which is how a phone gets a camera and a microphone: browsers refuse both on
 * plain http. The hot-reload socket then has to use wss on 443 rather than the
 * port Vite is actually listening on.
 */
const BEHIND_HTTPS = process.env.M8_DEV_HTTPS === '1';

/**
 * Extra hostnames the dev server answers to, from `M8_DEV_HOSTS`, comma
 * separated. A reverse proxy forwards its own Host header, and Vite refuses a
 * host it was not told about. A leading dot allows every subdomain.
 */
const EXTRA_HOSTS = (process.env.M8_DEV_HOSTS ?? '')
  .split(',')
  .map((host) => host.trim())
  .filter(Boolean);

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    // Pinned to IPv4 because a reverse proxy on this machine dials 127.0.0.1,
    // and Vite's default of 'localhost' can resolve to the IPv6 loopback alone.
    host: '127.0.0.1',
    allowedHosts: EXTRA_HOSTS,
    ...(BEHIND_HTTPS ? { hmr: { protocol: 'wss', clientPort: 443 } } : {}),
    proxy: {
      '/api': { target: SERVER_ORIGIN, changeOrigin: true },
      // The live relay: one websocket, which is the only way the browser reaches a model.
      '/live': { target: SERVER_ORIGIN.replace('http', 'ws'), ws: true, rewriteWsOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
