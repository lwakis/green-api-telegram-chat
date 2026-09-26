import { expect, type Locator, type Page, test } from "@playwright/test"

const API_URL = "https://green-api.test"
const INSTANCE_ID = "1100"
const API_TOKEN = "test-token"
const CHAT_ID = "123456789"
const RECEIPT_ID = "456"
const BASE = `${API_URL}/waInstance${INSTANCE_ID}`

const OUTGOING_TEXT = "Hello from the browser"
const INCOMING_TEXT = "Reply from Telegram"

// The receive loop is a hot while-loop, so every handler must return. This delay keeps
// it at roughly four requests per second instead of spinning the network stack.
const POLL_THROTTLE_MS = 250

// The prototype has no backend proxy, so the browser calls GREEN-API cross-origin and the
// CORS preflight plus the ACAO header are both required for the mocked replies to be readable.
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
    senderData: {
      chatId: CHAT_ID,
      sender: CHAT_ID,
    },
    messageData: {
      typeMessage: "textMessage",
      textMessageData: {
        textMessage: INCOMING_TEXT,
      },
    },
  },
}

type Mocks = {
  readonly acknowledged: readonly string[]
  readonly deliverIncoming: () => void
}

// Each mode breaks exactly one link of the request chain, so every failure notice the user can be
// left with is reachable as rendered text.
type FailureMode = "none" | "send" | "receive" | "network"

type FocusStop = {
  readonly descriptor: string
  readonly fieldId: string
  readonly fieldType: string
  readonly isSubmit: boolean
}

type HorizontalScroll = {
  readonly scrollWidth: number
  readonly clientWidth: number
}

const COMPOSER_INPUT_ID = "message-input"

// These three strings are built in src/api/greenApi.ts and are the only feedback a broken request
// leaves the user with, so their exact wording is what the failure tests pin.
const SEND_FAILED_NOTICE = "GREEN-API request failed with status 500."
const RECEIVE_MALFORMED_NOTICE = "GREEN-API returned an unexpected notification payload."
const NETWORK_FAILED_NOTICE =
  "The direct browser request to GREEN-API failed. Check the network and CORS policy."

// The three widths the finish gate requires: below 599px, in the 721-924px band where the app frame
// is still two-column, and above the 924px breakpoint.
const RESPONSIVE_VIEWPORTS = [
  { width: 375, height: 812 },
  { width: 768, height: 1024 },
  { width: 1280, height: 800 },
] as const

// Bounded because the focusable set changes with the phase: an unbounded walk could never prove
// that it stopped on the submit control instead of simply running out of focusable elements.
const TAB_STEP_LIMIT = 16

// Keyed by element id, never by accessible name: the SecretField reveal toggle is named
// "Reveal Instance API token", so name matching would conflate it with the token text input.
const SETUP_FIELD_VALUES: Readonly<Record<string, string>> = {
  "api-url": API_URL,
  "instance-id": INSTANCE_ID,
  "api-token": API_TOKEN,
  "chat-id": CHAT_ID,
}

