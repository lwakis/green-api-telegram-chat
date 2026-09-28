import ky from "ky"
import { describe, expect, it } from "vitest"
import { z } from "zod"

import {
  createGreenApiClient,
  parseConnectionInput,
  parseGreenApiCredentials,
  resolveRecipientChatId,
} from "./greenApi"

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
    apiUrl: "https://4100.api.green-api.com",
    instanceId: "123",
    apiTokenInstance: "token",
    chatId: "987654321",
  })
}

function createTextNotification() {
  return {
    receiptId: 456,
    body: {
      typeWebhook: "incomingMessageReceived",
      timestamp: 1_700_000_000,
      senderData: {
        chatId: "987654321",
        sender: "987654321",
        chatName: "Test chat",
        senderName: "Test sender",
      },
      messageData: {
        typeMessage: "textMessage",
        textMessageData: {
          textMessage: "reply from Telegram",
        },
      },
    },
  }
}

describe("GREEN-API client", () => {
  it("sends a text message through the account-specific Telegram endpoint", async () => {
    const fixture = createHttpFixture([jsonResponse({ idMessage: "message-1" })])
    const client = createGreenApiClient(createCredentials(), fixture.http)

    await client.sendText("hello")

    const request = fixture.calls[0]?.request
    expect(request?.method).toBe("POST")
    expect(request?.url).toBe("https://4100.api.green-api.com/waInstance123/sendMessage/token")
    expect(await request?.json()).toEqual({
      chatId: "987654321",
      message: "hello",
    })
  })

  it("normalizes and acknowledges an incoming Telegram text notification", async () => {
    const fixture = createHttpFixture([
      jsonResponse(createTextNotification()),
      jsonResponse({ result: true }),
    ])
    const client = createGreenApiClient(createCredentials(), fixture.http)

    const notification = await client.receiveText()

    expect(notification).toEqual({
      notificationId: "456",
      chatId: "987654321",
      senderId: "987654321",
      text: "reply from Telegram",
      timestamp: 1_700_000_000,
    })
    expect(fixture.calls[0]?.request.url).toBe(
      "https://4100.api.green-api.com/waInstance123/receiveNotification/token?receiveTimeout=5",
    )
    expect(fixture.calls[1]?.request.method).toBe("DELETE")
    expect(fixture.calls[1]?.request.url).toBe(
      "https://4100.api.green-api.com/waInstance123/deleteNotification/token/456",
    )
  })

  it("returns null when the long poll times out", async () => {
    const fixture = createHttpFixture([new Response(null, { status: 204 })])
    const client = createGreenApiClient(createCredentials(), fixture.http)

    await expect(client.receiveText()).resolves.toBeNull()
  })

  it("acknowledges and ignores a non-matching notification", async () => {
    const fixture = createHttpFixture([
      jsonResponse({
        receiptId: 456,
        body: { typeWebhook: "outgoingMessageStatus" },
      }),
      jsonResponse({ result: true }),
    ])
    const client = createGreenApiClient(createCredentials(), fixture.http)

    await expect(client.receiveText()).resolves.toBeNull()
    expect(fixture.calls[1]?.request.method).toBe("DELETE")
    expect(fixture.calls[1]?.request.url).toBe(
      "https://4100.api.green-api.com/waInstance123/deleteNotification/token/456",
    )
  })

  it("deletes a processed notification by receipt ID", async () => {
    const fixture = createHttpFixture([jsonResponse({ result: true })])
    const client = createGreenApiClient(createCredentials(), fixture.http)

    const notificationId = z.string().brand("NotificationId").parse("456")
    await client.deleteNotification(notificationId)

    const request = fixture.calls[0]?.request
    expect(request?.method).toBe("DELETE")
    expect(request?.url).toBe(
      "https://4100.api.green-api.com/waInstance123/deleteNotification/token/456",
    )
    expect(request?.body).toBeNull()
  })

  it("does not acknowledge a notification when deletion is rejected", async () => {
    const fixture = createHttpFixture([
      jsonResponse(createTextNotification()),
      jsonResponse({ result: false }),
    ])
    const client = createGreenApiClient(createCredentials(), fixture.http)

    await expect(client.receiveText()).rejects.toMatchObject({
      name: "GreenApiError",
      code: "protocol",
    })
  })

  it("rejects missing API URLs and WhatsApp-style chat IDs", () => {
    expect(() =>
      parseGreenApiCredentials({
        instanceId: "123",
        apiTokenInstance: "token",
        chatId: "987654321",
      }),
    ).toThrow()
    expect(() =>
      parseGreenApiCredentials({
        apiUrl: "not-a-url",
        instanceId: "123",
        apiTokenInstance: "token",
        chatId: "987654321",
      }),
    ).toThrow()
    expect(() =>
      parseGreenApiCredentials({
        apiUrl: "https://4100.api.green-api.com",
        instanceId: "123",
        apiTokenInstance: "token",
        chatId: "987@c.us",
      }),
    ).toThrow()
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
    const fixture = createHttpFixture([jsonResponse({ body: {} })])
    const client = createGreenApiClient(createCredentials(), fixture.http)

    await expect(client.receiveText()).rejects.toMatchObject({
      name: "GreenApiError",
      code: "protocol",
    })
  })
})

