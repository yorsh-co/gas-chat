# gas-chat

[![Built with Google Apps Script](https://img.shields.io/badge/Built%20with-Google%20Apps%20Script-4285F4?logo=google&logoColor=white)](https://developers.google.com/apps-script)

## Google Chat alerts and messages for Google Apps Script through an incoming webhook.

> The goal of this project is to make posting to Google Chat from Apps Script safe by default: alerts that never throw, duplicates that are throttled, and a webhook URL that never leaks into logs or results.

`GasChat` sends text and cards (`cardsV2`) to a Google Chat space through an [incoming webhook](https://developers.google.com/workspace/chat/quickstart/webhooks), optionally inside a thread. Incoming webhooks are outbound only and need no OAuth client or service account, only a URL created in the space.

`gas-chat` pairs with [gas-error](https://github.com/yorsh-co/gas-error) and [gas-logger](https://github.com/yorsh-co/gas-logger): `chat.logger(...)` decorates their loggers so error-level entries also reach Chat, with no dependency on either library.

> **Disclaimer:**
> This project and [Yorsh](https://github.com/yorsh-co) are independent and are not affiliated with, endorsed by, or associated with Google LLC.

### Features

- Send text or cards (`cardsV2`) to a Google Chat space
- Threads through `threadKey`, using `REPLY_MESSAGE_FALLBACK_TO_NEW_THREAD` so a missing thread starts a new one
- `notifyError` formats an unexpected error as a Chat alert and never throws
- `run` guards a trigger or editor function: it alerts, then rethrows
- `logger` decorates a gas-error, gas-logger or `console` logger so error-level entries also reach Chat; child loggers are decorated too
- Identical alerts are throttled through `CacheService`
- Untrusted error text is rendered inert, and the webhook URL is redacted from results and logs
- Strict option validation: unknown options throw `TypeError`
- Written in TypeScript; ships compiled `.js` plus `.d.ts`
- No runtime dependencies and no peers

> [!TIP]
> Use `gas-chat` together with [gas-error](https://github.com/yorsh-co/gas-error) and [gas-logger](https://github.com/yorsh-co/gas-logger): gas-error classifies failures, gas-logger records them, and `gas-chat` pushes the ones that matter to your team.

### Example Usage

```js
const chat = new GasChat({
  appName: 'Orders',
  webhookUrl: () =>
    PropertiesService.getScriptProperties().getProperty('GAS_CHAT_WEBHOOK_URL'),
});
const log = chat.logger(
  new GasLogger({
    sheetConfig: { spreadsheet: () => SpreadsheetApp.getActive() },
  }),
);

function doPost(e) {
  try {
    // ...
  } catch (err) {
    return GasError.handle(err, {
      logger: log,
      method: 'POST',
      path: '/orders',
      rethrow: false,
    });
  }
}

function dailySync() {
  chat.run('dailySync', () => {
    // ...
  });
}
```

## Requirements

### Google Workspace

Your Google Workspace admin must allow Chat incoming webhooks. See [Google Chat setup](./docs/google-chat-setup.md).

### Scopes

`gas-chat` needs the `https://www.googleapis.com/auth/script.external_request` scope to call the webhook, plus `https://www.googleapis.com/auth/script.storage` when you read Script Properties. Apps Script derives scopes from the services your source uses. With explicit `oauthScopes` in the manifest, list them yourself.

### Example `appsscript.json`

```json
{
  "oauthScopes": [
    "https://www.googleapis.com/auth/script.external_request",
    "https://www.googleapis.com/auth/script.storage"
  ],
  "urlFetchWhitelist": ["https://chat.googleapis.com/"]
}
```

`script.storage` is only needed to read Script Properties. `urlFetchWhitelist` is optional, but when present it must include the Chat host.

### Peer Dependencies

None. gas-error and gas-logger integrate structurally, so load order is free.

## Quick Start

> [!TIP]
> Use `gas-chat` together with [Google's `clasp` CLI](https://github.com/google/clasp) for local Apps Script development and git-based workflows. See [Setup instructions with `clasp`](#setup-instructions-with-clasp) for more information.

<a id="add-the-library"></a>

#### 1. Add the library to your Apps Script project

##### Several gas-\* libraries: gasdev bundle

[gasdev](https://github.com/yorsh-co/gasdev) resolves version ranges against the libraries' `dist/vX.Y.Z` release tags and writes them into one script, in dependency order.

```bash
npm install -D github:yorsh-co/gasdev#semver:^3.0.0-beta.3
```

List the libraries in your `package.json`:

```json
{
  "gasdev": {
    "bundle": {
      "outFile": "src/lib/gas-libraries.js",
      "libraries": {
        "gas-chat": "^1.0.0",
        "gas-error": "^1.2.0",
        "gas-logger": "^2.0.0"
      }
    }
  }
}
```

```bash
npx gasdev bundle
```

- Commit the generated file. Its header records each library's version and commit SHA.
- Re-run the command after changing a range to upgrade.

See the [gasdev README](https://github.com/yorsh-co/gasdev) for configuration details.

##### This library only: git subtree

This repository is intended to be added directly into Apps Script projects using git subtree.

```bash
git subtree add \
  --prefix=src/lib/gas-chat \
  https://github.com/yorsh-co/gas-chat.git \
  dist \
  --squash
```

This creates:

```txt
src/lib/gas-chat/
```

#### 2. If needed, move `gas-chat` files to the start of the execution order.

This is required for constructing a `GasChat` instance at runtime, as a global variable or inside an IIFE.

See the [Configure the file push order](#file-push-order) section for details.

With gasdev bundle, the single entry is the bundle file, e.g. `src/lib/gas-libraries.js` (adjusted for `rootDir`).

#### 3. Declare a `GasChat` instance

Declare the instance at the top level of your script so every function shares it:

```js
const chat = new GasChat({
  webhookUrl: () =>
    PropertiesService.getScriptProperties().getProperty('GAS_CHAT_WEBHOOK_URL'),
});
```

The webhook URL can be a string or a resolver. A resolver runs on first send per instance and the result is cached. Reading it from Script Properties (`GAS_CHAT_WEBHOOK_URL`) keeps the credential out of source.

## Setup instructions with `clasp`

`gas-chat` works best with [Google's `clasp` CLI](https://github.com/google/clasp) for local Apps Script development and git-based workflows.

#### 1. Install clasp

```bash
npm install -g @google/clasp
```

#### 2. Enable the [Apps Script API](https://script.google.com/home/usersettings)

#### 3. Login to Google Apps Script

```bash
clasp login
```

#### 4. Clone or create your Apps Script project

Clone an existing project:

```bash
clasp clone <script-id>
```

or create a new one:

```bash
clasp create --type standalone
```

#### 5. Import `gas-chat`

To install several gas-\* libraries together, use the [gasdev bundle method](#add-the-library) from the Quick Start; otherwise, add this library with git subtree:

```bash
git subtree add \
  --prefix=src/lib/gas-chat \
  https://github.com/yorsh-co/gas-chat.git \
  dist \
  --squash
```

This creates:

```txt
src/lib/gas-chat/
```

<a id="file-push-order"></a>

#### 6. Configure the file push order

> [!IMPORTANT]
> Apps Script executes files by the order in the Apps Script editor, from top to bottom. By default, `clasp push` orders the files alphabetically, by file name. If a `GasChat` instance is declared at runtime (as a global variable or in an IIFE) in a file referencing `GasChat` that is ordered before `gas-chat`'s own files, `clasp push` will succeed but running the project will throw:
>
> ```txt
> ReferenceError: GasChat is not defined
> ```
>
> To avoid this, add a [`filePushOrder`](https://github.com/google/clasp#filepushorder-optional) entry to your project's `.clasp.json` that pushes `gas-chat`'s module files ahead of any file that references them:
>
> ```json
> {
>   "filePushOrder": [
>     "src/lib/gas-chat/gas-chat.constants.js",
>     "src/lib/gas-chat/gas-chat.format.js",
>     "src/lib/gas-chat/gas-chat.class.js"
>   ]
> }
> ```
>
> Use the path where the files land in your pushed project, e.g. `src/lib/gas-chat/...` when pushing the subtree as-is.
>
> Alternatively, you can manually move these files to the top of the file list in the Apps Script editor.
>
> With gasdev bundle, the single entry is the bundle file, e.g. `src/lib/gas-libraries.js` (adjusted for `rootDir`).

#### 7. Push local files to Apps Script

```bash
clasp push
```

#### 8. Declare a `GasChat` instance and use it

```js
const chat = new GasChat({
  webhookUrl: () =>
    PropertiesService.getScriptProperties().getProperty('GAS_CHAT_WEBHOOK_URL'),
});

chat.send('Deploy finished');
```

## Basic Usage

### Send

```ts
chat.send('Deploy finished');
chat.send({ text: 'Order 1042 shipped', threadKey: 'order-1042' });
chat.send({
  cardsV2: [
    {
      cardId: 'summary',
      card: { header: { title: 'Nightly sync' } },
    },
  ],
});
```

`send` throws `TypeError` only for invalid arguments. Delivery problems are reported in the result.

### Result

Every send returns `{ ok, status, throttled, error? }`. `status` is the HTTP status, or `null` when no request completed. `throttled` is `true` when a duplicate alert was suppressed. `error` never contains the webhook URL.

### Notify an error

```ts
try {
  // ...
} catch (err) {
  chat.notifyError(err, { orderId: 1042 });
}
```

### Guard a function

```ts
function dailySync() {
  chat.run('dailySync', () => {
    // ...
  });
}
```

`run` sends an alert when `fn` throws and then rethrows the original error. It takes a `function` declaration as the entry point because Apps Script only exposes declarations to triggers and the editor.

### Decorate a logger

```ts
const withGasError = chat.logger(myGasErrorLogger);
const withGasLogger = chat.logger(new GasLogger({/* ... */}));
const withConsole = chat.logger(console, { levels: ['error'] });
```

`levels` defaults to `['error', 'fatal']`. The decorated logger behaves as the original and additionally alerts Chat. Alerting failures are swallowed and reported with `console.warn` only.

### Throttling

Alerts with the same webhook, app name, thread, title, message and first stack line are sent once per `throttleSeconds` (default 300, `0` disables, maximum 21600). The key is released when delivery fails, and cache errors fail open.

## Limits

- Text is cut to Chat's 4096-character limit.
- Chat accepts about one write per second per space; raise `throttleSeconds` when a space returns HTTP 429.
- Throttling uses check-then-put without a lock, so concurrent executions can send a duplicate.
- The webhook URL is a credential. Anyone holding it can post to the space. Never commit or log it.

## Development

```sh
npm run check      # format, lint, types, tests, gasdev check
npm run test:gas   # Apps Script tests; one-off clasp login and test script ID setup, see gasdev "Apps Script tests"
```

Release:

1. `git config gitflow.prefix.versiontag v`
2. `git flow release start 1.0.0`, then bump `version` in `package.json` and `@version` in the peer types together.
3. `npm run check` and `npm run test:gas`
4. `git flow release finish`
5. `git push origin v1.0.0`
6. `npm run build:release`

See also [Google Chat setup](./docs/google-chat-setup.md) and the decisions in [docs/adr](./docs/adr/0001-separate-library.md): [separate library](./docs/adr/0001-separate-library.md), [incoming webhook transport](./docs/adr/0002-incoming-webhook-transport.md), [alerting never throws](./docs/adr/0003-alerting-never-throws.md), [throttle with CacheService](./docs/adr/0004-throttle-with-cache-service.md).

## License

[MIT](./LICENSE.md)

## Support

Open an issue at <https://github.com/yorsh-co/gas-chat/issues>.
