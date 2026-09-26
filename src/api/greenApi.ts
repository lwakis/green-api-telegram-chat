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

const credentialsInputSchema = z.object({
  apiUrl: apiUrlSchema,
  instanceId: instanceIdSchema,
  apiTokenInstance: apiTokenSchema,
  chatId: chatIdSchema,
})

const scalarIdSchema = z.union([z.string(), z.number()]).transform((value) => String(value))

const sendResponseSchema = z.looseObject({
  idMessage: scalarIdSchema.pipe(notificationIdSchema),
})

const deleteResponseSchema = z.looseObject({
  result: z.literal(true),
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
export type NotificationId = z.infer<typeof notificationIdSchema>

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

class HttpGreenApiClient implements GreenApiClient {
  constructor(
    private readonly credentials: GreenApiCredentials,
    private readonly http: ReturnType<typeof ky.create>,
  ) {}

  async sendText(text: string): Promise<void> {
    const response = await this.request(this.endpoint("sendMessage"), {
      method: "POST",
      json: {
        chatId: this.credentials.chatId,
        message: text,
      },
    })
    const result = sendResponseSchema.safeParse(await this.parseJsonResponse(response))

    if (!result.success) {
      throw this.protocolError()
    }
  }

  async receiveText(): Promise<IncomingTextMessage | null> {
    const response = await this.request(
      `${this.endpoint("receiveNotification")}?receiveTimeout=${receiveTimeoutSeconds}`,
    )
    const responseText = await this.readResponseText(response)

    if (responseText.trim() === "") {
      return null
    }

    const payload = this.parseJson(responseText)
    const result = notificationEnvelopeSchema.safeParse(payload)

    if (!result.success) {
      throw this.protocolError()
    }

    const incomingMessage = this.normalizeIncomingText(result.data)
    await this.deleteNotification(result.data.receiptId)
    return incomingMessage
  }

  async deleteNotification(notificationId: NotificationId): Promise<void> {
    const response = await this.request(
      this.endpoint("deleteNotification", encodeURIComponent(notificationId)),
      { method: "DELETE" },
    )
    const result = deleteResponseSchema.safeParse(await this.parseJsonResponse(response))

    if (!result.success) {
      throw this.protocolError()
    }
  }

  private endpoint(action: string, suffix?: string): string {
    const base = `${this.credentials.apiUrl}/waInstance${encodeURIComponent(this.credentials.instanceId)}/${action}/${encodeURIComponent(this.credentials.apiTokenInstance)}`
    return suffix === undefined ? base : `${base}/${suffix}`
  }

  private async request(url: string, options: Options = {}): Promise<Response> {
    try {
      const response = await this.http(url, { ...options, retry: 0 })

      if (response.ok) {
        return response
      }

      const code = response.status === 401 || response.status === 403 ? "auth" : "api"
      throw new GreenApiError(
        code,
        `GREEN-API request failed with status ${response.status}.`,
        response.status,
      )
    } catch (error) {
      if (error instanceof GreenApiError) {
        throw error
      }

      if (error instanceof HTTPError) {
        const { status } = error.response
        const code = status === 401 || status === 403 ? "auth" : "api"
        throw new GreenApiError(code, `GREEN-API request failed with status ${status}.`, status)
      }

      throw new GreenApiError(
        "network",
        "The direct browser request to GREEN-API failed. Check the network and CORS policy.",
      )
    }
  }

  private async readResponseText(response: Response): Promise<string> {
    try {
      return await response.text()
    } catch {
      throw new GreenApiError("network", "GREEN-API returned a response that could not be read.")
    }
  }

  private parseJson(responseText: string): unknown {
    try {
      const payload: unknown = JSON.parse(responseText)
      return payload
    } catch {
      throw this.protocolError()
    }
  }

  private async parseJsonResponse(response: Response): Promise<unknown> {
    const responseText = await this.readResponseText(response)

    if (responseText.trim() === "") {
      throw this.protocolError()
    }

    return this.parseJson(responseText)
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
      throw this.protocolError()
    }

    return {
      notificationId: notification.receiptId,
      chatId: body.senderData.chatId,
      senderId: body.senderData.sender,
      text,
      timestamp: body.timestamp,
    }
  }

  private protocolError(): GreenApiError {
    return new GreenApiError("protocol", "GREEN-API returned an unexpected notification payload.")
  }
}

export function createGreenApiClient(
  credentials: GreenApiCredentials,
  http: ReturnType<typeof ky.create> = ky.create({ timeout: 15_000 }),
): GreenApiClient {
  return new HttpGreenApiClient(credentials, http)
}