describe("checkAccount recipient lookup", () => {
  it("resolves a phone number to a chat ID with the credentials in the path", async () => {
    const fixture = createHttpFixture([
      jsonResponse({ exist: true, chatId: "10000000", fromCache: true }),
    ])
    const input = parseConnectionInput({
      apiUrl: "https://4100.api.green-api.com",
      instanceId: "123",
      apiTokenInstance: "token",
      recipient: "+79876543210",
    })

    await expect(resolveRecipientChatId(input.recipient, input, fixture.http)).resolves.toBe(
      "10000000",
    )

    const request = fixture.calls[0]?.request
    expect(request?.method).toBe("POST")
    expect(request?.url).toBe("https://4100.api.green-api.com/waInstance123/checkAccount/token")
    expect(await request?.json()).toEqual({ phoneNumber: 79876543210 })
  })

  it("sends an @username through unchanged", async () => {
    const fixture = createHttpFixture([jsonResponse({ exist: true, chatId: "10000000" })])
    const input = parseConnectionInput({
      apiUrl: "https://4100.api.green-api.com",
      instanceId: "123",
      apiTokenInstance: "token",
      recipient: "@username",
    })

    await expect(resolveRecipientChatId(input.recipient, input, fixture.http)).resolves.toBe(
      "10000000",
    )
    expect(await fixture.calls[0]?.request.json()).toEqual({ phoneNumber: "@username" })
  })

  it("reports a recipient Telegram cannot resolve as a validation error", async () => {
    const fixture = createHttpFixture([jsonResponse({ exist: false, chatId: "" })])
    const input = parseConnectionInput({
      apiUrl: "https://4100.api.green-api.com",
      instanceId: "123",
      apiTokenInstance: "token",
      recipient: "79876543210",
    })

    await expect(
      resolveRecipientChatId(input.recipient, input, fixture.http),
    ).rejects.toMatchObject({
      name: "GreenApiError",
      code: "validation",
      message: "Telegram account not found. Try an @username instead.",
    })
  })

  it("reports an unauthorized instance as a configuration error", async () => {
    const fixture = createHttpFixture([jsonResponse({ status: false })])
    const input = parseConnectionInput({
      apiUrl: "https://4100.api.green-api.com",
      instanceId: "123",
      apiTokenInstance: "token",
      recipient: "79876543210",
    })

    await expect(
      resolveRecipientChatId(input.recipient, input, fixture.http),
    ).rejects.toMatchObject({ code: "config" })
  })

  it("explains the free plan chat limit instead of printing a bare status", async () => {
    const fixture = createHttpFixture([jsonResponse({}, 466)])
    const input = parseConnectionInput({
      apiUrl: "https://4100.api.green-api.com",
      instanceId: "123",
      apiTokenInstance: "token",
      recipient: "79876543210",
    })

    await expect(
      resolveRecipientChatId(input.recipient, input, fixture.http),
    ).rejects.toMatchObject({ code: "api", status: 466 })
  })
})
