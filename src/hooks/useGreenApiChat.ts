import { useCallback, useEffect, useRef, useState } from "react"

import {
  createGreenApiClient,
  type GreenApiClient,
  type GreenApiCredentials,
  GreenApiError,
  type IncomingTextMessage,
  type NotificationId,
} from "../api/greenApi"

export type ChatPhase = "setup" | "connecting" | "listening" | "paused" | "error"

export type ChatMessage = {
  readonly id: string
  readonly direction: "incoming" | "outgoing"
  readonly text: string
  readonly createdAt: number
  readonly status: "received" | "sending" | "sent" | "failed"
  readonly notificationId?: NotificationId
}

export type ChatClientFactory = (credentials: GreenApiCredentials) => GreenApiClient

type UseGreenApiChatOptions = {
  readonly createClient?: ChatClientFactory
  readonly now?: () => number
}

type UseGreenApiChatResult = {
  readonly phase: ChatPhase
  readonly messages: readonly ChatMessage[]
  readonly error: GreenApiError | null
  readonly connect: (credentials: GreenApiCredentials) => void
  readonly disconnect: () => void
  readonly sendText: (text: string) => Promise<boolean>
  readonly retryMessage: (messageId: string) => Promise<boolean>
  readonly clearError: () => void
}

let messageSequence = 0

function createMessageId(): string {
  messageSequence += 1
  return `message-${Date.now()}-${messageSequence}`
}

function normalizeError(error: unknown): GreenApiError {
  if (error instanceof GreenApiError) {
    return error
  }

  return new GreenApiError("protocol", "The chat client encountered an unexpected error.")
}

export function useGreenApiChat(options: UseGreenApiChatOptions = {}): UseGreenApiChatResult {
  const [phase, setPhase] = useState<ChatPhase>("setup")
  const [messages, setMessages] = useState<readonly ChatMessage[]>([])
  const [error, setError] = useState<GreenApiError | null>(null)
  const clientRef = useRef<GreenApiClient | null>(null)
  const operationRef = useRef(0)
  const mountedRef = useRef(false)
  const messagesRef = useRef<readonly ChatMessage[]>([])
  const createClientRef = useRef<ChatClientFactory>(options.createClient ?? createGreenApiClient)
  const nowRef = useRef<() => number>(options.now ?? Date.now)

  createClientRef.current = options.createClient ?? createGreenApiClient
  nowRef.current = options.now ?? Date.now
  messagesRef.current = messages

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

          if (incomingMessage === null) {
            continue
          }

          setMessages((currentMessages) => [
            ...currentMessages,
            createIncomingMessage(incomingMessage, nowRef.current()),
          ])

          try {
            await client.deleteNotification(incomingMessage.notificationId)
          } catch (deleteError) {
            if (isCurrentOperation(operationId)) {
              setError(normalizeError(deleteError))
              setPhase("error")
            }

            return
          }
        } catch (receiveError) {
          if (isCurrentOperation(operationId)) {
            setError(normalizeError(receiveError))
            setPhase("error")
          }

          return
        }
      }
    },
    [isCurrentOperation],
  )

  const connect = useCallback(
    (credentials: GreenApiCredentials): void => {
      operationRef.current += 1
      const operationId = operationRef.current
      let client: GreenApiClient

      try {
        client = createClientRef.current(credentials)
      } catch (createError) {
        if (isCurrentOperation(operationId)) {
          setError(normalizeError(createError))
          setPhase("error")
        }
        return
      }

      clientRef.current = client
      setMessages([])
      setError(null)
      setPhase("connecting")
      void receiveLoop(client, operationId)
    },
    [isCurrentOperation, receiveLoop],
  )

  const disconnect = useCallback((): void => {
    operationRef.current += 1
    clientRef.current = null
    setError(null)
    setPhase("setup")
  }, [])

  const deliverOutgoing = useCallback(
    async (message: ChatMessage, client: GreenApiClient, operationId: number): Promise<boolean> => {
      try {
        await client.sendText(message.text)

        if (isCurrentOperation(operationId)) {
          setMessages((currentMessages) =>
            currentMessages.map((currentMessage) =>
              currentMessage.id === message.id
                ? { ...currentMessage, status: "sent" }
                : currentMessage,
            ),
          )
        }

        return true
      } catch (sendError) {
        if (isCurrentOperation(operationId)) {
          setMessages((currentMessages) =>
            currentMessages.map((currentMessage) =>
              currentMessage.id === message.id
                ? { ...currentMessage, status: "failed" }
                : currentMessage,
            ),
          )
          setError(normalizeError(sendError))
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

      const message: ChatMessage = {
        id: createMessageId(),
        direction: "outgoing",
        text,
        createdAt: nowRef.current(),
        status: "sending",
      }
      const operationId = operationRef.current
      setMessages((currentMessages) => [...currentMessages, message])
      return deliverOutgoing(message, client, operationId)
    },
    [deliverOutgoing],
  )

  const retryMessage = useCallback(
    async (messageId: string): Promise<boolean> => {
      const client = clientRef.current
      const message = messagesRef.current.find(
        (currentMessage) =>
          currentMessage.id === messageId &&
          currentMessage.direction === "outgoing" &&
          currentMessage.status === "failed",
      )

      if (client === null || message === undefined) {
        return false
      }

      const operationId = operationRef.current
      setMessages((currentMessages) =>
        currentMessages.map((currentMessage) =>
          currentMessage.id === messageId
            ? { ...currentMessage, status: "sending" }
            : currentMessage,
        ),
      )
      return deliverOutgoing(message, client, operationId)
    },
    [deliverOutgoing],
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
    connect,
    disconnect,
    sendText,
    retryMessage,
    clearError,
  }
}

function createIncomingMessage(
  incomingMessage: IncomingTextMessage,
  createdAt: number,
): ChatMessage {
  return {
    id: createMessageId(),
    direction: "incoming",
    text: incomingMessage.text,
    createdAt,
    status: "received",
    notificationId: incomingMessage.notificationId,
  }
}
