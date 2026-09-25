import react from "@vitejs/plugin-react"
import { defineConfig } from "vitest/config"

const viteConfig = defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
  },
  preview: {
    host: "127.0.0.1",
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    css: true,
    clearMocks: true,
    mockReset: true,
    restoreMocks: true,
  },
})

export { viteConfig }
export default viteConfig
