# GREEN API Telegram Chat — Design Contract

## Product truth

GREEN API Telegram Chat is a browser-only operator console for one text conversation. The user enters a GREEN-API instance ID, API token, and Telegram chat ID, connects the browser directly to the API, sends text, and watches incoming text notifications arrive. It is a local/manual test prototype, not a production messenger.

The primary job is **operate**: make the connection state, message direction, request state, and failure boundary unmistakable without hiding the fact that credentials are exposed to the browser.

## Research log

- **Context detection:** `project=green-api-telegram-chat`, `platform=desktop`, `stack=react`; searches were biased toward desktop web surfaces.
- **Corpus:** 8 planned searches (4 median-pattern queries, 4 edge/function-level queries), 105 raw results, 91 same-company-deduplicated results, 0 failed queries. The `Games` and `Editorial` edge queries were low coverage and are treated as directional, not as a complete market map.
- **Top-up:** `lazyweb_find_similar` was run against three strong references (messaging list, support inbox, and live event stream). It returned 15 additional results but none had `visionDescription`; they are not used as visual evidence.
- **Selection:** 18 references were selected from the text-described corpus. No reference screenshots are copied into the product. The product borrows structural mechanisms only.

### Reference clusters

1. **Conversation workspace** — Intercom, Front, Reddit, Patreon, Strut, WhatsApp, OutplayHQ, Afterpay, SolidRoad, Quicksilver, LinkedIn, and Slack consistently use a stable navigation region, a readable thread region, and a composer anchored to the bottom. The useful mechanism is orientation, not their navigation taxonomy.
2. **Activity and event stream** — Rarible, Threado, Substack, Trello, Bitdrift, Better Stack, Amplitude, PostHog, and Anime.js use timestamps, event rows, filters, and a visible live boundary. This informs the connection/receive state and the diagnostic tone of errors.
3. **Deliberate absence** — Intercom's empty inbox and messaging empty states show that an empty thread should explain what will happen next instead of displaying a blank panel or fake activity.

## Direction

### Thesis

Make the prototype feel like a **small signal desk**: a quiet, paper-colored operator surface where one conversation is the work, the API connection is a visible instrument, and every incoming or outgoing text has an unmistakable place in the timeline.

The category default to reject is a generic dashboard shell with a card grid, fake metrics, decorative gradients, and a chat widget floating inside it. This product has one job and one thread; the interface should make that constraint visible.

### Own-world

- **Material:** cool paper canvas, white working surfaces, hairline rules, and a single ink/navy text color. Blue is reserved for the user's outgoing messages and primary action; green is reserved for a confirmed live state; red is reserved for failures.
- **Component language:** compact operator labels, monospace identifiers, message bubbles with restrained corners, thin status rails, and square-ish controls with a 6px radius. No glass, glow, gradient, or floating card treatment.
- **Typography:** system sans for readable UI and system monospace for instance/chat IDs and request metadata. No display face, oversized headline, or decorative script.
- **Signature interaction:** the **connection rail** moves through `Setup → Connecting → Listening → Paused/Error` and is mirrored by a compact status pill in the thread header. It is both status and orientation: the user always knows whether the empty thread is waiting, blocked, or simply empty.

### First viewport

- A full-height application frame with a stable left connection rail and one main conversation sheet.
- The left region contains the product mark, lifecycle status, one active thread row, and the credential form; it does not contain fake folders, team navigation, or metrics.
- The main region contains the thread header with chat ID, direction, and mirrored connection status, a scrollable message timeline, and a bottom composer.
- On first run, the timeline area presents a focused empty-thread explanation while the connection form remains the single place to begin setup.
- The primary setup action is a high-contrast `Connect instance` button; after connection, the bottom composer becomes the primary text-send surface.

## Layout and responsive rules

- Desktop canvas: `min-height: 100dvh`, max width `1440px`, centered, with an `18rem minmax(0, 1fr)` two-column grid.
- The left rail scrolls independently within the full-height application frame. Below `860px`, it becomes a two-column top region before the conversation sheet.
- At `860px` and below, the connection summary and setup form sit side by side; the active thread row remains a compact context card. At `620px` and below, the rail stacks into a single column.
- At `620px` and below, metadata wraps below the thread title and composer actions stack without horizontal scrolling.
- The timeline uses `overflow-y: auto`; the composer input is capped at `40dvh` and the conversation sheet remains reachable.
- No horizontal scrollbars, fixed viewport-height content that hides the composer, or decorative empty regions.

## Tokens

```css
:root {
  color-scheme: light;
  --canvas: #f4f6f8;
  --surface: #ffffff;
  --surface-muted: #eef2f5;
  --ink: #17212b;
  --ink-soft: #41505d;
  --muted: #6d7a86;
  --line: #d9e1e7;
  --line-strong: #bcc8d1;
  --accent: #2f6fed;
  --accent-strong: #1f58c9;
  --accent-soft: #e8f0ff;
  --live: #18885b;
  --live-soft: #e4f5ed;
  --danger: #bd3f4a;
  --danger-soft: #fff0f1;
  --warning: #9a651b;
  --warning-soft: #fff6df;
  --focus: #1b64d9;
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-pill: 999px;
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 24px;
  --space-6: 32px;
  --space-7: 48px;
  --font-ui: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
```

