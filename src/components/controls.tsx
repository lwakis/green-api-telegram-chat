import { Eye, EyeOff, LoaderCircle } from "lucide-react"
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react"
import { useState } from "react"

import type { ChatPhase } from "../hooks/useGreenApiChat"

export type ButtonVariant = "primary" | "secondary" | "quiet" | "danger"

export type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> & {
  readonly variant?: ButtonVariant
  readonly loading?: boolean
  readonly icon?: ReactNode
}

export function Button({
  children,
  variant = "secondary",
  loading = false,
  icon,
  disabled,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      className={`button button--${variant}`}
      type={type}
      disabled={disabled === true || loading}
      aria-busy={loading || undefined}
    >
      {loading ? <LoaderCircle aria-hidden="true" className="icon icon--spin" /> : icon}
      <span>{children}</span>
    </button>
  )
}

export type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "className" | "id"> & {
  readonly id: string
  readonly label: string
  readonly hint?: string
  readonly error?: string
}

export function TextField({ id, label, hint, error, id: inputId, ...props }: TextFieldProps) {
  const hintId = hint === undefined ? undefined : `${inputId}-hint`
  const errorId = error === undefined ? undefined : `${inputId}-error`
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined

  return (
    <label className="field" htmlFor={inputId}>
      <span className="field__label">{label}</span>
      <input
        {...props}
        id={inputId}
        className={`field__input${error === undefined ? "" : " field__input--invalid"}`}
        aria-invalid={error === undefined ? undefined : true}
        aria-describedby={describedBy}
      />
      {hint !== undefined ? (
        <span className="field__hint" id={hintId}>
          {hint}
        </span>
      ) : null}
      {error !== undefined ? (
        <span className="field__error" id={errorId}>
          {error}
        </span>
      ) : null}
    </label>
  )
}

export type SecretFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "className" | "type"> & {
  readonly id: string
  readonly label: string
  readonly hint?: string
  readonly error?: string
}

export function SecretField({
  id: inputId,
  label,
  hint,
  error,
  disabled,
  ...props
}: SecretFieldProps) {
  const [revealed, setRevealed] = useState(false)
  const hintId = hint === undefined ? undefined : `${inputId}-hint`
  const errorId = error === undefined ? undefined : `${inputId}-error`
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined

  return (
    <label className="field" htmlFor={inputId}>
      <span className="field__label">{label}</span>
      <span className="secret-field">
        <input
          {...props}
          id={inputId}
          className={`field__input secret-field__input${error === undefined ? "" : " field__input--invalid"}`}
          type={revealed ? "text" : "password"}
          disabled={disabled}
          aria-invalid={error === undefined ? undefined : true}
          aria-describedby={describedBy}
        />
        <button
          aria-label={revealed ? `Hide ${label}` : `Reveal ${label}`}
          className="secret-field__toggle"
          disabled={disabled}
          onClick={() => setRevealed((currentRevealed) => !currentRevealed)}
          type="button"
        >
          {revealed ? (
            <EyeOff aria-hidden="true" className="icon" />
          ) : (
            <Eye aria-hidden="true" className="icon" />
          )}
        </button>
      </span>
      {hint !== undefined ? (
        <span className="field__hint" id={hintId}>
          {hint}
        </span>
      ) : null}
      {error !== undefined ? (
        <span className="field__error" id={errorId}>
          {error}
        </span>
      ) : null}
    </label>
  )
}

const phaseLabels: Record<ChatPhase, string> = {
  setup: "Setup",
  connecting: "Connecting",
  listening: "Listening",
  paused: "Paused",
  error: "Error",
}

export function StatusPill({ phase }: { readonly phase: ChatPhase }) {
  return (
    <span className={`status-pill status-pill--${phase}`} aria-live="polite">
      <span className="status-pill__dot" aria-hidden="true" />
      {phaseLabels[phase]}
    </span>
  )
}

export function MetadataRow({
  label,
  value,
  mono = true,
}: {
  readonly label: string
  readonly value: string
  readonly mono?: boolean
}) {
  return (
    <div className="metadata-row">
      <span className="metadata-row__label">{label}</span>
      <span
        className={mono ? "metadata-row__value metadata-row__value--mono" : "metadata-row__value"}
      >
        {value}
      </span>
    </div>
  )
}

export function Notice({
  tone,
  children,
  action,
}: {
  readonly tone: "info" | "warning" | "error"
  readonly children: ReactNode
  readonly action?: ReactNode
}) {
  return (
    <div className={`notice notice--${tone}`} role={tone === "error" ? "alert" : "status"}>
      <div className="notice__content">{children}</div>
      {action !== undefined ? <div className="notice__action">{action}</div> : null}
    </div>
  )
}
