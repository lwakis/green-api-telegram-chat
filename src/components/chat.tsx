import {
  ArrowDown,
  CircleAlert,
  CircleCheck,
  Clock3,
  MessageCircle,
  RefreshCw,
  Send,
} from "lucide-react"
import type { KeyboardEvent, ReactNode } from "react"

import type { ChatMessage, ChatPhase } from "../hooks/useGreenApiChat"
import { Button, MetadataRow, StatusPill } from "./controls"

type FormSubmitHandler = (event: { preventDefault: () => void }) => void

export function AppFrame({ children }: { readonly children: ReactNode }) {
  return <div className="app-frame">{children}</div>
}

const connectionSteps: ReadonlyArray<{ readonly phase: ChatPhase; readonly label: string }> = [
  { phase: "setup", label: "Setup" },
  { phase: "connecting", label: "Connect" },
  { phase: "listening", label: "Listen" },
]

const connectionDescriptions: Record<ChatPhase, string> = {
  setup: "Add the instance details to open a receive window.",
  connecting: "Waiting for the first five-second receive request.",
  listening: "Watching for incoming Telegram text notifications.",
  paused: "The receive loop is paused.",
  error: "The receive loop stopped. Review the notice and reconnect.",
}

function getStepState(
  currentPhase: ChatPhase,
  stepPhase: ChatPhase,
): "complete" | "current" | "upcoming" {
  const currentIndex = connectionSteps.findIndex((step) => step.phase === currentPhase)
  const stepIndex = connectionSteps.findIndex((step) => step.phase === stepPhase)

  if (currentPhase === "error") {
    return stepPhase === "connecting" || stepPhase === "setup" ? "complete" : "current"
  }

  if (currentIndex === -1 || stepIndex < currentIndex) {
    return "complete"
  }

  if (stepIndex === currentIndex) {
    return "current"
  }

  return "upcoming"
}

export function ConnectionRail({
  phase,
  instanceId,
  chatId,
}: {
  readonly phase: ChatPhase
  readonly instanceId: string
  readonly chatId: string
}) {
  return (
    <section className="connection-rail" aria-labelledby="connection-heading">
      <div className="connection-rail__heading">
        <div>
          <p className="eyebrow">API lifecycle</p>
          <h2 id="connection-heading">Connection</h2>
        </div>
        <StatusPill phase={phase} />
      </div>
      <ol className="connection-steps">
        {connectionSteps.map((step) => {
          const state = getStepState(phase, step.phase)
          return (
            <li className={`connection-step connection-step--${state}`} key={step.phase}>
              <span className="connection-step__marker" aria-hidden="true">
                {state === "complete" ? <CircleCheck className="icon" /> : null}
              </span>
              <span>
                <strong>{step.label}</strong>
                <small>{state === "current" ? connectionDescriptions[phase] : null}</small>
              </span>
            </li>
          )
        })}
      </ol>
      <p className="connection-rail__description">{connectionDescriptions[phase]}</p>
      <div className="connection-rail__metadata">
        <MetadataRow label="Instance" value={instanceId || "Not configured"} />
        <MetadataRow label="Chat ID" value={chatId || "Not configured"} />
        <MetadataRow label="Receive" value="5 second window" />
      </div>
    </section>
  )
}

export function ThreadHeader({
  phase,
  chatId,
  messageCount,
}: {
  readonly phase: ChatPhase
  readonly chatId: string
  readonly messageCount: number
}) {
  return (
    <header className="thread-header">
      <div className="thread-header__identity">
        <div className="thread-header__icon" aria-hidden="true">
          <MessageCircle className="icon" />
        </div>
        <div>
          <p className="eyebrow">Single active thread</p>
          <h1>Telegram text conversation</h1>
          <p className="thread-header__meta">
            <span className="mono">Chat {chatId || "—"}</span>
            <span aria-hidden="true">·</span>
            <span>
              {messageCount} {messageCount === 1 ? "message" : "messages"}
            </span>
          </p>
        </div>
      </div>
      <div className="thread-header__status">
        <StatusPill phase={phase} />
        <span className="thread-header__direction">Direct browser connection</span>
      </div>
    </header>
  )
}

