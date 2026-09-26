# GREEN API Telegram Chat — Design Contract

## Product truth

GREEN API Telegram Chat is a browser-only operator console for one Telegram text conversation. The operator enters a GREEN-API instance ID, instance API token, and Telegram chat ID, then sends and receives text directly from the browser.

The product is a local/manual test prototype, not a production messenger. It has no backend, no durable history, no attachments, and no credential storage.

## Design mode

**Operate.** The primary job is to make one connection, one thread, and one recovery path unmistakable. The interface should feel like a focused Telegram client surface without pretending to be Telegram itself.

The rejected category default is a generic analytics dashboard: equal-weight cards, fake metrics, decorative gradients, and a chat widget floating inside a shell. This product has one active thread and one connection lifecycle; the layout must make that constraint visible.

## Research log

- **Reference:** `https://web.telegram.org/`, observed through public source and the available unauthenticated login evidence. Authenticated Telegram Web screens were not available and are not claimed as pixel evidence.
- **Source evidence:** `/tmp/opencode/telegram-web-k/src/scss/variables.scss`, `src/scss/base.scss`, `src/scss/partials/_chat.scss`, `_chatBubble.scss`, `_row.scss`, and `_simpleMessageInput.scss`.
- **Visual evidence:** `telegram-web-auth-1280.png`, `telegram-web-1280-auth.yml`, and `telegram-web-auth-1280-deep.yml` in the project root.
- **Extracted structural rules:** 12/16/24px radius family; 360px default sidebar; 3.5rem list rows; 3rem chat header; 3rem minimum input; 16px composer radius; 85% desktop bubble width; centered capped chat content; sidebar docks above 925px and floats below it.
- **Scope decision:** use the source rules for proportions, rhythm, and state language; use this project's own content, warning copy, and product identity rather than Telegram branding or assets.

## Direction

### Thesis

A graphite setup rail and a quiet blue-gray conversation canvas make the single text thread feel like the work. Telegram blue is reserved for the operator's outgoing messages and active connection; neutral surfaces keep the receive boundary and error states easy to scan.

### Own-world

- **Material:** graphite navigation, cool blue-gray canvas, white work surfaces, one Telegram-blue action color, hairline separators, and restrained soft elevation for the composer and floating controls.
- **Component language:** compact rows, rounded rectangular controls, low-contrast metadata, and message bubbles with a clear direction and status line. No glass, glow, gradients, or decorative texture.
- **Typography:** system sans for the interface; system monospace only for instance IDs, chat IDs, and transport metadata.
- **Signature interaction:** the connection state is always visible in the rail, the thread header, and the composer affordance; the thread never pretends to be live when it is only configured.
- **Product boundary:** the browser credential warning is a visible setup footnote, not a hidden disclaimer.

## First viewport

- The desktop layout is a two-pane application: a stable `360px` graphite rail and a flexible conversation sheet.
- The rail contains the product name, one connection status, the active thread summary, the credential form, and a direct-browser warning.
- The conversation sheet contains a `3rem` top bar, an optional error notice, a centered capped message timeline, and a bottom composer.
- The empty timeline explains the next action for setup, connecting, listening, paused, and error phases. It never shows invented messages or metrics.
- The first action is `Connect instance`; after a successful first receive poll, the composer becomes the primary action.

## Layout and responsive rules

- Desktop: `min-height: 100dvh`, sidebar `360px`, centered conversation content capped at `48rem`, and no horizontal overflow.
- Tablet below `925px`: the rail becomes a floating or stacked region above the conversation sheet; the conversation remains usable without squeezing message text.
- Mobile at `600px` and below: one column; the rail stacks; header metadata wraps; controls remain at least `40px` high; the composer stays visible below the timeline.
- The timeline is the only independently scrolling message region. The composer is anchored to the bottom and its textarea is capped at `40dvh`.
- Message rows use `85%` maximum bubble width on desktop; narrow screens use the available width minus the mobile gutter.
- Reduced motion removes nonessential transitions, loading rotation, and status pulsing.

## Tokens

```css
:root {
  color-scheme: light;
  --canvas: #e7edf3;
  --surface: #ffffff;
  --surface-muted: #f5f7f9;
  --rail: #212121;
  --rail-raised: #2b2b2b;
  --rail-text: #f5f5f5;
  --rail-muted: #a7a7a7;
  --ink: #17212b;
  --ink-soft: #526170;
  --muted: #707b86;
  --line: #d7dfe6;
  --line-strong: #b9c5cf;
  --accent: #5288c1;
  --accent-strong: #3f6f9f;
  --accent-soft: #e5f0fb;
  --live: #3aa76d;
  --live-soft: #e7f6ed;
  --danger: #c24b4b;
  --danger-soft: #fff0f0;
  --warning: #9a651b;
  --warning-soft: #fff6df;
  --focus: #377fbd;
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-pill: 999px;
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 24px;
  --space-6: 32px;
  --font-ui: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
```

Color is never the only signal. Status copy, icons, borders, and focus rings must distinguish setup, connecting, listening, paused, sending, sent, failed, and error states.

## Primitive inventory

