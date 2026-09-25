import ky from "ky"
import { describe, expect, it } from "vitest"

import { createGreenApiClient, parseGreenApiCredentials } from "./greenApi"

type FetchCall = {
  readonly request: Request
}

type HttpFixture = {
  readonly http: ReturnType<typeof ky.create>
  readonly calls: FetchCall[]
}

function createHttpFixture(responses: readonly Response[]): HttpFixture {
  const calls: FetchCall[] = []
  let responseIndex = 0

  const http = ky.create({
    retry: 0,
    fetch: async (input, init) => {
      calls.push({ request: new Request(input, init) })
      const response = responses[responseIndex]
      responseIndex += 1

      if (response === undefined) {
        throw new Error("No response configured for this request")
      }

      return response
    },
  })

  return { http, calls }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })
}

function createCredentials() {
  return parseGreenApiCredentials({
    instanceId: "123",
    apiTokenInstance: "token",
    chatId: "987",
  })
}

describe("GREEN-API client", () => {
  it("sends a text message to the documented endpoint", async () => {
    const fixture = createHttpFixture([jsonResponse({ id: "message-1" })])
    const client = createGreenApiClient(createCredentials(), fixture.http)

    await client.sendText("hello")

    const request = fixture.calls[0]?.request
    expect(request?.method).toBe("POST")
    expect(request?.url).toBe(
      "https://api.green-api.com/waInstance123/GreenApiAuthTokentoken/sendMessage",
    )
    expect(await request?.json()).toEqual({
      chatId: "987",
      textMessage: "hello",
    })
  })

  it("returns a matching incoming text notification", async () => {
    const fixture = createHttpFixture([
      jsonResponse({
        id: 456,
        typeWebhook: "incomingMessageReceived",
        typeMessage: "textMessage",
        textMessage: "reply from Telegram",
        chatId: "987",
        senderId: "987",
        timestamp: 1_700_000_000,
      }),
    ])
    const client = createGreenApiClient(createCredentials(), fixture.http)

    const notification = await client.receiveText()

    expect(notification).toEqual({
      notificationId: "456",
      chatId: "987",
      senderId: "987",
      text: "reply from Telegram",
      timestamp: 1_700_000_000,
    })
    expect(fixture.calls[0]?.request.url).toBe(
      "https://api.green-api.com/waInstance123/GreenApiAuthTokentoken/receiveNotification?receiveTimeout=5",
    )
  })

  it("returns null for a non-matching notification", async () => {
    const fixture = createHttpFixture([
      jsonResponse({
        id: 456,
        typeWebhook: "outgoingMessageStatus",
        typeMessage: "textMessage",
      }),
    ])
    const client = createGreenApiClient(createCredentials(), fixture.http)

    await expect(client.receiveText()).resolves.toBeNull()
  })

  it("deletes a processed notification by its ID", async () => {
    const fixture = createHttpFixture([
      jsonResponse({
        id: 456,
        typeWebhook: "incomingMessageReceived",
        typeMessage: "textMessage",
        textMessage: "reply from Telegram",
        chatId: "987",
        senderId: "987",
      }),
      jsonResponse(true),
    ])
    const client = createGreenApiClient(createCredentials(), fixture.http)
    const notification = await client.receiveText()

    if (notification === null) {
      throw new Error("Expected an incoming text notification")
    }

    await client.deleteNotification(notification.notificationId)

    const request = fixture.calls[1]?.request
    expect(request?.method).toBe("POST")
    expect(request?.url).toBe(
      "https://api.green-api.com/waInstance123/GreenApiAuthTokentoken/deleteNotification",
    )
    expect(await request?.json()).toEqual({ id: "456" })
  })

  it("maps an authentication response to a typed error", async () => {
    const fixture = createHttpFixture([jsonResponse({}, 401)])
    const client = createGreenApiClient(createCredentials(), fixture.http)

    await expect(client.sendText("hello")).rejects.toMatchObject({
      name: "GreenApiError",
      code: "auth",
      status: 401,
    })
  })

  it("maps a failed browser request to a network error", async () => {
    const http = ky.create({
      retry: 0,
      fetch: async () => {
        throw new TypeError("Failed to fetch")
      },
    })
    const client = createGreenApiClient(createCredentials(), http)

    await expect(client.sendText("hello")).rejects.toMatchObject({
      name: "GreenApiError",
      code: "network",
    })
  })

  it("rejects malformed receive responses as protocol errors", async () => {
    const fixture = createHttpFixture([jsonResponse({ id: 456 })])
    const client = createGreenApiClient(createCredentials(), fixture.http)

    await expect(client.receiveText()).rejects.toMatchObject({
      name: "GreenApiError",
      code: "protocol",
    })
  })
})