async function installMocks(page: Page, mode: FailureMode = "none"): Promise<Mocks> {
  let receiveCount = 0
  let deliverIncoming = false
  const acknowledged: string[] = []

  await page.route(`${BASE}/sendMessage/${API_TOKEN}`, async (route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: preflightHeaders })
      return
    }

    // A 500 exercises the client's HTTP-status branch, while an abort is what an unreachable host or
    // a preflight blocked by a missing ACAO header actually looks like to fetch.
    if (mode === "network") {
      await route.abort("connectionrefused")
      return
    }

    if (mode === "send") {
      await route.fulfill({
        status: 500,
        headers: corsHeaders,
        contentType: "application/json",
        body: JSON.stringify({ message: "simulated send failure" }),
      })
      return
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: corsHeaders,
      body: JSON.stringify({ idMessage: "out-1" }),
    })
  })

  await page.route(`${BASE}/receiveNotification/${API_TOKEN}**`, async (route) => {
    receiveCount += 1
    // The first poll must be instant: it is what moves the UI to the listening state.
    if (receiveCount > 1) {
      await new Promise((resolve) => setTimeout(resolve, POLL_THROTTLE_MS))
    }

    if (mode === "network") {
      await route.abort("connectionrefused")
      return
    }

    // Unparseable JSON has to be non-empty, otherwise the client reads it as a normal empty poll and
    // never reaches the payload validation that produces the protocol error.
    if (mode === "receive") {
      await route.fulfill({
        status: 200,
        headers: corsHeaders,
        contentType: "application/json",
        body: "{ not valid json",
      })
      return
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
  })

  await page.route(`${BASE}/deleteNotification/${API_TOKEN}/**`, async (route) => {
    // The token path segment comes before the receiptId, so the last segment is the receiptId.
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
  })

  return {
    acknowledged,
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
  await setupForm.getByLabel("Telegram chat ID").fill(CHAT_ID)

  await page.getByRole("button", { name: "Connect instance" }).click()
}

async function expectComposerReady(page: Page): Promise<void> {
  // The header status pill is display:none below 600px (src/styles/responsive.css), so it is not a
  // width-independent readiness signal. The composer textarea is enabled only while the phase is
  // "listening", and that is the real precondition for sending.
  const composerTextarea = composerInput(page)

  await expect(composerTextarea).toBeVisible()
  await expect(composerTextarea).toBeEnabled()
}

// The dev build's react-scan toolbar injects extra focusable buttons, so every stop is read in-page
// from document.activeElement instead of being resolved through a role locator that would match the
// toolbar's controls as well.
async function readFocusStop(page: Page): Promise<FocusStop> {
  return page.evaluate(() => {
    const active = document.activeElement

    if (active === null || active === document.body) {
      return { descriptor: "no-focus", fieldId: "", fieldType: "", isSubmit: false }
    }

    const tag = active.tagName.toLowerCase()
    const fieldType =
      active instanceof HTMLInputElement || active instanceof HTMLButtonElement ? active.type : ""
    const name = active.getAttribute("aria-label") ?? active.textContent?.trim() ?? ""
    const parts = [active.id === "" ? tag : `${tag}#${active.id}`]

    if (fieldType !== "") {
      parts.push(`(${fieldType})`)
    }

    if (name !== "") {
      parts.push(`"${name}"`)
    }

    return {
      descriptor: parts.join(" "),
      fieldId: active.id,
      fieldType,
      isSubmit: active instanceof HTMLButtonElement && active.type === "submit",
    }
  })
}

async function tabToComposer(page: Page): Promise<readonly FocusStop[]> {
  const stops: FocusStop[] = []

  for (let step = 0; step < TAB_STEP_LIMIT; step += 1) {
    await page.keyboard.press("Tab")
    const stop = await readFocusStop(page)
    stops.push(stop)

    if (stop.fieldId === COMPOSER_INPUT_ID) {
      return stops
    }
  }

  return stops
}

// documentElement is the only element that reports the viewport's own scrollable width, so a
// descendant that escapes the screen shows up here even when no individual element overflows.
async function readHorizontalScroll(page: Page): Promise<HorizontalScroll> {
  return page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))
}

function overflowMessage(label: string, scroll: HorizontalScroll): string {
  return `${label}: scrollWidth ${scroll.scrollWidth} > clientWidth ${scroll.clientWidth}`
}

async function expectNoHorizontalOverflow(page: Page, label: string): Promise<void> {
  const scroll = await readHorizontalScroll(page)
  expect(scroll.scrollWidth, overflowMessage(label, scroll)).toBeLessThanOrEqual(scroll.clientWidth)
}

function composerInput(page: Page): Locator {
  return page.getByRole("form", { name: "Message composer" }).getByLabel("Message text")
}

async function expectRightEdgeWithinViewport(
  target: Locator,
  viewportWidth: number,
  label: string,
): Promise<void> {
  // A null box is a layout failure in its own right: the element is unmounted, hidden, or has no
  // area, and no edge position could be reported for it.
  const box = await target.boundingBox()

  if (box === null) {
    throw new Error(`${label} has no layout box at ${viewportWidth}px`)
  }

  const right = box.x + box.width
  expect(
    right,
    `${label} right edge is ${right}px in a ${viewportWidth}px viewport`,
  ).toBeLessThanOrEqual(viewportWidth)
}

