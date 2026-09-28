import { mkdir } from "node:fs/promises"

import { chromium, type Page } from "@playwright/test"

// Run `bun run build && bun run preview --host 127.0.0.1` first: the dev server injects the
// react-scan toolbar, which would appear in every capture.
const BASE_URL = process.env.SCREENSHOT_BASE_URL ?? "http://127.0.0.1:4173"
const OUTPUT_DIR = "docs"

const API_URL = "https://green-api.test"
const INSTANCE_ID = "1100"
const API_TOKEN = "test-token"
const RECIPIENT = "79876543210"
const CHAT_ID = "123456789"
const RECEIPT_ID = "456"

const OUTGOING_TEXT = "Hello from the browser"
const INCOMING_TEXT = "Reply from Telegram"

// The receive loop is a hot while-loop, so every handler returns; this keeps it from spinning.
const POLL_THROTTLE_MS = 250

const corsHeaders = { "access-control-allow-origin": "*" }
const preflightHeaders = {
  ...corsHeaders,
  "access-control-allow-methods": "DELETE, GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type",
}

const notification = {
  receiptId: RECEIPT_ID,
  body: {
    typeWebhook: "incomingMessageReceived",
    timestamp: 1700000000,
    senderData: { chatId: CHAT_ID, sender: CHAT_ID },
    messageData: {
      typeMessage: "textMessage",
      textMessageData: { textMessage: INCOMING_TEXT },
    },
  },
}

type Mocks = {
  readonly deliverIncoming: () => void
}

async function installMocks(page: Page): Promise<Mocks> {
  const acknowledged: string[] = []
  let receiveCount = 0
  let deliverIncoming = false
  await page.route(
    `${API_URL}/waInstance${INSTANCE_ID}/checkAccount/${API_TOKEN}`,
    async (route) => {
      if (route.request().method() === "OPTIONS") {
        await route.fulfill({ status: 204, headers: preflightHeaders })
        return
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: corsHeaders,
        body: JSON.stringify({ exist: true, chatId: CHAT_ID, fromCache: true }),
      })
    },
  )

  await page.route(
    `${API_URL}/waInstance${INSTANCE_ID}/sendMessage/${API_TOKEN}`,
    async (route) => {
      if (route.request().method() === "OPTIONS") {
        await route.fulfill({ status: 204, headers: preflightHeaders })
        return
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: corsHeaders,
        body: JSON.stringify({ idMessage: "out-1" }),
      })
    },
  )

  await page.route(
    `${API_URL}/waInstance${INSTANCE_ID}/receiveNotification/${API_TOKEN}**`,
    async (route) => {
      receiveCount += 1
      if (receiveCount > 1) {
        await new Promise((resolve) => setTimeout(resolve, POLL_THROTTLE_MS))
      }

      if (receiveCount >= 2 && deliverIncoming && !acknowledged.includes(RECEIPT_ID)) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          headers: corsHeaders,
          body: JSON.stringify(notification),
        })
        return
      }

      await route.fulfill({ status: 200, headers: corsHeaders, body: "" })
    },
  )

  await page.route(
    `${API_URL}/waInstance${INSTANCE_ID}/deleteNotification/${API_TOKEN}/**`,
    async (route) => {
      const receiptId = new URL(route.request().url()).pathname.split("/").at(-1)

      if (receiptId !== undefined) {
        acknowledged.push(receiptId)
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: corsHeaders,
        body: JSON.stringify({ result: true }),
      })
    },
  )

  return {
    deliverIncoming: () => {
      deliverIncoming = true
    },
  }
}

async function fillSetupForm(page: Page): Promise<void> {
  const setupForm = page.getByRole("form", { name: "GREEN-API connection setup" })

  await setupForm.getByLabel("API URL").fill(API_URL)
  await setupForm.getByLabel("Instance ID").fill(INSTANCE_ID)
  await setupForm.getByLabel("Instance API token", { exact: true }).fill(API_TOKEN)
  await setupForm.getByLabel("Recipient").fill(RECIPIENT)
  await page.getByRole("button", { name: "Connect instance" }).click()
}

async function openThread(page: Page, mocks: Mocks): Promise<void> {
  await page.goto(BASE_URL)
  await fillSetupForm(page)

  const composer = page.locator("#message-input")
  await composer.waitFor({ state: "visible" })

  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (await composer.isEnabled()) {
      break
    }

    await new Promise((resolve) => setTimeout(resolve, 100))
  }

  await composer.fill(OUTGOING_TEXT)
  await composer.press("Enter")

  const sent = page.getByRole("article", { name: "Outgoing message, Sent" })
  await sent.waitFor({ state: "visible" })

  mocks.deliverIncoming()

  const received = page.getByRole("article", { name: "Incoming message, Received" })
  await received.waitFor({ state: "visible" })
  await new Promise((resolve) => setTimeout(resolve, 400))
}

async function main(): Promise<void> {
  await mkdir(OUTPUT_DIR, { recursive: true })

  const browser = await chromium.launch()

  try {
    const setupPage = await browser.newPage({ viewport: { width: 1280, height: 800 } })
    await installMocks(setupPage)
    await setupPage.goto(BASE_URL)
    await setupPage.getByRole("form", { name: "GREEN-API connection setup" }).waitFor()
    await setupPage.screenshot({ path: `${OUTPUT_DIR}/setup.png` })
    await setupPage.close()
    console.log("captured setup.png")

    for (const viewport of [
      { name: "thread-1280", width: 1280, height: 800 },
      { name: "thread-768", width: 768, height: 1024 },
      { name: "thread-375", width: 375, height: 812 },
    ]) {
      const page = await browser.newPage({
        viewport: { width: viewport.width, height: viewport.height },
      })
      const mocks = await installMocks(page)
      await openThread(page, mocks)
      await page.screenshot({ path: `${OUTPUT_DIR}/${viewport.name}.png` })
      await page.close()
      console.log(`captured ${viewport.name}.png`)
    }
  } finally {
    await browser.close()
  }
}

await main()
