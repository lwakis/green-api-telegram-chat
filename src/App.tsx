import { LogOut, Radio, ShieldAlert } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { GreenApiError, parseGreenApiCredentials } from "./api/greenApi"
import {
  AppFrame,
  Composer,
  ConnectionRail,
  EmptyThread,
  MessageBubble,
  ThreadHeader,
} from "./components/chat"
import { Button, MetadataRow, Notice, SecretField, TextField } from "./components/controls"
import { useGreenApiChat } from "./hooks/useGreenApiChat"

type FormSubmitEvent = { preventDefault: () => void }

export function App() {
  const [instanceId, setInstanceId] = useState("")
  const [apiTokenInstance, setApiTokenInstance] = useState("")
  const [chatId, setChatId] = useState("")
  const [draft, setDraft] = useState("")
  const [formError, setFormError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const threadScrollRef = useRef<HTMLDivElement>(null)
  const { phase, messages, error, connect, disconnect, sendText, retryMessage, clearError } =
    useGreenApiChat()

  const isConnected = phase === "listening"
  const isConnecting = phase === "connecting"
  const isFormLocked = phase === "connecting" || phase === "listening"

  useEffect(() => {
    const timeline = threadScrollRef.current

    if (timeline !== null && messages.length > 0) {
      timeline.scrollTo({ top: timeline.scrollHeight, behavior: "smooth" })
    }
  }, [messages.length])

  function updateField(setter: (value: string) => void, value: string): void {
    setter(value)
    setFormError(null)
  }

  function connectWithCurrentCredentials(): void {
    try {
      const credentials = parseGreenApiCredentials({ instanceId, apiTokenInstance, chatId })
      setFormError(null)
      connect(credentials)
    } catch (caughtError) {
      setFormError(
        caughtError instanceof GreenApiError
          ? caughtError.message
          : "Check the instance details and try again.",
      )
    }
  }

  function handleConnect(event: FormSubmitEvent): void {
    event.preventDefault()
    connectWithCurrentCredentials()
  }

  function handleDisconnect(): void {
    disconnect()
    setFormError(null)
  }

  async function handleSend(event: FormSubmitEvent): Promise<void> {
    event.preventDefault()

    if (!isConnected || sending) {
      return
    }

    setSending(true)
    const sent = await sendText(draft)
    setSending(false)

    if (sent) {
      setDraft("")
    }
  }

  function jumpToLatest(): void {
    threadScrollRef.current?.scrollTo({
      top: threadScrollRef.current.scrollHeight,
      behavior: "smooth",
    })
  }

  const visibleError = formError ?? error?.message ?? null
  const setupNotice = isConnected
    ? "Credentials stay in this tab only. Do not use a production instance for this prototype."
    : "The browser calls GREEN-API directly. CORS or network errors will appear here without exposing raw response data."

  return (
    <AppFrame>
      <aside className="app-rail">
        <div className="brand-lockup">
          <div className="brand-lockup__mark" aria-hidden="true">
            <Radio className="icon" />
          </div>
          <div>
            <p className="eyebrow">GREEN API / Telegram</p>
            <p className="brand-lockup__name">Signal desk</p>
          </div>
        </div>

        <ConnectionRail phase={phase} instanceId={instanceId} chatId={chatId} />

        <section className="thread-index" aria-label="Active thread">
          <p className="eyebrow">Active thread</p>
          <div className="thread-index__row">
            <span className="thread-index__marker" aria-hidden="true" />
            <span>
              <strong>Telegram text</strong>
              <small>{isConnected ? "Listening now" : "Waiting for setup"}</small>
            </span>
          </div>
        </section>

        <form
          className="setup-form"
          aria-label="GREEN-API connection setup"
          onSubmit={handleConnect}
        >
          <div className="setup-form__heading">
            <div>
              <p className="eyebrow">Direct connection</p>
              <h2>Instance credentials</h2>
            </div>
            <span className="setup-form__index">01</span>
          </div>
          <TextField
            autoComplete="off"
            disabled={isFormLocked}
            id="instance-id"
            inputMode="numeric"
            label="Instance ID"
            onChange={(event) => updateField(setInstanceId, event.target.value)}
            placeholder="1234567890"
            value={instanceId}
          />
          <SecretField
            autoComplete="off"
            disabled={isFormLocked}
            id="api-token"
            label="API token"
            onChange={(event) => updateField(setApiTokenInstance, event.target.value)}
            placeholder="Paste the instance token"
            value={apiTokenInstance}
          />
          <TextField
            autoComplete="off"
            disabled={isFormLocked}
            id="chat-id"
            inputMode="numeric"
            label="Telegram chat ID"
            onChange={(event) => updateField(setChatId, event.target.value)}
            placeholder="1234567890"
            value={chatId}
          />
          {visibleError !== null ? (
            <Notice
              action={
                <Button onClick={clearError} variant="quiet">
                  Dismiss
                </Button>
              }
              tone="error"
            >
              {visibleError}
            </Notice>
          ) : null}
          <Button disabled={isConnected} loading={isConnecting} type="submit" variant="primary">
            {phase === "error" ? "Reconnect instance" : "Connect instance"}
          </Button>
        </form>

        <div className="rail-footer">
          <ShieldAlert aria-hidden="true" className="icon" />
          <p>{setupNotice}</p>
        </div>
      </aside>

      <main className="conversation-sheet">
        <ThreadHeader phase={phase} chatId={chatId} messageCount={messages.length} />

        <div className="sheet-toolbar">
          <div className="sheet-toolbar__status">
            <span className="sheet-toolbar__label">Transport</span>
            <span className="mono">api.green-api.com</span>
          </div>
          <div className="sheet-toolbar__actions">
            {phase !== "setup" ? (
              <Button
                icon={<LogOut aria-hidden="true" className="icon" />}
                onClick={handleDisconnect}
                variant="quiet"
              >
                Disconnect
              </Button>
            ) : null}
          </div>
        </div>

        {error !== null ? (
          <div className="sheet-notice">
            <Notice
              action={
                <Button onClick={connectWithCurrentCredentials} variant="quiet">
                  Retry connection
                </Button>
              }
              tone="error"
            >
              {error.message}
            </Notice>
          </div>
        ) : null}

        <section className="thread-panel" aria-label="Telegram message timeline">
          <div
            aria-live="polite"
            aria-relevant="additions"
            className="thread-panel__scroll"
            ref={threadScrollRef}
            role="log"
          >
            {messages.length === 0 ? (
              <EmptyThread phase={phase} />
            ) : (
              <div className="message-list">
                {messages.map((message) => (
                  <MessageBubble
                    key={message.id}
                    message={message}
                    onRetry={(messageId) => void retryMessage(messageId)}
                  />
                ))}
              </div>
            )}
          </div>
          {messages.length > 0 ? (
            <div className="thread-panel__jump">
              <Button
                icon={<Radio aria-hidden="true" className="icon" />}
                onClick={jumpToLatest}
                variant="quiet"
              >
                Jump to latest
              </Button>
            </div>
          ) : null}
        </section>

        <Composer
          disabled={!isConnected}
          onChange={setDraft}
          onSubmit={handleSend}
          sending={sending}
          value={draft}
        />

        <footer className="conversation-footer">
          <MetadataRow label="Mode" value="Text only" mono={false} />
          <MetadataRow label="Delete" value="After processing" mono={false} />
          <span className="conversation-footer__note">Local prototype · no message history</span>
        </footer>
      </main>
    </AppFrame>
  )
}
