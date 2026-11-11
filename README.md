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

### Create a `GasChat` instance

```js
const chat = new GasChat({
  webhookUrl: () =>
    PropertiesService.getScriptProperties().getProperty('GAS_CHAT_WEBHOOK_URL'),
  appName: 'Order sync',
  throttleSeconds: 600,
  threadKey: 'order-sync',
});
```

| Option            | Type                                            | Default         | Description                                                                                                                   |
| ----------------- | ----------------------------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `webhookUrl`      | `string` or `() => string \| null \| undefined` | required        | Webhook URL, or a resolver called on first send per instance (result cached).                                                 |
| `appName`         | `string`                                        | `'Apps Script'` | Shown in alert headers.                                                                                                       |
| `throttleSeconds` | `number`                                        | `300`           | Suppresses identical alerts to the same webhook, app and thread for this many seconds; `0` disables. Integer from 0 to 21600. |
| `threadKey`       | `string`                                        | none            | Default thread for every message; a per-message `threadKey` overrides it.                                                     |

Unknown options throw a `TypeError`.

### Send a text message

```js
chat.send('Deploy finished');
chat.send({ text: 'Order 1042 shipped' });
```

`text` uses Chat markdown and is cut to 4096 characters. `send` throws `TypeError` only for invalid arguments. Delivery problems are reported in the [result](#read-the-result).

### Send cards

```js
chat.send({
  cardsV2: [
    {
      cardId: 'summary',
      card: { header: { title: 'Nightly sync' } },
    },
  ],
});
```

`cardsV2` is passed through to the webhook untouched. A message needs at least one of `text` or `cardsV2`; `text` and `cardsV2` can be combined.

### Post into a thread

```js
const chat = new GasChat({ webhookUrl, threadKey: 'nightly-sync' });

chat.send('Started'); // thread "nightly-sync"
chat.send({ text: 'Order 1042 shipped', threadKey: 'order-1042' }); // overrides
```

Messages are sent with `messageReplyOption=REPLY_MESSAGE_FALLBACK_TO_NEW_THREAD`: a message replies to the thread if it exists and starts a new thread otherwise. The webhook URL must not already contain `threadKey` or `messageReplyOption`.

### Read the result

```js
const result = chat.send('Deploy finished');
if (!result.ok) {
  console.warn(result.status, result.error);
}
```

Every send returns `{ ok, status, throttled, error? }`.

- `ok`: `true` when Chat accepted the message, or the alert was throttled.
- `status`: the HTTP status, or `null` when no request was made or it did not complete.
- `throttled`: `true` when a duplicate alert was suppressed.
- `error`: a short failure description when `ok` is `false`. It never contains the webhook URL.

### Notify an error

```js
try {
  // ...
} catch (err) {
  chat.notifyError(err, { orderId: 1042 });
}
```

The alert is titled `Unexpected error` and contains the message, the stack and the `context` pairs. Non-`Error` values are stringified. A `context` that is not a plain object (a non-object, an array or a boxed primitive) is ignored. For an `Error` subclass, `name` is added to the context. `notifyError` never throws; it returns the [result](#read-the-result).

### Guard an entry point

```js
function dailySync() {
  chat.run('dailySync', () => {
    // ...
  });
}
```

`run` sends an alert when `fn` throws, with `source` in the context, and then rethrows the original error. Use a `function` declaration as the entry point because Apps Script only exposes declarations to triggers and the editor.

### Decorate a logger

```js
const log = chat.logger(console, { levels: ['warn', 'error'] });

log.error('Sync failed', { orderId: 1042 }); // console.error, then a Chat alert
```

`levels` defaults to `['error', 'fatal']`. The inner logger is called first, and alert failures are reported with `console.warn` only. See [Using with gas-logger and gas-error](#using-with-gas-logger-and-gas-error) for details.

## Using with gas-logger and gas-error

`chat.logger(...)` accepts any object with an `error` method, so it decorates [gas-logger](https://github.com/yorsh-co/gas-logger) and the logger passed to [gas-error](https://github.com/yorsh-co/gas-error) without depending on either.

### Decorate a GasLogger

```js
const chat = new GasChat({
  webhookUrl: () =>
    PropertiesService.getScriptProperties().getProperty('GAS_CHAT_WEBHOOK_URL'),
  appName: 'Order sync',
});

const log = chat.logger(
  new GasLogger({
    spreadsheet: () => SpreadsheetApp.getActiveSpreadsheet(),
    sheetName: 'Logs',
  }),
);

function syncOrders() {
  log.info('Sync started'); // logged, not alerted
  log.error('Sync failed', { orderId: 1042, attempt: 3 }); // logged, then alerted
}
```

The `error` call is written to the console and the sheet, then posted to Chat:

```txt
🚨 *Order sync* · Sync failed
`Sync failed`
• `orderId`: `1042`
• `attempt`: `3`
• time: `2025-01-15T09:30:00.000Z`
```

### How a log call becomes an alert

| Alert part | Source                                                                                                                                             |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Title      | `msg`, or `msg.name` when `msg` is an `Error`.                                                                                                     |
| Message    | `meta.message` if it is a string; otherwise the `.message` of the first `Error` among `meta.error`, `meta.err` and `msg`; otherwise `String(msg)`. |
| Stack      | `meta.stack` if it is a string; otherwise the stack of that `Error`.                                                                               |
| Context    | Every other `meta` key. `message`, `stack`, `error` and `err` are excluded.                                                                        |

```js
log.error(err);
// title: err.name, message: err.message, stack: err.stack

log.error('Import failed', { error: err, fileId });
// title: "Import failed", message: err.message, stack: err.stack, context: { fileId }

log.fatal('Quota exhausted', { service: 'UrlFetch' });
// title: "Quota exhausted", message: "Quota exhausted", context: { service }
```

### Choose the levels

```js
const log = chat.logger(gasLogger, { levels: ['warn', 'error', 'fatal'] });
```

`levels` defaults to `['error', 'fatal']`. The decorator alerts on any listed method call, independently of gas-logger's `level` and `sheetLevel`: an `error` call is still alerted even when `level: 'fatal'` drops it from the log. `levels` is copied when `logger()` is called, so later changes to the array have no effect.

### Child loggers

```js
const reqLog = log.child({ reqId });

reqLog.error('Lookup failed', { orderId: 1042, reqId });
```

`child` returns a decorated child that inherits `levels`. gas-logger merges bindings internally, and the decorator only sees the arguments of each call. Bindings therefore reach the log but not the Chat alert, so pass the fields the alert needs in `meta`, as `reqId` is above.

### Buffered sheet writes

```js
const log = chat.logger(
  new GasLogger({
    spreadsheet: () => SpreadsheetApp.getActiveSpreadsheet(),
    sheetName: 'Logs',
    flushThreshold: 25,
    bypassBufferLevels: ['error', 'fatal'],
  }),
);

function syncOrders() {
  chat.run('syncOrders', () => {
    try {
      log.info('Sync started');
      // ...
    } finally {
      log.flush();
    }
  });
}
```

`flush()` and every other method that is not a listed level pass through to the inner logger unchanged.

### With gas-error

```js
function doPost(e) {
  try {
    // ...
  } catch (err) {
    return ContentService.createTextOutput(
      JSON.stringify(
        GasError.handle(err, {
          logger: log,
          method: 'POST',
          path: 'doPost',
          rethrow: false,
        }),
      ),
    );
  }
}
```

A `GasError` with `statusCode < 500` is logged at `warn`, so it is not alerted by default. A 5xx `GasError` and any unexpected error are logged as `'Unexpected error'` at `error`, so they are alerted. The alert shows `message` and `stack` from the payload, and `method`, `path`, `statusCode`, `code` and `sessionId` as context.

> [!IMPORTANT]
> By default `sessionId` is the active user's email, so it appears in the Chat space. To avoid that, pass a `sessionId` resolver to `GasError.handle`.

### Avoiding duplicate alerts

`run` calls `notifyError` with the title `Unexpected error`. Inside a guarded function, logging an error and rethrowing it raises two alerts with different fingerprints:

```js
chat.run('syncOrders', () => {
  try {
    // ...
  } catch (err) {
    log.error('Sync failed', { error: err }); // alert 1
    throw err; // alert 2, from run
  }
});
```

Choose one path. Either log and rethrow and let `run` alert, using a logger that is not decorated or a level that is not alerted:

```js
catch (err) {
  log.warn('Sync failed', { error: err }); // logged only
  throw err; // alerted by run
}
```

Or log with the decorated logger without rethrowing:

```js
catch (err) {
  log.error('Sync failed', { error: err }); // logged and alerted
}
```

### Load order

`gas-chat`, `gas-logger` and `gas-error` have no peers, so they can be bundled or pushed in any order. Construct the decorated logger at top level only after every library file has loaded; see the [file push order](#file-push-order).

## Project Details

### Alert Format

````txt
🚨 *Order sync* · Sync failed
`Request timed out`
• `orderId`: `1042`
• `attempt`: `3`
• time: `2025-01-15T09:30:00.000Z`
```
Error: Request timed out
    at fetchOrder (Orders.gs:42:11)
```
````

- The header is `🚨 *App* · title`. The app name and the title are cut to 200 characters.
- The message is a code span on its own line.
- Each context entry is a `• key: value` line. At most 20 entries are shown and each value is cut to 500 characters. The rest is summarised as `…and N more`.
- The time line is followed by the stack in a fenced block, when there is one.
- The whole text stays within 4096 characters. Text that is cut ends with `…[truncated]`.

### Throttling

Alerts with the same webhook, app name, thread, title, message and first stack frame are sent once per `throttleSeconds` (default 300, `0` disables, maximum 21600). The key is released when delivery fails, and cache errors fail open.

### Security

- Untrusted text (messages, context and stacks) is rendered inert: it appears only inside code spans or a fenced block, backticks are replaced, and Chat markup in labels is replaced by lookalike characters.
- The webhook URL is masked in results and in `console.warn` output.
- The webhook URL is a credential. Anyone holding it can post to the space. Never commit or log it, and keep it in Script Properties.

### Errors

Messages are prefixed `[GasChat]`.

| Thrown by   | `TypeError` message                                             |
| ----------- | --------------------------------------------------------------- |
| constructor | `[GasChat] options must be an object`                           |
| constructor | `[GasChat] unknown option "<name>"`                             |
| constructor | `[GasChat] webhookUrl must be a Chat webhook URL or a function` |
| constructor | `[GasChat] appName must be a non-empty string`                  |
| constructor | `[GasChat] throttleSeconds must be an integer from 0 to 21600`  |
| constructor | `[GasChat] threadKey must be a non-empty string`                |
| `send`      | `[GasChat] message must be a string or an object`               |
| `send`      | `[GasChat] cardsV2 must be an array`                            |
| `send`      | `[GasChat] text must be a string`                               |
| `send`      | `[GasChat] message needs a non-empty text or cardsV2`           |
| `send`      | `[GasChat] threadKey must be a non-empty string`                |
| `logger`    | `[GasChat] logger target needs an error() method`               |
| `logger`    | `[GasChat] levels must be a non-empty string array`             |

Delivery failures are returned in the result and logged with `console.warn`. `notifyError` never throws.

### Limitations

- Text is cut to Chat's 4096-character limit.
- Chat accepts about one write per second per space; raise `throttleSeconds` when a space returns HTTP 429.
- Throttling uses check-then-put without a lock, so concurrent executions can send a duplicate.
- The webhook URL is a credential. Anyone holding it can post to the space. Never commit or log it.

### Entry Point

#### GasChat

Main entry point for the library. Construct one instance at the top level of your script.

##### Methods

```js
new GasChat(options); // { webhookUrl, appName?, throttleSeconds?, threadKey? }
chat.send(message); // string | { text?, cardsV2?, threadKey? } → { ok, status, throttled, error? }
chat.notifyError(err, context); // context is optional → { ok, status, throttled, error? }
chat.run(source, fn); // → the value returned by fn
chat.logger(inner, options); // options is optional; { levels } defaults to ['error', 'fatal'] → decorated inner
```

### Example Workflow

```js
const chat = new GasChat({
  webhookUrl: () =>
    PropertiesService.getScriptProperties().getProperty('GAS_CHAT_WEBHOOK_URL'),
  appName: 'Order sync',
  throttleSeconds: 600,
});

const log = chat.logger(
  new GasLogger({
    spreadsheet: () => SpreadsheetApp.getActiveSpreadsheet(),
    sheetName: 'Logs',
    flushThreshold: 25,
    bypassBufferLevels: ['error', 'fatal'],
  }),
);

function doPost(e) {
  try {
    const order = JSON.parse(e.postData.contents);
    // ...
    return ContentService.createTextOutput(JSON.stringify({ ok: true }));
  } catch (err) {
    return ContentService.createTextOutput(
      JSON.stringify(
        GasError.handle(err, {
          logger: log,
          method: 'POST',
          path: 'doPost',
          rethrow: false,
        }),
      ),
    );
  } finally {
    log.flush();
  }
}

function nightlySync() {
  chat.run('nightlySync', () => {
    try {
      log.info('Sync started');
      // ...
      chat.send({ text: 'Nightly sync finished', threadKey: 'nightly-sync' });
    } finally {
      log.flush();
    }
  });
}
```

### Peer Type Declarations

Consuming gas-\* libraries can type-check against `GasChat` without vendoring its source. The canonical declarations live in `peer/gas-chat.peer.types.d.ts` at every `vX.Y.Z` tag. A consuming package lists `gas-chat` under `gasdev.peers` in its `package.json` and runs `gasdev peers sync`. It writes `src/internal/gas-chat.peer.types.d.ts` from the highest tag that satisfies the range, and `gasdev peers sync --check` reports a stale copy. Do not edit the copy.

## Development

The source code is written in TypeScript.

Release builds are compiled to JavaScript before publishing so the distributed library remains compatible with Google Apps Script.

```sh
npm run check # format, lint, types, tests, gasdev check
```

### Apps Script tests

The Vitest suite runs against fakes of `UrlFetchApp` and `CacheService`. `gas-test/gas-chat.ts` checks the behaviour they stand in for in a real Apps Script execution:

- an invalid webhook URL throws at construction;
- a failed delivery returns a 4xx status, keeps the webhook URL out of the result and releases the throttle key;
- a live send, which runs only when the `GAS_CHAT_TEST_WEBHOOK_URL` script property is set.

They are built and run with [gasdev](https://github.com/yorsh-co/gasdev#apps-script-tests)'s `gas-test`; see its README for the one-off setup.

- `npm run test:gas:build` writes a single script; paste it into the Apps Script editor and run `runGasTests`.
- `npm run test:gas` pushes it to a dedicated test project with clasp and prints the results. It needs a dedicated Apps Script project linked to a standard Google Cloud project, `npx clasp login --extra-scopes <the gasTest scopes>` and `GAS_TEST_SCRIPT_ID`; the project's contents are replaced.

### Release

1. `git config gitflow.prefix.versiontag v`
2. `git flow release start 1.0.0`, then bump `version` in `package.json` and `@version` in the peer types together.
3. `npm run check` and `npm run test:gas`
4. `git flow release finish`
5. `git push origin v1.0.0`
6. `npm run build:release`

### Architecture decisions

- [Separate library](./docs/adr/0001-separate-library.md)
- [Incoming webhook transport](./docs/adr/0002-incoming-webhook-transport.md)
- [Alerting never throws](./docs/adr/0003-alerting-never-throws.md)
- [Throttle with CacheService](./docs/adr/0004-throttle-with-cache-service.md)
- [Google Chat setup](./docs/google-chat-setup.md)

## License

MIT

See the [`LICENSE.md`](./LICENSE.md) file for details.

## Support

Issues and feature requests are welcome via [GitHub Issues](https://github.com/yorsh-co/gas-chat/issues).

Maintained by [yorsh-co](https://github.com/yorsh-co).

---

> [!TIP]
> Found `gas-chat` useful?
> Find more Google Apps Script libraries at [github.com/yorsh-co](https://github.com/yorsh-co).
