# GREEN API Telegram Chat Prototype

A greenfield React prototype for a text-only Telegram chat backed by GREEN-API. The browser calls GREEN-API directly to send messages, receive incoming text notifications, and delete each notification after processing it. It is meant for local development and manual verification, not production.

## Important security warning

This prototype has **no backend proxy**. The GREEN-API instance ID and API token must be used by browser code, so they can be seen in browser memory, developer tools, and network requests. Anyone who can inspect the running page or capture its traffic may be able to reuse the credentials.

Never commit credentials, hardcode them in source, or treat a static build as a secure way to hide them. Use a real instance only for testing. A production version needs a server-side credential store and a backend that performs API calls.

Direct browser requests also depend on CORS. If the browser blocks a request because of CORS, React cannot bypass that restriction. This prototype has no server-side proxy, alternative request transport, or CORS workaround.

## Prerequisites

- Bun 1.3.14 or a compatible newer Bun release
- A GREEN-API account and an active instance
- The instance ID and instance API token
- A Telegram chat ID allowed to interact with the GREEN-API instance
- A browser and network connection that permit direct requests to `api.green-api.com`

Bun is the runtime and package manager for this project. Node and pnpm aren't required.

## Planned Bun commands

The implementation should provide these package scripts:

```bash
bun install
bun run dev
bun run build
bun run test
```

Use `bun install` to install dependencies, `bun run dev` to start the local development server, `bun run build` to create a production build, and `bun run test` to run the automated tests. These commands become available once the implementation adds the corresponding `package.json` scripts.

## GREEN-API request flow

The verified base URL shape is:

```text
https://api.green-api.com/waInstance{{idInstance}}/...
```

For this instance, complete the URL with `GreenApiAuthToken{{apiTokenInstance}}`, then append the lowercase endpoint name. For example:

```text
https://api.green-api.com/waInstance{{idInstance}}/GreenApiAuthToken{{apiTokenInstance}}/sendMessage
```

Replace each `{{...}}` placeholder with a value from your own GREEN-API instance. Double braces are documentation placeholders and aren't part of the final URL.

The prototype follows this order:

1. Send a `POST` request to `sendMessage` with this JSON body:

   ```json
   {
     "chatId": "<CHAT_ID>",
     "textMessage": "<MESSAGE_TEXT>"
   }
   ```

2. Call `GET receiveNotification?receiveTimeout=5`. The allowed `receiveTimeout` range is 5-60 seconds; the prototype uses the exact 5-second request shown here.

3. Process only notifications where both conditions are true:

   ```js
   notification.typeWebhook === "incomingMessageReceived" &&
   notification.typeMessage === "textMessage"
   ```

4. After processing a matching text notification, call `POST deleteNotification` with its ID:

   ```json
   {
     "id": 1234
   }
   ```

5. After `deleteNotification` completes, call `receiveNotification?receiveTimeout=5` again. There is no offset-based continuation contract in this prototype. An empty response during the timeout isn't an error; it means that no notification arrived during that wait period.

## Manual verification

Once the React implementation and package scripts exist:

1. Run `bun install`, then `bun run dev`.
2. Open the local URL printed by the development server.
3. Enter the GREEN-API instance ID and API token at runtime. Don't put either value in source files.
4. Enter a valid Telegram chat ID and send a short text message.
5. In the browser network panel, confirm that the request uses `POST /sendMessage` and sends `chatId` plus `textMessage` in the JSON body.
6. Confirm that the recipient receives the message, then send a text reply from another Telegram client.
7. Confirm that `GET /receiveNotification?receiveTimeout=5` returns the reply and that the UI processes it only when `typeWebhook` is `incomingMessageReceived` and `typeMessage` is `textMessage`.
8. After the UI processes the text, confirm that `POST /deleteNotification` is called with the same notification ID.
9. Confirm that another `receiveNotification?receiveTimeout=5` request runs after deletion and that the processed notification isn't shown again.
10. Check the browser console and network panel for errors, especially CORS failures.

## Prototype limitations

- Text messages only. Only `incomingMessageReceived` notifications whose `typeMessage` is `textMessage` are processed.
- Media, stickers, contacts, locations, polls, and other notification types aren't processed.
- No backend proxy, server-side secret storage, user authentication, or tenant isolation.
- No durable chat history or database.
- No production-grade retry, delivery-status, or reconnect policy.
- No mobile or production layout guarantees.
- Direct browser access may be blocked by CORS.
- API credentials are exposed to the browser and must be treated as compromised.
