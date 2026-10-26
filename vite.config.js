import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('.', import.meta.url));
const productionPublic = {
  name: 'production-public-assets', apply: 'build',
  closeBundle() {
    const { version } = JSON.parse(fs.readFileSync(path.join(root, 'mobile/package.json'), 'utf8'));
    const current = `kaojiang-v${version}.apk`;
    for (const name of fs.readdirSync(path.join(root, 'public'))) {
      if (name === 'demo') continue;
      fs.cpSync(path.join(root, 'public', name), path.join(root, 'dist', name), {
        recursive: true,
        filter: source => name !== 'downloads' || path.basename(source) === 'downloads' || [current, current + '.sha256'].includes(path.basename(source)),
      });
    }
  },
};
export default defineConfig({ plugins: [react(), productionPublic], build: {
  outDir: "dist",
  copyPublicDir: false,
  rollupOptions: { output: { manualChunks(id) {
    if (/node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return "react-vendor";
  } } },
} });
