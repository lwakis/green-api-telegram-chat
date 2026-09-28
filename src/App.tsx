import { useEffect, useRef, useState } from "react"

import { GreenApiError, parseConnectionInput } from "./api/greenApi"
import { AppFrame, ChatPanel } from "./components/chat"
import { ConnectionPanel } from "./components/connection-panel"
import { useGreenApiChat } from "./hooks/useGreenApiChat"

type SetupField = "apiUrl" | "instanceId" | "apiTokenInstance" | "recipient"

type FormSubmitEvent = { preventDefault: () => void }

function preferredScrollBehavior(): ScrollBehavior {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"
}

const BOTTOM_SLACK_PX = 48

export function App() {
  const [apiUrl, setApiUrl] = useState("")
  const [instanceId, setInstanceId] = useState("")
  const [apiTokenInstance, setApiTokenInstance] = useState("")
  const [recipient, setRecipient] = useState("")
  const [draft, setDraft] = useState("")
  const [setupError, setSetupError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [atBottom, setAtBottom] = useState(true)
  const timelineRef = useRef<HTMLDivElement>(null)
  const {
    phase,
    messages,
    error,
    chatId,
    connect,
    disconnect,
    sendText,
    retryMessage,
    clearError,
  } = useGreenApiChat()

  const isConnected = phase === "listening"
  const formLocked = phase === "connecting" || phase === "listening"

  useEffect(() => {
    const timeline = timelineRef.current

    if (timeline === null || messages.length === 0) {
      return
    }

    const distanceFromBottom = timeline.scrollHeight - timeline.scrollTop - timeline.clientHeight

    if (distanceFromBottom < BOTTOM_SLACK_PX) {
      timeline.scrollTo({ top: timeline.scrollHeight, behavior: preferredScrollBehavior() })
    }
  }, [messages.length])

  function updateField(field: SetupField, value: string): void {
    if (field === "apiUrl") {
      setApiUrl(value)
    } else if (field === "instanceId") {
      setInstanceId(value)
    } else if (field === "apiTokenInstance") {
      setApiTokenInstance(value)
    } else {
      setRecipient(value)
    }

    setSetupError(null)
  }

  async function connectWithCurrentRecipient(): Promise<void> {
    try {
      const input = parseConnectionInput({ apiUrl, instanceId, apiTokenInstance, recipient })
      setSetupError(null)
      await connect(input)
    } catch (caughtError) {
      setSetupError(
        caughtError instanceof GreenApiError
          ? caughtError.message
          : "Check the instance details and try again.",
      )
    }
  }

  function handleConnect(event: FormSubmitEvent): void {
    event.preventDefault()
    void connectWithCurrentRecipient()
  }

  function handleDisconnect(): void {
    disconnect()
    setSetupError(null)
  }

  async function handleSend(event: FormSubmitEvent): Promise<void> {
    event.preventDefault()

    if (!isConnected || sending) {
      return
    }

    setSending(true)

    try {
      if (await sendText(draft)) {
        setDraft("")
      }
    } finally {
      setSending(false)
    }
  }

  function handleTimelineScroll(): void {
    const timeline = timelineRef.current

    if (timeline !== null) {
      setAtBottom(
        timeline.scrollHeight - timeline.scrollTop - timeline.clientHeight < BOTTOM_SLACK_PX,
      )
    }
  }

  function jumpToLatest(): void {
    const timeline = timelineRef.current

    if (timeline !== null) {
      timeline.scrollTo({ top: timeline.scrollHeight, behavior: preferredScrollBehavior() })
      setAtBottom(true)
    }
  }

  return (
    <AppFrame>
      <ConnectionPanel
        apiUrl={apiUrl}
        apiTokenInstance={apiTokenInstance}
        formLocked={formLocked}
        instanceId={instanceId}
        onConnect={handleConnect}
        onDismissSetupError={() => setSetupError(null)}
        onFieldChange={updateField}
        phase={phase}
        recipient={recipient}
        resolvedChatId={chatId}
        setupError={setupError}
      />
      <ChatPanel
        atBottom={atBottom}
        draft={draft}
        error={error}
        instanceId={instanceId}
        messages={messages}
        onDisconnect={handleDisconnect}
        onDismissError={clearError}
        onDraftChange={setDraft}
        onJumpToLatest={jumpToLatest}
        onRetryConnection={() => void connectWithCurrentRecipient()}
        onRetryMessage={(messageId) => void retryMessage(messageId)}
        onSend={handleSend}
        onTimelineScroll={handleTimelineScroll}
        phase={phase}
        recipient={recipient}
        sending={sending}
        timelineRef={timelineRef}
      />
    </AppFrame>
  )
}
