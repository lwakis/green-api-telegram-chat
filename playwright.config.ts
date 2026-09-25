import { defineConfig } from "@playwright/test"

const environment = process.env as {
  readonly PLAYWRIGHT_BASE_URL?: string
  readonly CI?: string
}
const baseURL = environment.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:5173"
const isCI = environment.CI === "1" || environment.CI === "true"

const playwrightConfig = defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  ...(isCI ? { workers: 1 } : {}),
  reporter: "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  webServer: {
    command: "bun run dev --host 127.0.0.1",
    url: baseURL,
    reuseExistingServer: !isCI,
  },
})

export { playwrightConfig }
export default playwrightConfig
