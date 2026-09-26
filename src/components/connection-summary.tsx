import { MessageCircle } from "lucide-react"

import type { ChatPhase } from "../hooks/useGreenApiChat"
import { MetadataRow, StatusPill } from "./controls"

function formatGateway(apiUrl: string): string {
  try {
    return new URL(apiUrl).host
  } catch {
    return apiUrl
  }
}

const phaseCopy: Record<ChatPhase, { readonly label: string; readonly detail: string }> = {
  setup: { label: "Ready to connect", detail: "Add the instance details" },
  connecting: { label: "Opening receive window", detail: "Checking the first poll" },
  listening: { label: "Listening for text", detail: "Five-second notification waits" },
  paused: { label: "Receive loop paused", detail: "Reconnect to continue" },
  error: { label: "Connection stopped", detail: "Review the recovery notice" },
}

export function ConnectionSummary({
  phase,
  apiUrl,
  instanceId,
  chatId,
}: {
  readonly phase: ChatPhase
  readonly apiUrl: string
  readonly instanceId: string
  readonly chatId: string
}) {
  const copy = phaseCopy[phase]

  return (
    <section className="connection-summary" aria-labelledby="connection-summary-heading">
      <div className="connection-summary__heading">
        <div>
          <p className="eyebrow eyebrow--rail">Connection</p>
          <h2 id="connection-summary-heading">{copy.label}</h2>
        </div>
        <StatusPill phase={phase} />
      </div>
      <p className="connection-summary__detail">{copy.detail}</p>

      <section className="active-thread" aria-label="Active thread">
        <span className="active-thread__icon" aria-hidden="true">
          <MessageCircle className="icon" />
        </span>
        <span className="active-thread__copy">
          <strong>Telegram text</strong>
          <small>{chatId ? `Chat ${chatId}` : "No chat selected"}</small>
        </span>
        <span className="active-thread__count" role="status" aria-label="One active thread">
          1
        </span>
      </section>

      <div className="connection-summary__metadata">
        <MetadataRow label="Gateway" value={apiUrl ? formatGateway(apiUrl) : "Not configured"} />
        <MetadataRow label="Instance" value={instanceId || "Not configured"} />
        <MetadataRow label="Chat ID" value={chatId || "Not configured"} />
        <MetadataRow label="Receive" value="5 seconds" />
      </div>
    </section>
  )
}
