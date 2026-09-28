import { PlugZap } from "lucide-react"
import type { ChatPhase } from "../hooks/useGreenApiChat"
import { Button, Notice, SecretField, TextField } from "./controls"
import type { FormSubmitEvent } from "./form-event"

type SetupField = "apiUrl" | "instanceId" | "apiTokenInstance" | "recipient"

type SetupFormProps = {
  readonly phase: ChatPhase
  readonly apiUrl: string
  readonly instanceId: string
  readonly apiTokenInstance: string
  readonly recipient: string
  readonly formLocked: boolean
  readonly setupError: string | null
  readonly onFieldChange: (field: SetupField, value: string) => void
  readonly onConnect: (event: FormSubmitEvent) => void
  readonly onDismissError: () => void
}

export function SetupForm({
  phase,
  apiUrl,
  instanceId,
  apiTokenInstance,
  recipient,
  formLocked,
  setupError,
  onFieldChange,
  onConnect,
  onDismissError,
}: SetupFormProps) {
  const isConnecting = phase === "connecting"
  const isListening = phase === "listening"

  return (
    <form className="setup-form" aria-label="GREEN-API connection setup" onSubmit={onConnect}>
      <div className="setup-form__heading">
        <div>
          <p className="eyebrow eyebrow--rail">Direct connection</p>
          <h2>Instance access</h2>
        </div>
        <PlugZap aria-hidden="true" className="icon setup-form__heading-icon" />
      </div>

      <TextField
        autoComplete="url"
        disabled={formLocked}
        hint="The account-specific host from your GREEN-API console."
        id="api-url"
        inputMode="url"
        label="API URL"
        onChange={(event) => onFieldChange("apiUrl", event.target.value)}
        placeholder="https://4100.api.green-api.com"
        value={apiUrl}
      />
      <TextField
        autoComplete="off"
        disabled={formLocked}
        hint="The numeric ID from your GREEN-API account."
        id="instance-id"
        inputMode="numeric"
        label="Instance ID"
        onChange={(event) => onFieldChange("instanceId", event.target.value)}
        placeholder="1234567890"
        value={instanceId}
      />
      <SecretField
        autoComplete="off"
        disabled={formLocked}
        hint="Kept in memory for this tab only."
        id="api-token"
        label="Instance API token"
        onChange={(event) => onFieldChange("apiTokenInstance", event.target.value)}
        placeholder="Paste the instance token"
        value={apiTokenInstance}
      />
      <TextField
        autoComplete="off"
        disabled={formLocked}
        hint="International format, with or without a leading +; an @username also works for numbers hidden by privacy settings."
        id="recipient"
        inputMode="tel"
        label="Recipient"
        onChange={(event) => onFieldChange("recipient", event.target.value)}
        placeholder="79876543210 or @username"
        value={recipient}
      />

      {setupError !== null ? (
        <Notice
          action={
            <Button onClick={onDismissError} variant="quiet">
              Dismiss
            </Button>
          }
          tone="error"
        >
          {setupError}
        </Notice>
      ) : null}

      <Button
        disabled={isListening}
        icon={<PlugZap aria-hidden="true" className="icon" />}
        loading={isConnecting}
        type="submit"
        variant="primary"
      >
        {phase === "error" ? "Reconnect instance" : "Connect instance"}
      </Button>
    </form>
  )
}
