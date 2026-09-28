import { MessageCircleMore, ShieldAlert } from "lucide-react"
import type { ChatPhase } from "../hooks/useGreenApiChat"
import { ConnectionSummary } from "./connection-summary"
import type { FormSubmitEvent } from "./form-event"
import { SetupForm } from "./setup-form"

type ConnectionPanelProps = {
  readonly phase: ChatPhase
  readonly apiUrl: string
  readonly instanceId: string
  readonly apiTokenInstance: string
  readonly recipient: string
  readonly resolvedChatId: string | null
  readonly setupError: string | null
  readonly formLocked: boolean
  readonly onFieldChange: (
    field: "apiUrl" | "instanceId" | "apiTokenInstance" | "recipient",
    value: string,
  ) => void
  readonly onConnect: (event: FormSubmitEvent) => void
  readonly onDismissSetupError: () => void
}

export function ConnectionPanel({
  phase,
  apiUrl,
  instanceId,
  apiTokenInstance,
  recipient,
  resolvedChatId,
  setupError,
  formLocked,
  onFieldChange,
  onConnect,
  onDismissSetupError,
}: ConnectionPanelProps) {
  return (
    <aside className="connection-panel" aria-label="Connection settings">
      <header className="product-lockup">
        <span className="product-lockup__mark" aria-hidden="true">
          <MessageCircleMore className="icon icon--lg" />
        </span>
        <div>
          <p className="eyebrow eyebrow--rail">GREEN API / Telegram</p>
          <p className="product-lockup__name">Text bridge</p>
        </div>
      </header>

      <div className="connection-panel__content">
        <ConnectionSummary
          apiUrl={apiUrl}
          instanceId={instanceId}
          phase={phase}
          recipient={recipient}
          resolvedChatId={resolvedChatId}
        />
        <SetupForm
          apiUrl={apiUrl}
          apiTokenInstance={apiTokenInstance}
          formLocked={formLocked}
          instanceId={instanceId}
          onConnect={onConnect}
          onDismissError={onDismissSetupError}
          onFieldChange={onFieldChange}
          phase={phase}
          recipient={recipient}
          setupError={setupError}
        />
      </div>

      <footer className="browser-warning">
        <ShieldAlert aria-hidden="true" className="icon" />
        <p>
          Credentials stay in this tab and are visible to browser code. Use a test instance only.
        </p>
      </footer>
    </aside>
  )
}