test("sends a message, receives the reply, and acknowledges the notification", async ({ page }) => {
  const { acknowledged, deliverIncoming } = await installMocks(page)

  await page.goto("/")

  await fillSetupForm(page)

  const chatPanel = page.getByRole("main")
  await expect(chatPanel.getByText("Listening")).toBeVisible()

  await page.getByLabel("Message text").fill(OUTGOING_TEXT)
  await page.getByRole("button", { name: "Send" }).click()

  await expect(page.getByRole("article", { name: "Outgoing message, Sent" })).toContainText(
    OUTGOING_TEXT,
  )

  deliverIncoming()

  await expect(page.getByRole("article", { name: "Incoming message, Received" })).toContainText(
    INCOMING_TEXT,
  )

  expect(acknowledged).toEqual([RECEIPT_ID])
})

test("connects and sends a message with the keyboard alone", async ({ page }) => {
  await installMocks(page)
  await page.goto("/")

  await page.getByRole("form", { name: "GREEN-API connection setup" }).waitFor()

  const focusOrder: string[] = []

  for (let step = 0; step < TAB_STEP_LIMIT; step += 1) {
    await page.keyboard.press("Tab")
    const stop = await readFocusStop(page)
    focusOrder.push(stop.descriptor)

    if (stop.isSubmit) {
      await page.keyboard.press("Enter")
      break
    }

    const value = SETUP_FIELD_VALUES[stop.fieldId]

    if (stop.fieldType !== "" && value !== undefined) {
      await page.keyboard.type(value)
    }
  }

  expect(focusOrder).toEqual([
    "input#api-url (text)",
    "input#instance-id (text)",
    "input#api-token (password)",
    'button (button) "Reveal Instance API token"',
    "input#chat-id (text)",
    'button (submit) "Connect instance"',
  ])

  await expectComposerReady(page)

  const composerStops = await tabToComposer(page)

  expect(composerStops.at(-1)?.fieldId).toBe(COMPOSER_INPUT_ID)

  await page.keyboard.type(OUTGOING_TEXT)
  await page.keyboard.press("Enter")

  await expect(page.getByRole("article", { name: "Outgoing message, Sent" })).toContainText(
    OUTGOING_TEXT,
  )
})

test.describe("with prefers-reduced-motion: reduce", () => {
  test.use({ reducedMotion: "reduce" })

  test("sends a message while nothing animates forever", async ({ page }) => {
    await installMocks(page)
    await page.goto("/")

    await fillSetupForm(page)
    await expectComposerReady(page)

    await page.getByLabel("Message text").fill(OUTGOING_TEXT)
    await page.getByRole("button", { name: "Send" }).click()

    await expect(page.getByRole("article", { name: "Outgoing message, Sent" })).toContainText(
      OUTGOING_TEXT,
    )

    // Reduced motion still leaves running transitions behind (two were present when this behavior
    // was recorded), so the invariant is "nothing running loops forever", not "nothing runs". The
    // status pill pulse is the canary: if the emulation ever stopped applying, it would loop
    // forever and this check would fail instead of passing vacuously.
    const loopingAnimations = await page.evaluate(() =>
      document
        .getAnimations()
        .filter((animation) => animation.playState === "running")
        .filter((animation) => {
          const effect = animation.effect
          return effect !== null && effect.getTiming().iterations === Number.POSITIVE_INFINITY
        })
        .map((animation) => animation.constructor.name),
    )

    expect(loopingAnimations).toEqual([])
  })
})

test("lays out without horizontal overflow and keeps the composer usable at every width", async ({
  page,
}) => {
  await installMocks(page)

  for (const { width, height } of RESPONSIVE_VIEWPORTS) {
    await page.setViewportSize({ width, height })
    await page.goto("/")

    await expect(
      page.getByRole("form", { name: "GREEN-API connection setup" }),
      `setup form must render at ${width}px`,
    ).toBeVisible()

    const setupScroll = await readHorizontalScroll(page)
    expect(
      setupScroll.scrollWidth,
      overflowMessage(`horizontal overflow on the setup form at ${width}px`, setupScroll),
    ).toBeLessThanOrEqual(setupScroll.clientWidth)

    await fillSetupForm(page)

    // The header status pill is display:none below 600px (src/styles/responsive.css), so it is
    // intentionally absent at 375px and cannot be the readiness signal here. The composer textarea
    // is enabled only while the phase is "listening", so it proves the connection at every width.
    await expectComposerReady(page)

    const connectedScroll = await readHorizontalScroll(page)
    expect(
      connectedScroll.scrollWidth,
      overflowMessage(`horizontal overflow on the connected chat at ${width}px`, connectedScroll),
    ).toBeLessThanOrEqual(connectedScroll.clientWidth)

    await expectRightEdgeWithinViewport(composerInput(page), width, "composer")
  }
})

