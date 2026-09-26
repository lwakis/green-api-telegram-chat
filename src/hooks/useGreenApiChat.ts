import { useCallback, useEffect, useRef, useState } from "react"

import {
  createGreenApiClient,
  type GreenApiClient,
  type GreenApiCredentials,
  GreenApiError,
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

export function useGreenApiChat(options: UseGreenApiChatOptions = {}): UseGreenApiChatResult {
  const [phase, setPhase] = useState<ChatPhase>("setup")
  const [messages, setMessages] = useState<readonly ChatMessage[]>([])
  const [error, setError] = useState<GreenApiError | null>(null)
  const clientRef = useRef<GreenApiClient | null>(null)
  const operationRef = useRef(0)
  const mountedRef = useRef(false)

  const createClient = options.createClient ?? createGreenApiClient
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
    (credentials: GreenApiCredentials): void => {
      operationRef.current += 1
      const operationId = operationRef.current
      let client: GreenApiClient

      try {
        client = createClient(credentials)
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
      setPhase("connecting")
      void receiveLoop(client, operationId)
    },
    [createClient, isCurrentOperation, receiveLoop],
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
    connect,
    disconnect,
    sendText,
    retryMessage,
    clearError,
  }
}
