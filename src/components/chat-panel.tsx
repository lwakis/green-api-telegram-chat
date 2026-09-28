import { ArrowDown, LogOut, MessageCircle, RadioTower } from "lucide-react"
import type { RefObject } from "react"

import type { GreenApiError } from "../api/greenApi"
import type { ChatMessage, ChatPhase } from "../hooks/useGreenApiChat"
import { MessageComposer } from "./composer"
import { Button, Notice, StatusPill } from "./controls"
import { EmptyThread } from "./empty-thread"
import type { FormSubmitEvent } from "./form-event"
import { MessageBubble } from "./message-bubble"

type ChatPanelProps = {
  readonly phase: ChatPhase
  readonly instanceId: string
  readonly recipient: string
  readonly messages: readonly ChatMessage[]
  readonly error: GreenApiError | null
  readonly draft: string
  readonly sending: boolean
  readonly atBottom: boolean
  readonly timelineRef: RefObject<HTMLDivElement | null>
  readonly onDraftChange: (value: string) => void
  readonly onSend: (event: FormSubmitEvent) => Promise<void>
  readonly onRetryMessage: (messageId: string) => void
  readonly onRetryConnection: () => void
  readonly onDisconnect: () => void
  readonly onDismissError: () => void
  readonly onJumpToLatest: () => void
  readonly onTimelineScroll: () => void
}

export function ChatPanel({
  phase,
  instanceId,
  recipient,
  messages,
  error,
  draft,
  sending,
  atBottom,
  timelineRef,
  onDraftChange,
  onSend,
  onRetryMessage,
  onRetryConnection,
  onDisconnect,
  onDismissError,
  onJumpToLatest,
  onTimelineScroll,
}: ChatPanelProps) {
  const isConnected = phase === "listening"
  const hasThread = messages.length > 0

  return (
    <main className="chat-panel">
      <header className="chat-header">
        <div className="chat-header__identity">
          <span className="chat-header__avatar" aria-hidden="true">
            <MessageCircle className="icon" />
          </span>
          <div className="chat-header__copy">
            <p className="eyebrow">Active thread</p>
            <h1>Telegram text conversation</h1>
            <p className="chat-header__meta">
              <span className="mono">Chat {recipient || "—"}</span>
              <span aria-hidden="true">·</span>
              <span>
                {messages.length} {messages.length === 1 ? "message" : "messages"}
              </span>
            </p>
          </div>
        </div>
        <div className="chat-header__actions">
          <StatusPill phase={phase} />
          {phase !== "setup" ? (
            <Button
              icon={<LogOut aria-hidden="true" className="icon" />}
              onClick={onDisconnect}
              variant="quiet"
            >
              Disconnect
            </Button>
          ) : null}
        </div>
      </header>

      <section className="transport-strip" aria-label="Connection details">
        <span>
          <RadioTower aria-hidden="true" className="icon icon--xs" />
          Direct browser request
        </span>
        <span className="mono">api.green-api.com</span>
        <span>Instance {instanceId || "—"}</span>
      </section>

      {error !== null ? (
        <div className="chat-notice">
          <Notice
            action={
              phase === "error" ? (
                <Button onClick={onRetryConnection} variant="quiet">
                  Retry connection
                </Button>
              ) : (
                <Button onClick={onDismissError} variant="quiet">
                  Dismiss
                </Button>
              )
            }
            tone={phase === "error" ? "error" : "warning"}
          >
            {error.message}
          </Notice>
        </div>
      ) : null}

      <section className="thread-panel" aria-label="Telegram message timeline">
        <div
          aria-busy={phase === "connecting"}
          aria-live="polite"
          aria-relevant="additions"
          className="thread-panel__scroll"
          onScroll={onTimelineScroll}
          ref={timelineRef}
          role="log"
        >
          {hasThread ? (
            <div className="message-list">
              {messages.map((message) => (
                <MessageBubble key={message.id} message={message} onRetry={onRetryMessage} />
              ))}
            </div>
          ) : (
            <EmptyThread phase={phase} />
          )}
        </div>
        {hasThread && !atBottom ? (
          <div className="thread-panel__jump">
            <Button
              icon={<ArrowDown aria-hidden="true" className="icon" />}
              onClick={onJumpToLatest}
              variant="secondary"
            >
              Jump to latest
            </Button>
          </div>
        ) : null}
      </section>

      <div className="chat-composer-wrap">
        <MessageComposer
          disabled={!isConnected}
          onChange={onDraftChange}
          onSubmit={onSend}
          sending={sending}
          value={draft}
        />
        <p className="chat-composer-wrap__note">
          Text only · notifications are acknowledged after processing · no local history
        </p>
      </div>
    </main>
  )
}
