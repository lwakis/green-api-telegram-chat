import ky, { HTTPError, type Options } from "ky"
import { z } from "zod"

const receiveTimeoutSeconds = 5

const apiUrlSchema = z
  .string()
  .trim()
  .url()
  .refine((value) => value.startsWith("https://"), {
    message: "API URL must use HTTPS",
  })
  .transform((value) => value.replace(/\/+$/, ""))
  .brand("ApiUrl")
const apiTokenSchema = z.string().trim().min(1).brand("ApiToken")
const instanceIdSchema = z.string().trim().min(1).brand("InstanceId")
const chatIdSchema = z
  .string()
  .trim()
  .regex(/^-?\d+$/, "Telegram chat ID must be numeric")
  .brand("ChatId")
const notificationIdSchema = z.string().trim().min(1).brand("NotificationId")
const senderIdSchema = z.string().trim().min(1).brand("SenderId")

// Telegram privacy settings can hide a number from lookups, so an @username is accepted too.
const USERNAME_PATTERN = /^@[A-Za-z0-9_]{4,32}$/
const PHONE_PATTERN = /^\d{5,15}$/

const recipientSchema = z
  .string()
  .trim()
  .refine((value) => USERNAME_PATTERN.test(value) || PHONE_PATTERN.test(value.replace(/^\+/, "")), {
    message: "Enter a phone number in international format or an @username",
  })
  .brand("Recipient")

const credentialsInputSchema = z.object({
  apiUrl: apiUrlSchema,
  instanceId: instanceIdSchema,
  apiTokenInstance: apiTokenSchema,
  chatId: chatIdSchema,
})

const connectionInputSchema = z.object({
  apiUrl: apiUrlSchema,
  instanceId: instanceIdSchema,
  apiTokenInstance: apiTokenSchema,
  recipient: recipientSchema,
})

const scalarIdSchema = z.union([z.string(), z.number()]).transform((value) => String(value))

const sendResponseSchema = z.looseObject({
  idMessage: scalarIdSchema.pipe(notificationIdSchema),
})

const deleteResponseSchema = z.looseObject({
  result: z.literal(true),
})

// All three fields are optional, and which ones are present is what selects the error path below.
const checkAccountResponseSchema = z.looseObject({
  status: z.boolean().optional(),
  exist: z.boolean().optional(),
  chatId: scalarIdSchema.nullish(),
})

const notificationEnvelopeSchema = z.looseObject({
  receiptId: scalarIdSchema.pipe(notificationIdSchema),
  body: z.looseObject({
    typeWebhook: z.string().min(1),
    timestamp: z.number().optional(),
    senderData: z
      .looseObject({
        chatId: chatIdSchema.optional(),
        sender: scalarIdSchema.pipe(senderIdSchema).optional(),
      })
      .optional(),
    messageData: z
      .looseObject({
        typeMessage: z.string().optional(),
        textMessageData: z
          .looseObject({
            textMessage: z.string(),
          })
          .optional(),
      })
      .optional(),
  }),
})

type NotificationEnvelope = z.infer<typeof notificationEnvelopeSchema>
export type GreenApiCredentials = z.infer<typeof credentialsInputSchema>
export type GreenApiConnectionInput = z.infer<typeof connectionInputSchema>
export type NotificationId = z.infer<typeof notificationIdSchema>
export type Recipient = z.infer<typeof recipientSchema>
export type ChatId = z.infer<typeof chatIdSchema>
export type GreenApiConnection = Pick<
  GreenApiCredentials,
  "apiUrl" | "instanceId" | "apiTokenInstance"
>

export type IncomingTextMessage = {
  readonly notificationId: NotificationId
  readonly chatId: z.infer<typeof chatIdSchema>
  readonly senderId: z.infer<typeof senderIdSchema>
  readonly text: string
  readonly timestamp: number
}

export type GreenApiErrorCode = "api" | "auth" | "config" | "network" | "protocol" | "validation"

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

export interface GreenApiClient {
  sendText(text: string): Promise<void>
  receiveText(): Promise<IncomingTextMessage | null>
  deleteNotification(notificationId: NotificationId): Promise<void>
}

export function parseGreenApiCredentials(input: unknown): GreenApiCredentials {
  const result = credentialsInputSchema.safeParse(input)

  if (!result.success) {
    throw new GreenApiError(
      "config",
      "Enter a GREEN-API API URL, instance ID, API token, and Telegram chat ID.",
    )
  }

  return result.data
}

export function parseConnectionInput(input: unknown): GreenApiConnectionInput {
  const result = connectionInputSchema.safeParse(input)

  if (!result.success) {
    throw new GreenApiError(
      "config",
      "Enter a GREEN-API API URL, instance ID, API token, and a recipient phone number or @username.",
    )
  }

  return result.data
}

function buildEndpoint(connection: GreenApiConnection, action: string, suffix?: string): string {
  const base = `${connection.apiUrl}/waInstance${encodeURIComponent(connection.instanceId)}/${action}/${encodeURIComponent(connection.apiTokenInstance)}`

  return suffix === undefined ? base : `${base}/${suffix}`
}

function apiError(status: number): GreenApiError {
  if (status === 466) {
    return new GreenApiError(
      "api",
      "The free GREEN-API plan allows only three active chats. Reuse a chat or raise the plan limit.",
      status,
    )
  }

  const code = status === 401 || status === 403 ? "auth" : "api"

  return new GreenApiError(code, `GREEN-API request failed with status ${status}.`, status)
}

