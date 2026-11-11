# Google Chat setup

How to connect a Google Apps Script project to a Google Chat space with gas-chat.

## 1. Prerequisites

- A Google Workspace account.
- A Workspace admin must allow incoming webhooks: Admin console → Apps → Google Workspace → Google Chat → Chat apps (webhook settings).

## 2. Create the webhook

1. Open the Chat space.
2. Click the space name → **Apps & integrations** → **Webhooks** → **Add webhooks**.
3. Enter a name (for example "Orders alerts") and, optionally, an avatar URL.
4. Click **Save** and copy the webhook URL.

## 3. Store the URL

In the Apps Script editor: **Project Settings** → **Script properties** → add `GAS_CHAT_WEBHOOK_URL` with the URL. Never commit it.

```ts
const chat = new GasChat({
  webhookUrl: () =>
    PropertiesService.getScriptProperties().getProperty('GAS_CHAT_WEBHOOK_URL'),
});
```

## 4. Manifest

When `oauthScopes` is explicit in `appsscript.json`, include:

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

## 5. Verify

```ts
function testChatAlert() {
  console.log(chat.send('gas-chat connected'));
  console.log(chat.notifyError(new Error('test')));
}
```

Run it from the editor and authorize on the first run. Both messages should appear in the space.

## 6. Rotate or revoke

Delete the webhook in the space (Apps & integrations → Webhooks), create a new one, and update the script property.

## 7. Troubleshooting

Inspect the `error` and `status` fields of the result.

| Result                          | Cause and fix                                                                                   |
| ------------------------------- | ----------------------------------------------------------------------------------------------- |
| `Webhook URL is not configured` | The resolver returned nothing. Check the script property name and value.                        |
| `Webhook URL is invalid`        | The URL is not a `chat.googleapis.com` space webhook with `key` and `token`. Copy it again.     |
| HTTP 400                        | Chat rejected the payload. Check `cardsV2` structure and `threadKey`.                           |
| HTTP 403 or 404                 | The webhook was deleted or the app was removed from the space. Create a new webhook.            |
| HTTP 429                        | Rate limit (about 1 write per second per space). Raise `throttleSeconds` or reduce send volume. |

## 8. Upgrading to a full Chat app

Incoming webhooks are outbound only. To receive messages or use a service account, see [ADR 0002](./adr/0002-incoming-webhook-transport.md).