test("marks the outgoing message failed and explains the rejected send", async ({ page }) => {
  await installMocks(page, "send")

  for (const { width, height } of RESPONSIVE_VIEWPORTS) {
    await page.setViewportSize({ width, height })
    await page.goto("/")

    await expect(
      page.getByRole("form", { name: "GREEN-API connection setup" }),
      `setup form must render at ${width}px`,
    ).toBeVisible()
    await expectNoHorizontalOverflow(page, `horizontal overflow on the setup form at ${width}px`)

    await fillSetupForm(page)
    await expectComposerReady(page)

    await page.getByLabel("Message text").fill(OUTGOING_TEXT)
    await page.getByRole("button", { name: "Send" }).click()

    await expect(page.getByRole("article", { name: "Outgoing message, Failed" })).toContainText(
      OUTGOING_TEXT,
    )

    // Only a send is broken here, so the phase stays "listening" and the notice keeps tone "warning"
    // with role="status" (src/components/controls.tsx). Asserting role="alert" would be a false
    // failure: only the error phase upgrades the tone. The rail's thread counter is also a status, so
    // the notice is picked out of them by the copy it must carry.
    await expect(page.getByText(SEND_FAILED_NOTICE)).toBeVisible()

    const notice = page.getByRole("status").filter({ hasText: SEND_FAILED_NOTICE })

    await expectNoHorizontalOverflow(
      page,
      `horizontal overflow on the send failure notice at ${width}px`,
    )
    await expectRightEdgeWithinViewport(notice, width, "send failure notice")
    await expectRightEdgeWithinViewport(composerInput(page), width, "composer")
  }
})

test("reports an unexpected notification payload as an alert when the phase errors", async ({
  page,
}) => {
  await installMocks(page, "receive")

  for (const { width, height } of RESPONSIVE_VIEWPORTS) {
    await page.setViewportSize({ width, height })
    await page.goto("/")

    await expect(
      page.getByRole("form", { name: "GREEN-API connection setup" }),
      `setup form must render at ${width}px`,
    ).toBeVisible()
    await expectNoHorizontalOverflow(page, `horizontal overflow on the setup form at ${width}px`)

    await fillSetupForm(page)

    // The receive loop sets the error phase on a protocol error, so the composer is not expected to be
    // usable here; the alert is the whole contract for this failure.
    await expect(page.getByText(RECEIVE_MALFORMED_NOTICE)).toBeVisible()
    await expect(page.getByRole("alert")).toBeVisible()

    await expectNoHorizontalOverflow(
      page,
      `horizontal overflow on the receive failure notice at ${width}px`,
    )
    await expectRightEdgeWithinViewport(page.getByRole("alert"), width, "receive failure notice")
  }
})

test("reports a blocked cross-origin request as an alert", async ({ page }) => {
  await installMocks(page, "network")

  for (const { width, height } of RESPONSIVE_VIEWPORTS) {
    await page.setViewportSize({ width, height })
    await page.goto("/")

    await expect(
      page.getByRole("form", { name: "GREEN-API connection setup" }),
      `setup form must render at ${width}px`,
    ).toBeVisible()
    await expectNoHorizontalOverflow(page, `horizontal overflow on the setup form at ${width}px`)

    await fillSetupForm(page)

    await expect(page.getByText(NETWORK_FAILED_NOTICE)).toBeVisible()
    await expect(page.getByRole("alert")).toBeVisible()

    await expectNoHorizontalOverflow(
      page,
      `horizontal overflow on the network failure notice at ${width}px`,
    )
    await expectRightEdgeWithinViewport(page.getByRole("alert"), width, "network failure notice")
  }
})
