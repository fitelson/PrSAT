import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // browser: {
    //   provider: 'playwright', // or 'webdriverio'
    //   enabled: false,
    //   name: 'chromium', // browser name is required
    // },
    include: ['src/**/*.spec.ts'],
    testTimeout: 60_000,
  },
  build: {
    sourcemap: true,
  },
})
