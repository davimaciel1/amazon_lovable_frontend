import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Carrega variáveis do .env (inclui .env.local)
  const env = loadEnv(mode, process.cwd(), '');
  const backend = env.VITE_BACKEND_URL || 'http://localhost:8080';

  return ({
    server: {
      host: "::",
      port: 8087,
      hmr: {
        protocol: 'ws',
        host: 'localhost',
        port: 8087,
        overlay: true,
      },
      watch: {
        usePolling: true,  // For Windows compatibility
        interval: 100,
      },
      proxy: ( () => {
        return {
          '/api/copilotkit': {
            target: backend,
            changeOrigin: true,
            secure: false,
            configure: (proxy, options) => {
              proxy.on('error', (err, req, res) => {
                console.log('copilot proxy error', err);
              });
              proxy.on('proxyReq', (proxyReq, req, res) => {
                console.log('Proxying copilot:', req.method, req.url, '->', options.target + req.url);
              });
            },
          },
          '/api': {
            target: backend,
            changeOrigin: true,
            secure: false,
            configure: (proxy, options) => {
              proxy.on('error', (err, req, res) => {
                console.log('proxy error', err);
              });
              proxy.on('proxyReq', (proxyReq, req, res) => {
                console.log('Proxying:', req.method, req.url, '->', options.target + req.url);
              });
            },
          },
          '/app': {
            target: backend,
            changeOrigin: true,
            secure: false,
            configure: (proxy, options) => {
              proxy.on('error', (err, req, res) => {
                console.log('App proxy error', err);
              });
              proxy.on('proxyReq', (proxyReq, req, res) => {
                console.log('Proxying app route:', req.method, req.url, '->', options.target + req.url);
              });
            },
          },
          '/product-images': {
            target: backend,
            changeOrigin: true,
            secure: false,
            configure: (proxy, options) => {
              proxy.on('error', (err, req, res) => {
                console.log('Product images proxy error', err);
              });
              proxy.on('proxyReq', (proxyReq, req, res) => {
                console.log('Proxying product image:', req.method, req.url, '->', options.target + req.url);
              });
            },
          },
          '/img': {
            target: backend,
            changeOrigin: true,
            secure: false,
          }
        };
      })()
    },
    plugins: [
      react(),
      mode === 'development' &&
      componentTagger(),
    ].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  });
});