export function MessageBubble({
  message,
  onRetry,
}: {
  readonly message: ChatMessage
  readonly onRetry: (messageId: string) => void
}) {
  const directionLabel = message.direction === "incoming" ? "Incoming" : "Outgoing"
  const statusLabel =
    message.status === "received"
      ? "Received"
      : message.status === "sending"
        ? "Sending"
        : message.status === "sent"
          ? "Sent"
          : "Failed"
  const time = new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(message.createdAt))

  return (
    <article className={`message-row message-row--${message.direction}`}>
      <div className="message-row__meta">
        <span>{directionLabel}</span>
        <time dateTime={new Date(message.createdAt).toISOString()}>{time}</time>
      </div>
      <div className={`message-bubble message-bubble--${message.direction}`}>
        <p>{message.text}</p>
        <div className="message-bubble__footer">
          <span className={`message-status message-status--${message.status}`}>
            {message.status === "sending" ? <Clock3 aria-hidden="true" className="icon" /> : null}
            {message.status === "received" ? (
              <CircleCheck aria-hidden="true" className="icon" />
            ) : null}
            {message.status === "failed" ? (
              <CircleAlert aria-hidden="true" className="icon" />
            ) : null}
            {statusLabel}
          </span>
          {message.status === "failed" ? (
            <Button
              icon={<RefreshCw aria-hidden="true" className="icon" />}
              onClick={() => onRetry(message.id)}
              variant="quiet"
            >
              Retry
            </Button>
          ) : null}
        </div>
      </div>
    </article>
  )
}

export function Composer({
  value,
  onChange,
  onSubmit,
  disabled,
  sending,
}: {
  readonly value: string
  readonly onChange: (value: string) => void
  readonly onSubmit: FormSubmitHandler
  readonly disabled: boolean
  readonly sending: boolean
}) {
  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault()
      event.currentTarget.form?.requestSubmit()
    }
  }

  return (
    <form className="composer" aria-label="Message composer" onSubmit={onSubmit}>
      <div className="composer__heading">
        <label className="field__label" htmlFor="message-input">
          Message
        </label>
        <span className="composer__hint">Enter to send · Shift+Enter for a new line</span>
      </div>
      <textarea
        aria-label="Message text"
        className="composer__input"
        disabled={disabled}
        id="message-input"
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={disabled ? "Connect an instance to start writing" : "Write a text message"}
        rows={3}
        value={value}
      />
      <div className="composer__actions">
        <span className="composer__safety">Text only · no attachments</span>
        <Button
          disabled={disabled || value.trim().length === 0}
          icon={<Send aria-hidden="true" className="icon" />}
          loading={sending}
          type="submit"
          variant="primary"
        >
          Send message
        </Button>
      </div>
    </form>
  )
}

export function EmptyThread({ phase }: { readonly phase: ChatPhase }) {
  const content: Record<ChatPhase, { title: string; body: string }> = {
    setup: {
      title: "Set up the direct connection",
      body: "Enter the instance details in the rail. The first receive request is the connection probe.",
    },
    connecting: {
      title: "Opening a receive window",
      body: "GREEN-API is being asked for the next text notification with a five-second timeout.",
    },
    listening: {
      title: "Listening for a text reply",
      body: "Incoming text notifications will appear here. Each processed notification is deleted before the next wait.",
    },
    paused: {
      title: "The thread is paused",
      body: "Reconnect the instance when you are ready to resume receiving text notifications.",
    },
    error: {
      title: "The receive loop needs attention",
      body: "Review the error notice, then reconnect. No credentials or raw API response body are shown here.",
    },
  }
  const current = content[phase]

  return (
    <div className={`empty-thread empty-thread--${phase}`}>
      <div className="empty-thread__mark" aria-hidden="true">
        {phase === "error" ? (
          <CircleAlert className="icon" />
        ) : (
          <ArrowDown aria-hidden="true" className="icon" />
        )}
      </div>
      <h2>{current.title}</h2>
      <p>{current.body}</p>
    </div>
  )
}
