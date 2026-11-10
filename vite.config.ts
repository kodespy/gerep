import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import flowbiteReact from 'flowbite-react/plugin/vite'
import path from 'node:path'
import { resendDerivacionPlugin } from './vite.resendPlugin'

export default defineConfig(({ mode }) => ({
  base: '/',
  plugins: [react(), tailwindcss(), flowbiteReact(), resendDerivacionPlugin(mode)],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: { port: 5180, strictPort: true },
}))
