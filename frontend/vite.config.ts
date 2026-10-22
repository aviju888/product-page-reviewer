import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
export default defineConfig({ plugins: [react()], resolve: { alias: { '@': path.resolve(import.meta.dirname, './src') } }, build: { rollupOptions: { input: { modern: path.resolve(import.meta.dirname,'index.html'), classic: path.resolve(import.meta.dirname,'classic/index.html') } } }, server: {host:'127.0.0.1', port:4311, strictPort:true, proxy: { '/api/reviewer':'http://127.0.0.1:4312', '/api/analyze':'http://127.0.0.1:8000' } } });
