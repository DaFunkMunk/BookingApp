import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig(({ mode }) => {
  const rootEnv = loadEnv(mode, process.cwd(), '');
  const defaultCert = path.resolve(__dirname, '../mongo-server/certs/localhost.pem');
  const defaultKey = path.resolve(__dirname, '../mongo-server/certs/localhost-key.pem');
  const certPath = rootEnv.VITE_HTTPS_CERT || defaultCert;
  const keyPath = rootEnv.VITE_HTTPS_KEY || defaultKey;

  let httpsOptions: { cert: Buffer; key: Buffer } | undefined;
  if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
    httpsOptions = {
      cert: fs.readFileSync(certPath),
      key: fs.readFileSync(keyPath),
    };
  } else {
    console.warn('Vite HTTPS disabled: cert or key missing.');
    console.warn('Expected cert:', certPath);
    console.warn('Expected key :', keyPath);
    console.warn('Set VITE_HTTPS_CERT/VITE_HTTPS_KEY env vars to override.');
  }

  return {
    plugins: [react()],
    resolve: {
      modules: [
        path.resolve(__dirname, 'node_modules'),
        path.resolve(__dirname, '../node_modules'),
        'node_modules',
      ],
      alias: {
        '@microsoft/sp-http': path.resolve(__dirname, 'src/shims/sp-http.ts'),
        '@microsoft/sp-webpart-base': path.resolve(__dirname, 'src/shims/sp-webpart-base.ts'),
        '@fluentui/react': path.resolve(__dirname, 'node_modules/@fluentui/react'),
      },
    },
    server: {
      https: httpsOptions,
      port: 5173,
      open: true,
    },
    preview: {
      https: httpsOptions,
      port: 5173,
    },
    define: {
      __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.0.0'),
    },
  };
});
