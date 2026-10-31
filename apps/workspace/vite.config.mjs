import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';
import { fileURLToPath } from 'node:url';
export default defineConfig({root:fileURLToPath(new URL('.',import.meta.url)),plugins:[solid()],build:{outDir:'dist',emptyOutDir:true},resolve:{dedupe:['solid-js']}});