| Primitive | Purpose | Required states |
| --- | --- | --- |
| `AppFrame` | Owns the viewport, rail, and conversation sheet | desktop, tablet, mobile |
| `ConnectionPanel` | Shows the API lifecycle and active thread identity | setup, connecting, listening, paused, error |
| `SetupForm` | Collects the three runtime values | default, focus, invalid, disabled, loading |
| `Button` | Connect, disconnect, send, retry, dismiss | default, hover, focus, pressed, disabled, loading |
| `TextField` / `SecretField` | Capture IDs and the masked token | default, focus, invalid, disabled, revealed |
| `StatusPill` | Communicates lifecycle state with text and color | setup, connecting, listening, paused, error |
| `MessageBubble` | Shows one incoming or outgoing text event | received, sending, sent, failed |
| `MessageComposer` | Captures and submits text | disabled, empty, typing, sending, keyboard submission |
| `Notice` | Gives concise recovery or protocol context | info, warning, error, action |
| `EmptyThread` | Explains the current next action | setup, connecting, listening, paused, error |
| `MetadataRow` | Shows IDs and protocol facts | configured, unconfigured, ellipsized |

Every interactive primitive has an accessible name, a visible `:focus-visible` ring, and a real disabled state. Primary buttons, text fields, the composer, and the token reveal toggle keep a `40px` or larger target; `quiet` recovery buttons step down to `36px`, and `Retry send` inside a bubble to `28px` so it stays clear of the bubble edge. The status pill and the transport strip are not interactive and sit below that floor. Primary actions use text plus an optional Lucide icon; icons are never emoji or unlabeled glyphs.

## State contract

### Setup

- The operator must provide instance ID, API token, and Telegram chat ID.
- Secrets remain in component memory only; never persist them in local storage, URL parameters, logs, or source.
- Validation is inline and the empty state explains that the first receive request is the connection probe.
- The rail warns that direct browser calls can fail because of CORS and exposes credentials to the page.

### Connecting

- The primary setup action becomes `Connecting` and cannot be submitted twice.
- The first `receiveNotification` request is the probe. An empty response after the five-second window is a successful listening state, not an error.
- The timeline and composer show the connecting state without fake activity.

### Listening

- The rail and header read `Listening` and show a live indicator plus human explanation.
- The composer is enabled when all three values are present and the client is not in a fatal receive state.
- The receive loop waits five seconds per request and processes only incoming text notifications.

### Message send

- An outgoing message appears immediately with `Sending` status.
- It becomes `Sent` only after the API resolves; a failure becomes `Failed` and exposes `Retry`.
- The composer clears only after a successful send and never presents a failed message as delivered.

### Incoming message

- Only `incomingMessageReceived` with a text message is shown as an incoming bubble.
- The notification is acknowledged by the client after processing; the UI does not issue a second delete.
- The timeline scroll follows new messages and exposes `Jump to latest` after the first message.

### Error and recovery

- Protocol, authentication, network/CORS, timeout, and malformed-response failures are concise notices with a next action.
- Raw response bodies and credentials are never rendered.
- The form preserves non-secret IDs after a failure so one field can be corrected without retyping everything.

## Motion and interaction

- Use `120ms` ease-out transitions for background, border, and text color, plus transform; the focus ring transitions its border and shadow on the same curve.
- The loading indicator rotates only while work is active; the live dot makes one restrained status pulse. Those two status signals are the only looping animations in the build.
- No gradients, glow, parallax, spring bounce, confetti, typing theatrics, or looping decorative animation.
- Enter submits from the composer; Shift+Enter inserts a newline. The send button remains the discoverable path.
- `prefers-reduced-motion: reduce` collapses transitions and animation duration.

## Accessibility and QA

- Use labelled forms for setup and composer, `aria-live="polite"` for status and incoming additions, and `role="alert"` for blocking errors.
- The timeline is keyboard scrollable; message direction and status remain readable without bubble color.
- Placeholder and secondary text must meet WCAG AA contrast on their actual surfaces.
- Browser QA must cover setup, connecting, listening, empty, incoming, outgoing, sending, sent, failed send, receive failure, CORS/network failure, keyboard focus, reduced motion, and 375/768/1280px layouts.
- Automated tests must cover malformed responses, network failures, polling cleanup, send retry state, and the acknowledgement boundary.

## Accepted debt

- One active conversation only; no search, inbox, archive, multiple chats, or contacts.
- Text messages only; no attachments, stickers, voice notes, polls, locations, or read receipts.
- Credentials are intentionally browser-visible for this prototype; production requires a backend credential boundary.
- No durable history, offline queue, reconnect/backoff policy, or delivery guarantees beyond the API response.
- Direct requests may fail because of CORS; the UI reports this honestly and does not add a hidden proxy.
- No Telegram logo, official assets, or claims of affiliation are used.

## Finish gate

The build is complete only when the rail, setup form, empty states, message states, send failure, receive failure, and CORS/network failure are reachable at 375/768/1280px; the primitives above are implemented rather than replaced by one-off markup; keyboard and reduced-motion behavior pass; typecheck, lint, unit tests, browser tests, and the production build pass; and this file reflects the shipped implementation rather than an aspirational mockup.

FINISH: PASS. Typecheck, lint, 16 unit tests, 7 browser tests, and the production build are green. `e2e/chat-smoke.spec.ts` asserts keyboard-only connect, reduced-motion behavior, overflow-free layout at 375/768/1280px, and the send, protocol, and CORS/network failure notices at each of those widths.
