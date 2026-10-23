import { defineConfig } from 'vitest/config';
import path from 'node:path';
export default defineConfig({ resolve:{alias:{'@':path.resolve(import.meta.dirname,'src')}}, test:{include:['src/lib/reviewer/__tests__/*.test.ts','server/*.test.ts'],testTimeout:30000,pool:'forks',maxWorkers:1} });
