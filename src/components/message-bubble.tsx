import { CircleAlert, CircleCheck, Clock3, RefreshCw } from "lucide-react"

import type { ChatMessage } from "../hooks/useGreenApiChat"
import { Button } from "./controls"

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
})

const statusCopy: Record<ChatMessage["status"], string> = {
  received: "Received",
  sending: "Sending",
  sent: "Sent",
  failed: "Failed",
}

export function MessageBubble({
  message,
  onRetry,
}: {
  readonly message: ChatMessage
  readonly onRetry: (messageId: string) => void
}) {
  const direction = message.direction === "incoming" ? "Incoming" : "Outgoing"
  const createdAt = new Date(message.createdAt)

  return (
    <article
      aria-label={`${direction} message, ${statusCopy[message.status]}`}
      className={`message-row message-row--${message.direction}`}
    >
      <div className={`message-bubble message-bubble--${message.direction}`}>
        <p className="message-bubble__text">{message.text}</p>
        <div className="message-bubble__meta">
          <span className="message-bubble__direction">{direction}</span>
          <time dateTime={createdAt.toISOString()}>{timeFormatter.format(createdAt)}</time>
          <span className={`message-status message-status--${message.status}`}>
            {message.status === "sending" ? (
              <Clock3 aria-hidden="true" className="icon icon--xs" />
            ) : null}
            {message.status === "sent" || message.status === "received" ? (
              <CircleCheck aria-hidden="true" className="icon icon--xs" />
            ) : null}
            {message.status === "failed" ? (
              <CircleAlert aria-hidden="true" className="icon icon--xs" />
            ) : null}
            {statusCopy[message.status]}
          </span>
        </div>
        {message.status === "failed" ? (
          <div className="message-bubble__retry">
            <Button
              icon={<RefreshCw aria-hidden="true" className="icon" />}
              onClick={() => onRetry(message.id)}
              variant="quiet"
            >
              Retry send
            </Button>
          </div>
        ) : null}
      </div>
    </article>
  )
}
