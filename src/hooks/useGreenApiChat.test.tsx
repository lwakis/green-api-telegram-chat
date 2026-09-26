import { act, renderHook, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { z } from "zod"

import {
  type GreenApiClient,
  GreenApiError,
  type IncomingTextMessage,
  type NotificationId,
  parseGreenApiCredentials,
} from "../api/greenApi"
import { useGreenApiChat } from "./useGreenApiChat"

const credentials = parseGreenApiCredentials({
  apiUrl: "https://4100.api.green-api.com",
  instanceId: "123",
  apiTokenInstance: "token",
  chatId: "987654321",
})

type Deferred<T> = {
  readonly promise: Promise<T>
  readonly resolve: (value: T) => void
}

function createDeferred<T>(): Deferred<T> {
  let resolve: ((value: T) => void) | undefined
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })

  if (resolve === undefined) {
    throw new Error("Expected Promise resolver to be initialized")
  }

  return { promise, resolve }
}

const notificationId = z.string().min(1).brand("NotificationId").parse("notification-1")
const senderId = z.string().min(1).brand("SenderId").parse("987")

function createIncomingMessage(): IncomingTextMessage {
  return {
    notificationId,
    chatId: credentials.chatId,
    senderId,
    text: "A reply from Telegram",
    timestamp: 1_700_000_000,
  }
}

type ClientFixture = {
  readonly client: GreenApiClient
  readonly receiveCalls: () => number
  readonly sendCalls: string[]
  readonly deleteCalls: NotificationId[]
  readonly queueReceive: (value: Promise<IncomingTextMessage | null>) => void
  readonly setSendError: (error: GreenApiError) => void
}

function createClientFixture(): ClientFixture {
  const sendCalls: string[] = []
  const deleteCalls: NotificationId[] = []
  const receiveQueue: Array<Promise<IncomingTextMessage | null>> = []
  let receiveCallCount = 0
  let sendError: GreenApiError | null = null

  const client: GreenApiClient = {
    sendText: async (text) => {
      sendCalls.push(text)

      if (sendError !== null) {
        throw sendError
      }
    },
    receiveText: () => {
      receiveCallCount += 1
      return receiveQueue.shift() ?? new Promise<IncomingTextMessage | null>(() => {})
    },
    deleteNotification: async (notificationId) => {
      deleteCalls.push(notificationId)
    },
  }

  return {
    client,
    receiveCalls: () => receiveCallCount,
    sendCalls,
    deleteCalls,
    queueReceive: (value) => receiveQueue.push(value),
    setSendError: (error) => {
      sendError = error
    },
  }
}

describe("useGreenApiChat", () => {
  it("starts in setup and enters listening after the first empty receive", async () => {
    const fixture = createClientFixture()
    fixture.queueReceive(Promise.resolve(null))
    fixture.queueReceive(new Promise<IncomingTextMessage | null>(() => {}))
    const { result } = renderHook(() => useGreenApiChat({ createClient: () => fixture.client }))

    expect(result.current.phase).toBe("setup")

    await act(async () => {
      await result.current.connect(credentials)
    })

    await waitFor(() => {
      expect(result.current.phase).toBe("listening")
    })
    expect(fixture.receiveCalls()).toBe(2)
  })

  it("adds an incoming message without acknowledging it twice", async () => {
    const fixture = createClientFixture()
    const nextReceive = createDeferred<IncomingTextMessage | null>()
    fixture.queueReceive(Promise.resolve(createIncomingMessage()))
    fixture.queueReceive(nextReceive.promise)
    const { result } = renderHook(() => useGreenApiChat({ createClient: () => fixture.client }))

    await act(async () => {
      await result.current.connect(credentials)
    })

    await waitFor(() => {
      expect(result.current.messages).toHaveLength(1)
    })
    expect(result.current.messages[0]).toMatchObject({
      direction: "incoming",
      text: "A reply from Telegram",
      status: "received",
    })
    expect(fixture.deleteCalls).toEqual([])
    expect(fixture.receiveCalls()).toBe(2)
  })

  it("marks an outgoing message as sent only after the API resolves", async () => {
    const fixture = createClientFixture()
    fixture.queueReceive(Promise.resolve(null))
    fixture.queueReceive(new Promise<IncomingTextMessage | null>(() => {}))
    const { result } = renderHook(() => useGreenApiChat({ createClient: () => fixture.client }))

    await act(async () => {
      await result.current.connect(credentials)
    })

    await act(async () => {
      await result.current.sendText("Hello from the browser")
    })

    expect(fixture.sendCalls).toEqual(["Hello from the browser"])
    expect(result.current.messages).toHaveLength(1)
    expect(result.current.messages[0]).toMatchObject({
      direction: "outgoing",
      text: "Hello from the browser",
      status: "sent",
    })
  })

  it("keeps a failed outgoing message visible and exposes the error", async () => {
    const fixture = createClientFixture()
    fixture.queueReceive(Promise.resolve(null))
    fixture.queueReceive(new Promise<IncomingTextMessage | null>(() => {}))
    fixture.setSendError(new GreenApiError("network", "Direct browser request failed."))
    const { result } = renderHook(() => useGreenApiChat({ createClient: () => fixture.client }))

    await act(async () => {
      await result.current.connect(credentials)
    })
    await waitFor(() => {
      expect(result.current.phase).toBe("listening")
    })

    await act(async () => {
      await result.current.sendText("This will fail")
    })

    expect(result.current.messages[0]).toMatchObject({
      direction: "outgoing",
      text: "This will fail",
      status: "failed",
    })
    expect(result.current.error).toMatchObject({ code: "network" })
    expect(result.current.phase).toBe("listening")
  })

  it("stops applying receive results after disconnect", async () => {
    const fixture = createClientFixture()
    const pendingReceive = createDeferred<IncomingTextMessage | null>()
    fixture.queueReceive(pendingReceive.promise)
    const { result, unmount } = renderHook(() =>
      useGreenApiChat({ createClient: () => fixture.client }),
    )

    await act(async () => {
      await result.current.connect(credentials)
    })

    expect(fixture.receiveCalls()).toBe(1)
    unmount()

    await act(async () => {
      pendingReceive.resolve(createIncomingMessage())
      await pendingReceive.promise
    })

    expect(fixture.deleteCalls).toEqual([])
  })

  it("does not reuse a client after disconnect", async () => {
    const firstFixture = createClientFixture()
    const secondFixture = createClientFixture()
    firstFixture.queueReceive(new Promise<IncomingTextMessage | null>(() => {}))
    secondFixture.queueReceive(Promise.resolve(null))
    secondFixture.queueReceive(new Promise<IncomingTextMessage | null>(() => {}))
    const createClient = vi
      .fn<() => GreenApiClient>()
      .mockReturnValueOnce(firstFixture.client)
      .mockReturnValueOnce(secondFixture.client)
    const { result } = renderHook(() => useGreenApiChat({ createClient }))

    await act(async () => {
      await result.current.connect(credentials)
    })
    await act(async () => {
      result.current.disconnect()
      await result.current.connect(credentials)
    })

    await waitFor(() => {
      expect(result.current.phase).toBe("listening")
    })
    expect(createClient).toHaveBeenCalledTimes(2)
    expect(secondFixture.receiveCalls()).toBe(2)
  })
})
