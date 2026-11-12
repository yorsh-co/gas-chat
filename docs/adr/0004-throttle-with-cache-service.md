# 0004. Throttle alerts with CacheService

## Status

Accepted

## Context

A failing trigger can raise the same error every minute, flooding a shared space. Alerts need a duplicate filter that works across executions, which share no memory in Apps Script.

## Decision

- Identical alerts to the same webhook, app and thread are suppressed for `throttleSeconds` (default 300, `0` disables, maximum 21600, the `CacheService` limit) using `CacheService.getScriptCache()`.
- The key is `gas-chat:` plus the web-safe base64 SHA-256 of the JSON array `[webhookUrl, appName, threadKey, fingerprint]`, where the fingerprint is `title|message|first-stack-frame`. JSON encoding keeps fields unambiguous when they contain delimiters. Only the digest is stored, never the URL, and an unresolved URL never reaches the cache. The frame is the first line starting with `at`, falling back to the first non-empty line after the first. It distinguishes failures at different call sites without making the key depend on line-number noise in the message.
- The key is written before sending (check-then-put) and removed when delivery fails, so a failed alert is retried by the next occurrence.
- Removing the key after a failed send can also drop a concurrently throttled identical alert (it saw the key, was suppressed, and the original send then failed). This is accepted alongside the duplicate-on-race case.
- Cache errors fail open: the alert is sent and a `console.warn` is logged.
- No lock is used. `LockService` or gas-lock would add a wait on the error path. Two executions racing past the check may both send; a rare duplicate is accepted.

## Consequences

- Needs the `script.storage` scope, which `CacheService` already implies for the consumer.
- Throttled calls return `{ ok: true, status: null, throttled: true }`.
- Distinct errors with the same title, message and call site are merged within the window, but only for the same webhook, app name and thread. Instances sharing the script cache do not suppress each other's alerts.
