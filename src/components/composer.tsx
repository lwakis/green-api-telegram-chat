import { Send } from "lucide-react"
import type { KeyboardEvent } from "react"

import { Button } from "./controls"
import type { FormSubmitEvent } from "./form-event"

type MessageComposerProps = {
  readonly value: string
  readonly disabled: boolean
  readonly sending: boolean
  readonly onChange: (value: string) => void
  readonly onSubmit: (event: FormSubmitEvent) => void | Promise<void>
}

export function MessageComposer({
  value,
  disabled,
  sending,
  onChange,
  onSubmit,
}: MessageComposerProps) {
  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault()
      event.currentTarget.form?.requestSubmit()
    }
  }

  return (
    <form className="message-composer" aria-label="Message composer" onSubmit={onSubmit}>
      <label className="sr-only" htmlFor="message-input">
        Message text
      </label>
      <textarea
        aria-describedby="composer-hint"
        className="message-composer__input"
        disabled={disabled}
        id="message-input"
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={disabled ? "Connect an instance to start writing" : "Write a text message"}
        rows={1}
        value={value}
      />
      <div className="message-composer__footer">
        <span className="message-composer__hint" id="composer-hint">
          Enter to send · Shift+Enter for a new line
        </span>
        <Button
          disabled={disabled || value.trim().length === 0}
          icon={<Send aria-hidden="true" className="icon" />}
          loading={sending}
          type="submit"
          variant="primary"
        >
          Send
        </Button>
      </div>
    </form>
  )
}
