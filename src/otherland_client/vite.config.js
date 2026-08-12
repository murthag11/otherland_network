import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'url';
import environment from 'vite-plugin-environment';
import dotenv from 'dotenv';
import { viteStaticCopy } from 'vite-plugin-static-copy';

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
  define: {
    'process.env.USER_NODE_CANISTER_ID': JSON.stringify(process.env.USER_NODE_CANISTER_ID || process.env.CANISTER_ID_USER_NODE),
    'process.env.CARDINAL_CANISTER_ID':   JSON.stringify(process.env.CARDINAL_CANISTER_ID   || process.env.CANISTER_ID_CARDINAL),
    'process.env.INTERNET_IDENTITY_CANISTER_ID': JSON.stringify(process.env.INTERNET_IDENTITY_CANISTER_ID || process.env.CANISTER_ID_INTERNET_IDENTITY),
    'process.env.OTHERLAND_CLIENT_CANISTER_ID': JSON.stringify(process.env.OTHERLAND_CLIENT_CANISTER_ID || process.env.CANISTER_ID_OTHERLAND_CLIENT),
  },
  resolve: {
    alias: [
      {
        find: "declarations",
        replacement: fileURLToPath(
          new URL("../declarations", import.meta.url)
        ),
      },
    ],
    dedupe: ['@icp-sdk/core'],
  },
});