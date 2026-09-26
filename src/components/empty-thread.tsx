import { CircleAlert, type LucideIcon, MessagesSquare, Pause, PlugZap, Radio } from "lucide-react"

import type { ChatPhase } from "../hooks/useGreenApiChat"

type EmptyState = {
  readonly title: string
  readonly body: string
  readonly icon: LucideIcon
}

const emptyStates: Record<ChatPhase, EmptyState> = {
  setup: {
    title: "Connect the text thread",
    body: "Add the instance ID, API token, and Telegram chat ID. The first receive request checks the connection.",
    icon: PlugZap,
  },
  connecting: {
    title: "Opening a receive window",
    body: "GREEN-API is waiting for the next text notification with a five-second timeout.",
    icon: Radio,
  },
  listening: {
    title: "Waiting for a text reply",
    body: "Incoming text appears here after GREEN-API returns and acknowledges the notification.",
    icon: MessagesSquare,
  },
  paused: {
    title: "The thread is paused",
    body: "Reconnect from the settings panel when you are ready to receive again.",
    icon: Pause,
  },
  error: {
    title: "The receive loop stopped",
    body: "Review the connection notice and reconnect. Raw API responses and credentials stay hidden.",
    icon: CircleAlert,
  },
}

export function EmptyThread({ phase }: { readonly phase: ChatPhase }) {
  const state = emptyStates[phase]
  const Icon = state.icon

  return (
    <div className={`empty-thread empty-thread--${phase}`}>
      <span className="empty-thread__mark" aria-hidden="true">
        <Icon className="icon icon--lg" />
      </span>
      <p className="eyebrow">Text conversation</p>
      <h2>{state.title}</h2>
      <p>{state.body}</p>
    </div>
  )
}
