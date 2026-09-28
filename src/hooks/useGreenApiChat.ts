import { useCallback, useEffect, useRef, useState } from "react"

import {
  type ChatId,
  createGreenApiClient,
  type GreenApiClient,
  type GreenApiConnection,
  type GreenApiConnectionInput,
  type GreenApiCredentials,
  GreenApiError,
  type Recipient,
  resolveRecipientChatId,
} from "../api/greenApi"
import {
  type ChatMessage,
  type ChatPhase,
  createIncomingChatMessage,
  createOutgoingChatMessage,
  normalizeChatError,
  updateMessageStatus,
} from "./chatModel"

export type { ChatMessage, ChatPhase } from "./chatModel"

export type ChatClientFactory = (credentials: GreenApiCredentials) => GreenApiClient
export type ChatIdResolver = (
  recipient: Recipient,
  connection: GreenApiConnection,
) => Promise<ChatId>

type UseGreenApiChatOptions = {
  readonly createClient?: ChatClientFactory
  readonly resolveChatId?: ChatIdResolver
  readonly now?: () => number
}

type UseGreenApiChatResult = {
  readonly phase: ChatPhase
  readonly messages: readonly ChatMessage[]
  readonly error: GreenApiError | null
  readonly chatId: ChatId | null
  readonly connect: (input: GreenApiConnectionInput) => Promise<void>
  readonly disconnect: () => void
  readonly sendText: (text: string) => Promise<boolean>
  readonly retryMessage: (messageId: string) => Promise<boolean>
  readonly clearError: () => void
}

export function useGreenApiChat(options: UseGreenApiChatOptions = {}): UseGreenApiChatResult {
  const [phase, setPhase] = useState<ChatPhase>("setup")
  const [messages, setMessages] = useState<readonly ChatMessage[]>([])
  const [error, setError] = useState<GreenApiError | null>(null)
  const [chatId, setChatId] = useState<ChatId | null>(null)
  const clientRef = useRef<GreenApiClient | null>(null)
  const operationRef = useRef(0)
  const mountedRef = useRef(false)
  const resolvedRef = useRef<{ readonly recipient: Recipient; readonly chatId: ChatId } | null>(
    null,
  )

  const createClient = options.createClient ?? createGreenApiClient
  const resolveChatId = options.resolveChatId ?? resolveRecipientChatId
  const now = options.now ?? Date.now

  const isCurrentOperation = useCallback(
    (operationId: number): boolean => mountedRef.current && operationRef.current === operationId,
    [],
  )

  const receiveLoop = useCallback(
    async (client: GreenApiClient, operationId: number): Promise<void> => {
      while (isCurrentOperation(operationId)) {
        try {
          const incomingMessage = await client.receiveText()

          if (!isCurrentOperation(operationId)) {
            return
          }

          setPhase((currentPhase) => (currentPhase === "error" ? currentPhase : "listening"))

          if (incomingMessage !== null) {
            setMessages((currentMessages) => [
              ...currentMessages,
              createIncomingChatMessage(incomingMessage, now()),
            ])
          }
        } catch (receiveError) {
          if (isCurrentOperation(operationId)) {
            setError(normalizeChatError(receiveError))
            setPhase("error")
          }

          return
        }
      }
    },
    [isCurrentOperation, now],
  )

  const connect = useCallback(
    async (input: GreenApiConnectionInput): Promise<void> => {
      operationRef.current += 1
      const operationId = operationRef.current
      const { recipient, ...connection } = input
      setPhase("connecting")

      // Telegram rate-limits repeated lookups of numbers it cannot resolve, so a recipient is looked
      // up once and the result reused for reconnects to the same chat.
      const cached = resolvedRef.current
      let resolvedChatId: ChatId

      if (cached !== null && cached.recipient === recipient) {
        resolvedChatId = cached.chatId
      } else {
        try {
          resolvedChatId = await resolveChatId(recipient, connection)
        } catch (resolveError) {
          if (isCurrentOperation(operationId)) {
            setError(normalizeChatError(resolveError))
            setPhase("error")
          }
          return
        }
      }

      if (!isCurrentOperation(operationId)) {
        return
      }

      resolvedRef.current = { recipient, chatId: resolvedChatId }
      setChatId(resolvedChatId)

      let client: GreenApiClient

      try {
        client = createClient({ ...connection, chatId: resolvedChatId })
      } catch (createError) {
        if (isCurrentOperation(operationId)) {
          setError(normalizeChatError(createError))
          setPhase("error")
        }
        return
      }

      clientRef.current = client
      setMessages([])
      setError(null)
      void receiveLoop(client, operationId)
    },
    [createClient, isCurrentOperation, receiveLoop, resolveChatId],
  )

  const disconnect = useCallback((): void => {
    operationRef.current += 1
    clientRef.current = null
    setChatId(null)
    setError(null)
    setPhase("setup")
  }, [])

  const deliverOutgoing = useCallback(
    async (message: ChatMessage, client: GreenApiClient, operationId: number): Promise<boolean> => {
      try {
        await client.sendText(message.text)

        if (isCurrentOperation(operationId)) {
          setMessages((currentMessages) => updateMessageStatus(currentMessages, message.id, "sent"))
        }

        return true
      } catch (sendError) {
        if (isCurrentOperation(operationId)) {
          setMessages((currentMessages) =>
            updateMessageStatus(currentMessages, message.id, "failed"),
          )
          setError(normalizeChatError(sendError))
        }

        return false
      }
    },
    [isCurrentOperation],
  )

  const sendText = useCallback(
    async (text: string): Promise<boolean> => {
      const client = clientRef.current

      if (client === null) {
        if (mountedRef.current) {
          setError(new GreenApiError("validation", "Connect an instance before sending."))
        }
        return false
      }

      if (text.trim().length === 0) {
        if (mountedRef.current) {
          setError(new GreenApiError("validation", "Enter a message before sending."))
        }
        return false
      }

      const message = createOutgoingChatMessage(text, now())
      const operationId = operationRef.current
      setMessages((currentMessages) => [...currentMessages, message])
      return deliverOutgoing(message, client, operationId)
    },
    [deliverOutgoing, now],
  )

  const retryMessage = useCallback(
    async (messageId: string): Promise<boolean> => {
      const client = clientRef.current
      const message = messages.find(
        (currentMessage) =>
          currentMessage.id === messageId &&
          currentMessage.direction === "outgoing" &&
          currentMessage.status === "failed",
      )

      if (client === null || message === undefined) {
        return false
      }

      const operationId = operationRef.current
      setMessages((currentMessages) => updateMessageStatus(currentMessages, messageId, "sending"))
      return deliverOutgoing(message, client, operationId)
    },
    [deliverOutgoing, messages],
  )

  const clearError = useCallback((): void => {
    if (mountedRef.current) {
      setError(null)
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true

    return () => {
      mountedRef.current = false
      operationRef.current += 1
    }
  }, [])

  return {
    phase,
    messages,
    error,
    chatId,
    connect,
    disconnect,
    sendText,
    retryMessage,
    clearError,
  }
}