Color is never the only signal. Status text, icon shape, and copy must distinguish setup, live, sending, waiting, and failure states.

## Primitive inventory

| Primitive | Purpose | Required states |
| --- | --- | --- |
| `AppFrame` | Owns viewport height, rail, and conversation sheet | desktop, compact, mobile |
| `ConnectionRail` | Shows the API lifecycle and last request result | setup, connecting, listening, paused, error |
| `TextField` | Instance ID and chat ID entry | default, focus, invalid, disabled |
| `SecretField` | API token entry with reveal toggle | masked, focus, invalid, disabled, revealed |
| `Button` | Connect, send, retry, disconnect | default, hover, focus, pressed, disabled, loading |
| `StatusPill` | Compact live/setup/error label | setup, connecting, live, paused, error |
| `MessageBubble` | One incoming or outgoing text event | incoming, outgoing, sending, failed, timestamp |
| `Composer` | Multiline text entry and send action | empty, typing, sending, disabled, error |
| `Notice` | Inline recovery or protocol explanation | info, warning, error, retry action |
| `EmptyThread` | Explains the next action when no messages exist | setup required, listening, no messages |
| `MetadataRow` | Shows IDs and request metadata in monospace | configured, unconfigured, ellipsized |

Every interactive primitive must expose a visible `:focus-visible` ring, a real disabled state, and an accessible name. Buttons use icons only when the icon has a stable accessible label; text remains the default for primary actions.

## State contract

### Setup

- Required fields: instance ID, API token, Telegram chat ID.
- Secret values are held in component memory only and are never written to local storage, URL parameters, logs, or source.
- Validation is inline and non-blocking. Do not claim a connection is valid until the first receive request completes or fails.
- The empty state names the direct-browser/CORS limitation without alarming copy.

### Connecting

- Connect button enters a loading state and the rail reads `Connecting`.
- The first `receiveNotification` request is the connection probe. A normal empty response after the five-second timeout is a successful listening state, not an error.
- A second connect attempt is disabled while the first is active.

### Listening

- The rail reads `Listening` with a green indicator and a short human explanation.
- The composer is enabled when instance ID, token, and chat ID are present and the client is not in a fatal error.
- The receive loop waits five seconds between requests and deletes each matching text notification before requesting the next one.

### Message send

- The user message appears as an outgoing bubble in a `Sending` state.
- A successful `sendMessage` response marks it `Sent`; a failure marks it `Failed` and exposes an inline retry action.
- No optimistic message is marked sent without a successful API response.

### Incoming message

- Only `incomingMessageReceived` + `textMessage` notifications become incoming bubbles.
- A newly received message is appended to the timeline's polite live region without a large entrance effect.
- The notification is deleted after processing. If deletion fails, show a recovery notice and stop treating the receive loop as healthy until the user retries or reconnects.

### Error

- Protocol, authentication, CORS/network, timeout, and malformed-response errors are presented as concise notices with a next action.
- Raw response bodies and credentials are never rendered.
- The error state preserves the entered non-secret IDs so the user can correct one field without retyping everything.

## Motion and interaction

- Use `120ms` ease-out color, border, shadow, and transform transitions for state changes; the loading spinner rotates at `900ms`.
- No gradients, glow, parallax, spring bounce, confetti, typing theatrics, or looping decorative animation.
- The live indicator pulses once every 2.5 seconds; reduced-motion preferences collapse transitions and animation duration.
- Message submission is explicit. Enter submits from the composer; Shift+Enter inserts a newline. The send button remains the discoverable primary path.
- New messages scroll the timeline to the latest position, and a `Jump to latest` affordance remains available after the first message.

## Accessibility and QA

- Use a labelled `<form>` for setup and a labelled `<form>` for the composer.
- Status changes and incoming message text use `aria-live="polite"`; blocking failures use `role="alert"`.
- The timeline is keyboard scrollable and each message is readable without relying on bubble color.
- Minimum target size is 40px for primary controls and 36px for quiet icon controls.
- Validation is split by surface: browser QA covers desktop and mobile layout, setup validation, visible focus, reduced-motion CSS, and a mocked receive/send/delete conversation; automated tests cover malformed responses, network failures, polling cleanup, and send retry state.

## Accepted debt

- One active conversation only; no thread search, inbox, archive, or multiple-chat state.
- Text messages only; no attachments, stickers, voice notes, contacts, locations, polls, or read receipts.
- Credentials are intentionally browser-visible for this prototype; production requires a backend credential boundary.
- No durable history, retry queue, reconnect/backoff policy, or offline queue.
- Direct requests may fail because of CORS; the UI must report that honestly and must not attempt a hidden proxy or token workaround.
- Synthetic/empty states are acceptable for the prototype, but no fake message history or fake delivery metrics may be shown as if they came from Telegram.

## Finish gate

The build is complete only when the connection rail, setup form, empty thread, outgoing/incoming message states, send failure, receive failure, and CORS/network failure are all reachable and visually coherent at desktop and mobile widths; the documented primitives are implemented rather than replaced by one-off markup; keyboard and reduced-motion behavior pass; and this file reflects the shipped implementation rather than an aspirational mockup.

FINISH: PASS for the prototype scope. Desktop and mobile browser QA passed with zero console errors, the mocked receive/send/delete flow completed successfully, and automated tests cover the failure paths. Live GREEN-API credentials and CORS behavior remain a manual environment check.
