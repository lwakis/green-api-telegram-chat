import { GreenApiError, type IncomingTextMessage, type NotificationId } from "../api/greenApi"

export type ChatPhase = "setup" | "connecting" | "listening" | "paused" | "error"

export type ChatMessageStatus = "received" | "sending" | "sent" | "failed"

export type ChatMessage = {
  readonly id: string
  readonly direction: "incoming" | "outgoing"
  readonly text: string
  readonly createdAt: number
  readonly status: ChatMessageStatus
  readonly notificationId?: NotificationId
}

let messageSequence = 0

function createMessageId(createdAt: number): string {
  messageSequence += 1
  return `message-${createdAt}-${messageSequence}`
}

export function normalizeChatError(error: unknown): GreenApiError {
  if (error instanceof GreenApiError) {
    return error
  }

  return new GreenApiError("protocol", "The chat client encountered an unexpected error.")
}

export function createIncomingChatMessage(
  incomingMessage: IncomingTextMessage,
  createdAt: number,
): ChatMessage {
  return {
    id: createMessageId(createdAt),
    direction: "incoming",
    text: incomingMessage.text,
    createdAt,
    status: "received",
    notificationId: incomingMessage.notificationId,
  }
}

export function createOutgoingChatMessage(text: string, createdAt: number): ChatMessage {
  return {
    id: createMessageId(createdAt),
    direction: "outgoing",
    text,
    createdAt,
    status: "sending",
  }
}

export function updateMessageStatus(
  messages: readonly ChatMessage[],
  messageId: string,
  status: ChatMessageStatus,
): readonly ChatMessage[] {
  return messages.map((message) => (message.id === messageId ? { ...message, status } : message))
}
