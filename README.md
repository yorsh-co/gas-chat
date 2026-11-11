# gas-chat

Google Chat alerts and messages for Google Apps Script through an incoming webhook.

## Features

- Send text or cards (`cardsV2`) to a Google Chat space, optionally in a thread.
- `notifyError` formats an unexpected error as a Chat alert. It never throws.
- `run` guards a trigger or editor function: it alerts, then rethrows.
- `logger` decorates a [gas-error](https://github.com/yorsh-co/gas-error) or [gas-logger](https://github.com/yorsh-co/gas-logger) logger (or `console`) so error-level entries also reach Chat.
- Identical alerts are throttled through `CacheService` (300 s by default).
- Untrusted error text is rendered inert, and the webhook URL is never logged or returned.
- No runtime dependency on other gas-\* libraries and no peers.

## Example Usage

```ts
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

- A Google Workspace account whose admin allows Chat incoming webhooks. See [Google Chat setup](./docs/google-chat-setup.md).
- OAuth scope `https://www.googleapis.com/auth/script.external_request`, plus `https://www.googleapis.com/auth/script.storage` when you read Script Properties. Apps Script derives scopes from source; with explicit `oauthScopes` in the manifest, list them yourself.
- When `urlFetchWhitelist` is set in the manifest, it must include `https://chat.googleapis.com/`.
- No peers: gas-error and gas-logger integrate structurally, so load order is free.

## Quick Start

Add the library to your gasdev bundle:

```json
{
  "gasdev": {
    "bundle": {
      "libraries": {
        "gas-chat": "^1.0.0"
      }
    }
  }
}
```

Or copy it with a git subtree from the `dist` branch of `yorsh-co/gas-chat`. Load it first, and declare the instance at the top level of your script so every function shares it:

```ts
const chat = new GasChat({ webhookUrl: () => /* resolver */ });
```

The webhook URL can be a string or a resolver. A resolver runs on first send per instance and the result is cached. Reading it from Script Properties (`GAS_CHAT_WEBHOOK_URL`) keeps the credential out of source.

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

Alerts with the same title, message and first stack line are sent once per `throttleSeconds` (default 300, `0` disables, maximum 21600). The key is released when delivery fails, and cache errors fail open.

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
