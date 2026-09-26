# GREEN API Telegram Chat Prototype

A browser-only React/TypeScript prototype for one text-only Telegram conversation through a dedicated [GREEN-API Telegram instance](https://green-api.com/telegram/docs/). The browser sends messages, polls incoming notifications, and acknowledges each processed notification. It is for local development and manual verification, not production.

## Important security warning

This prototype has **no backend proxy**. The GREEN-API API URL, instance ID, and instance API token are used by browser code, so they can be seen in browser memory, developer tools, and network requests. Anyone who can inspect the running page or capture its traffic may be able to reuse the credentials.

Never commit credentials, hardcode them in source, or treat a static build as a secure way to hide them. Use a real instance only for testing. A production version needs a server-side credential store and a backend that performs API calls.

Direct browser requests also depend on CORS. If the browser blocks a request because of CORS, React cannot bypass that restriction. This prototype has no server-side proxy, alternative request transport, or CORS workaround.

## Prerequisites

- Bun 1.3.14 or a compatible newer Bun release
- A GREEN-API Telegram account and an active Telegram instance
- The account-specific `apiUrl` shown in the GREEN-API console, for example `https://4100.api.green-api.com`
- The instance ID and instance API token
- A numeric Telegram chat ID allowed to interact with the instance; group and channel IDs may be negative
- A browser and network connection that permit direct HTTPS requests to the configured GREEN-API host

Bun is the runtime and package manager for this project. Node and pnpm are not required.

## Commands

```bash
bun install
bunx playwright install chromium
bun run dev
bun run test
bun run test:e2e
bun run typecheck
bun run lint
bun run build
bun run preview
```

Use `bun run dev` to start the local development server, `bun run test` to run the unit tests, `bun run test:e2e` to run the Playwright browser test, `bun run typecheck` to run TypeScript without emitting files, `bun run lint` to run Biome checks, and `bun run build` to create a production build.

`bun run test:e2e` needs a Chromium build that matches the installed Playwright version. Run `bunx playwright install chromium` once after installing dependencies, and again whenever Playwright is upgraded. The command starts its own development server on `127.0.0.1:5173` and drives the app in a real browser with mocked GREEN-API routes, so it never contacts a live instance.

## GREEN-API Telegram request flow

The client uses the account-specific API URL from the GREEN-API console. Do not replace it with a generic WhatsApp host. The request path shape is:

```text
{{apiUrl}}/waInstance{{idInstance}}/{{method}}/{{apiTokenInstance}}
```

For example, with `apiUrl=https://4100.api.green-api.com`, `idInstance=123`, and an instance token:

```text
https://4100.api.green-api.com/waInstance123/sendMessage/{{apiTokenInstance}}
```

The client follows this order:

1. Send `POST sendMessage` with a JSON body:

   ```json
   {
     "chatId": "123456789",
     "message": "Hello from the browser"
   }
   ```

   A successful response includes an `idMessage` value.

2. Call `GET receiveNotification?receiveTimeout=5`. The GREEN-API notification wait accepts values from 5 to 60 seconds; this prototype uses the minimum five-second wait.

3. Process only incoming text notifications. The relevant response shape is:

   ```json
   {
     "receiptId": 456,
     "body": {
       "typeWebhook": "incomingMessageReceived",
       "timestamp": 1700000000,
       "senderData": {
         "chatId": "123456789",
         "sender": "123456789"
       },
       "messageData": {
         "typeMessage": "textMessage",
         "textMessageData": {
           "textMessage": "Reply from Telegram"
         }
       }
     }
   }
   ```

4. After a notification is processed, acknowledge it with `DELETE deleteNotification/{receiptId}`. The request must return `{ "result": true }`; a failed acknowledgement is treated as a protocol error.

5. Poll `receiveNotification` again. An empty response during the wait is normal and means that no notification arrived during that interval.

The dedicated Telegram gateway uses numeric chat IDs. WhatsApp-style identifiers such as `987@c.us` are rejected by the client.

## Manual verification

1. Run `bun install`, then `bun run dev`.
2. Open the local URL printed by the development server.
3. Enter the GREEN-API console `apiUrl`, instance ID, instance API token, and numeric Telegram chat ID at runtime. Do not put credentials in source files.
4. Send a short text message and confirm in the browser network panel that the request is `POST .../sendMessage/...` and sends `chatId` plus `message` in the JSON body.
5. Confirm that the recipient receives the message, then send a text reply from another Telegram client.
6. Confirm that `GET .../receiveNotification/...?receiveTimeout=5` returns the reply and that the UI reads `body.messageData.textMessageData.textMessage`.
7. Confirm that the processed notification is acknowledged with `DELETE .../deleteNotification/.../{receiptId}` and that the response contains `result: true`.
8. Confirm that another receive poll starts after acknowledgement and that the processed notification is not shown again.
9. Check the browser console and network panel for errors, especially CORS failures.

## Prototype limitations

- Text messages only. Only `incomingMessageReceived` notifications whose `messageData.typeMessage` is `textMessage` are displayed.
- Media, stickers, contacts, locations, polls, and other notification types are not processed.
- One active conversation only; there is no durable history or database.
- No backend proxy, server-side secret storage, user authentication, or tenant isolation.
- No production-grade delivery-status, retry, or reconnect policy.
- Direct browser access may be blocked by CORS.
- API credentials are exposed to the browser and must be treated as compromised.

## Official references

- [GREEN-API Telegram documentation](https://green-api.com/telegram/docs/)
- [Request format](https://green-api.com/telegram/docs/request-format/)
- [Sending messages](https://green-api.com/telegram/docs/api/sending/SendMessage/)
- [Receiving notifications](https://green-api.com/telegram/docs/api/receiving/technology-http-api/ReceiveNotification/)
- [Deleting notifications](https://green-api.com/telegram/docs/api/receiving/technology-http-api/DeleteNotification/)
- [Telegram chat IDs](https://green-api.com/telegram/docs/api/chat-id/)
- [Before starting](https://green-api.com/telegram/docs/before-start/)
- [Important differences](https://green-api.com/telegram/docs/important-differences/)
