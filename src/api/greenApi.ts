import type { KyInstance } from "ky"
import ky, { HTTPError, isNetworkError } from "ky"
import { z } from "zod"

const API_BASE_URL = "https://api.green-api.com"
const RECEIVE_TIMEOUT_SECONDS = 5
const REQUEST_TIMEOUT_MS = 15_000
const RECEIVE_REQUEST_TIMEOUT_MS = 10_000

const InstanceIdSchema = z.string().trim().min(1).brand("InstanceId")
const ApiTokenSchema = z.string().trim().min(1).brand("ApiToken")
const ChatIdSchema = z.string().trim().min(1).brand("ChatId")
const NotificationIdSchema = z
  .union([z.string(), z.number().int().nonnegative()])
  .transform(String)
  .pipe(z.string().min(1).brand("NotificationId"))
const SenderIdSchema = z
  .union([z.string(), z.number().int()])
  .transform(String)
  .pipe(z.string().min(1).brand("SenderId"))

const CredentialsSchema = z.object({
  instanceId: InstanceIdSchema,
  apiTokenInstance: ApiTokenSchema,
  chatId: ChatIdSchema,
})

const NotificationEnvelopeSchema = z
  .object({
    id: NotificationIdSchema,
    typeWebhook: z.string(),
    typeMessage: z.string(),
    textMessage: z.string().optional(),
    chatId: ChatIdSchema.optional(),
    senderId: SenderIdSchema.optional(),
    timestamp: z.number().int().optional(),
  })
  .passthrough()

const ReceivePayloadSchema = z.union([z.null(), NotificationEnvelopeSchema])
const SuccessPayloadSchema = z.union([z.boolean(), z.object({}).passthrough()])
const TextMessageSchema = z.string().refine((value) => value.trim().length > 0)

export type GreenApiCredentials = {
  readonly instanceId: z.infer<typeof InstanceIdSchema>
  readonly apiTokenInstance: z.infer<typeof ApiTokenSchema>
  readonly chatId: z.infer<typeof ChatIdSchema>
}

export type NotificationId = z.infer<typeof NotificationIdSchema>
export type IncomingTextMessage = {
  readonly notificationId: NotificationId
  readonly chatId: z.infer<typeof ChatIdSchema>
  readonly senderId: z.infer<typeof SenderIdSchema>
  readonly text: string
  readonly timestamp: number | null
}

export type GreenApiErrorCode = "validation" | "auth" | "rate" | "network" | "protocol" | "server"

export class GreenApiError extends Error {
  override readonly name = "GreenApiError"

  constructor(
    readonly code: GreenApiErrorCode,
    message: string,
    readonly status: number | null = null,
  ) {
    super(message)
  }
}

export type GreenApiClient = {
  readonly sendText: (text: string) => Promise<void>
  readonly receiveText: () => Promise<IncomingTextMessage | null>
  readonly deleteNotification: (notificationId: NotificationId) => Promise<void>
}

export function parseGreenApiCredentials(input: unknown): GreenApiCredentials {
  const result = CredentialsSchema.safeParse(input)

  if (!result.success) {
    throw new GreenApiError("validation", "Enter an instance ID, API token, and Telegram chat ID.")
  }

  return result.data
}

export function createGreenApiClient(
  credentials: GreenApiCredentials,
  http: KyInstance = ky,
): GreenApiClient {
  const baseUrl = `${API_BASE_URL}/waInstance${encodeURIComponent(credentials.instanceId)}/GreenApiAuthToken${encodeURIComponent(credentials.apiTokenInstance)}`

  async function sendText(text: string): Promise<void> {
    const parsedText = TextMessageSchema.safeParse(text)

    if (!parsedText.success) {
      throw new GreenApiError("validation", "Enter a message before sending.")
    }

    const response = await requestJson(
      http.post(`${baseUrl}/sendMessage`, {
        json: {
          chatId: credentials.chatId,
          textMessage: parsedText.data,
        },
        retry: 0,
        timeout: REQUEST_TIMEOUT_MS,
      }),
    )
    assertSuccessPayload(response, "sendMessage")
  }

  async function receiveText(): Promise<IncomingTextMessage | null> {
    const response = await requestJson(
      http.get(`${baseUrl}/receiveNotification`, {
        searchParams: {
          receiveTimeout: String(RECEIVE_TIMEOUT_SECONDS),
        },
        retry: 0,
        timeout: RECEIVE_REQUEST_TIMEOUT_MS,
      }),
    )
    const payload = ReceivePayloadSchema.safeParse(response)

    if (!payload.success) {
      throw new GreenApiError("protocol", "GREEN-API returned an unexpected receive response.")
    }

    if (payload.data === null) {
      return null
    }

    const notification = payload.data

    if (
      notification.typeWebhook !== "incomingMessageReceived" ||
      notification.typeMessage !== "textMessage"
    ) {
      return null
    }

    if (
      notification.textMessage === undefined ||
      notification.chatId === undefined ||
      notification.senderId === undefined
    ) {
      throw new GreenApiError("protocol", "GREEN-API returned an incomplete text notification.")
    }

    return {
      notificationId: notification.id,
      chatId: notification.chatId,
      senderId: notification.senderId,
      text: notification.textMessage,
      timestamp: notification.timestamp ?? null,
    }
  }

  async function deleteNotification(notificationId: NotificationId): Promise<void> {
    const response = await requestJson(
      http.post(`${baseUrl}/deleteNotification`, {
        json: { id: notificationId },
        retry: 0,
        timeout: REQUEST_TIMEOUT_MS,
      }),
    )
    assertSuccessPayload(response, "deleteNotification")
  }

  return { sendText, receiveText, deleteNotification }
}

async function requestJson(responsePromise: Promise<Response>): Promise<unknown> {
  try {
    const response = await responsePromise
    const body: unknown = await response.json()
    return body
  } catch (error) {
    const mappedError = mapRequestError(error)

    if (mappedError !== null) {
      throw mappedError
    }

    throw error
  }
}

function assertSuccessPayload(payload: unknown, operation: string): void {
  const result = SuccessPayloadSchema.safeParse(payload)

  if (!result.success) {
    throw new GreenApiError("protocol", `GREEN-API returned an unexpected ${operation} response.`)
  }
}

function mapRequestError(error: unknown): GreenApiError | null {
  if (error instanceof GreenApiError) {
    return error
  }

  if (error instanceof HTTPError) {
    const status = error.response.status
    const code: GreenApiErrorCode =
      status === 401 || status === 403
        ? "auth"
        : status === 429
          ? "rate"
          : status >= 500
            ? "server"
            : "protocol"

    return new GreenApiError(code, `GREEN-API request failed with status ${status}.`, status)
  }

  if (isNetworkError(error) || error instanceof TypeError) {
    return new GreenApiError(
      "network",
      "Direct browser request failed. Check your network and CORS settings.",
    )
  }

  return null
}
