import { defineConfig } from 'tsup'

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/generation/index.ts',
    'src/node.ts',
  ],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
})
