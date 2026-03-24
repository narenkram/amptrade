import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config'
import type { UserConfig } from 'vite'

// Call the function-based config with empty env
const resolvedViteConfig =
  typeof viteConfig === 'function' ? viteConfig({ mode: 'test', command: 'serve' }) : viteConfig

export default mergeConfig(
  resolvedViteConfig as UserConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      include: ['src/**/*.{test,spec}.{js,ts,jsx,tsx}'],
      globals: true,
    },
  }),
)