async function performRequest(
  http: ReturnType<typeof ky.create>,
  url: string,
  options: Options = {},
): Promise<Response> {
  try {
    const response = await http(url, { ...options, retry: 0 })

    if (response.ok) {
      return response
    }

    throw apiError(response.status)
  } catch (error) {
    if (error instanceof GreenApiError) {
      throw error
    }

    if (error instanceof HTTPError) {
      throw apiError(error.response.status)
    }

    throw new GreenApiError(
      "network",
      "The direct browser request to GREEN-API failed. Check the network and CORS policy.",
    )
  }
}

async function readResponseText(response: Response): Promise<string> {
  try {
    return await response.text()
  } catch {
    throw new GreenApiError("network", "GREEN-API returned a response that could not be read.")
  }
}

function protocolError(): GreenApiError {
  return new GreenApiError("protocol", "GREEN-API returned an unexpected notification payload.")
}

function checkAccountProtocolError(): GreenApiError {
  return new GreenApiError("protocol", "GREEN-API returned an unexpected checkAccount response.")
}

function parseJson(responseText: string): unknown {
  try {
    return JSON.parse(responseText) as unknown
  } catch {
    throw protocolError()
  }
}

async function parseJsonResponse(response: Response): Promise<unknown> {
  const responseText = await readResponseText(response)

  if (responseText.trim() === "") {
    throw protocolError()
  }

  return parseJson(responseText)
}

// The API wants a bare international number, so a leading + is dropped and the rest sent as a number.
function toCheckAccountPhoneNumber(recipient: string): number | string {
  if (USERNAME_PATTERN.test(recipient)) {
    return recipient
  }

  return Number(recipient.replace(/^\+/, ""))
}

export async function resolveRecipientChatId(
  recipient: Recipient,
  connection: GreenApiConnection,
  http: ReturnType<typeof ky.create> = ky.create({ timeout: 15_000 }),
): Promise<ChatId> {
  const response = await performRequest(http, buildEndpoint(connection, "checkAccount"), {
    method: "POST",
    json: { phoneNumber: toCheckAccountPhoneNumber(recipient) },
  })
  const result = checkAccountResponseSchema.safeParse(await parseJsonResponse(response))

  if (!result.success) {
    throw checkAccountProtocolError()
  }

  const { status, exist, chatId } = result.data

  if (status === false) {
    throw new GreenApiError(
      "config",
      "The GREEN-API instance is not authorized yet. Check its status in the console, then reconnect.",
    )
  }

  if (exist === false) {
    throw new GreenApiError("validation", "Telegram account not found. Try an @username instead.")
  }

  if (exist !== true) {
    throw checkAccountProtocolError()
  }

  const resolved = chatIdSchema.safeParse(chatId)

  if (!resolved.success) {
    throw checkAccountProtocolError()
  }

  return resolved.data
}

class HttpGreenApiClient implements GreenApiClient {
  constructor(
    private readonly credentials: GreenApiCredentials,
    private readonly http: ReturnType<typeof ky.create>,
  ) {}

  async sendText(text: string): Promise<void> {
    const response = await performRequest(this.http, this.endpoint("sendMessage"), {
      method: "POST",
      json: {
        chatId: this.credentials.chatId,
        message: text,
      },
    })
    const result = sendResponseSchema.safeParse(await parseJsonResponse(response))

    if (!result.success) {
      throw protocolError()
    }
  }

  async receiveText(): Promise<IncomingTextMessage | null> {
    const response = await performRequest(
      this.http,
      `${this.endpoint("receiveNotification")}?receiveTimeout=${receiveTimeoutSeconds}`,
    )
    const responseText = await readResponseText(response)

    if (responseText.trim() === "") {
      return null
    }

    const payload = parseJson(responseText)
    const result = notificationEnvelopeSchema.safeParse(payload)

    if (!result.success) {
      throw protocolError()
    }

    const incomingMessage = this.normalizeIncomingText(result.data)
    await this.deleteNotification(result.data.receiptId)
    return incomingMessage
  }

  async deleteNotification(notificationId: NotificationId): Promise<void> {
    const response = await performRequest(
      this.http,
      this.endpoint("deleteNotification", encodeURIComponent(notificationId)),
      { method: "DELETE" },
    )
    const result = deleteResponseSchema.safeParse(await parseJsonResponse(response))

    if (!result.success) {
      throw protocolError()
    }
  }

  private endpoint(action: string, suffix?: string): string {
    return buildEndpoint(this.credentials, action, suffix)
  }

  private normalizeIncomingText(notification: NotificationEnvelope): IncomingTextMessage | null {
    const { body } = notification

    if (body.typeWebhook !== "incomingMessageReceived") {
      return null
    }

    if (body.messageData?.typeMessage !== "textMessage") {
      return null
    }

    const text = body.messageData.textMessageData?.textMessage

    if (
      text === undefined ||
      body.timestamp === undefined ||
      body.senderData?.chatId === undefined ||
      body.senderData.sender === undefined
    ) {
      throw protocolError()
    }

    return {
      notificationId: notification.receiptId,
      chatId: body.senderData.chatId,
      senderId: body.senderData.sender,
      text,
      timestamp: body.timestamp,
    }
  }
}

export function createGreenApiClient(
  credentials: GreenApiCredentials,
  http: ReturnType<typeof ky.create> = ky.create({ timeout: 15_000 }),
): GreenApiClient {
  return new HttpGreenApiClient(credentials, http)
}
