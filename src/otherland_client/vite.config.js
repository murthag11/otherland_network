import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'url';
import environment from 'vite-plugin-environment';
import dotenv from 'dotenv';
import { viteStaticCopy } from 'vite-plugin-static-copy'; // New plugin

dotenv.config({ path: '../../.env' });

export default defineConfig({
  build: {
    emptyOutDir: true,
  },
  optimizeDeps: {
    include: ['three/webgpu'],
    esbuildOptions: {
      define: {
        global: "globalThis",
      },
    },
  },
  server: {
    // proxy: {
    //  "/api": {
    //    target: "http://127.0.0.1:4943",
    //    changeOrigin: true,
    //  },
    //},
  },
  publicDir: "assets",
  plugins: [
    environment("all", { prefix: "CANISTER_" }),
    environment("all", { prefix: "DFX_" }),
    viteStaticCopy({
      targets: [
        {
          src: '.ic-assets.json5',
          dest: '.'
        }
      ]
    })
  ],
  resolve: {
    alias: [
      {
        find: "declarations",
        replacement: fileURLToPath(
          new URL("../declarations", import.meta.url)
        ),
      },
    ],
    dedupe: ['@dfinity/agent'],
  },
});