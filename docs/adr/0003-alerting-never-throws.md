# 0003. Alerting never throws

## Status

Accepted

## Context

gas-chat runs on error paths: inside `catch` blocks, trigger guards and logger decorators. An alert that throws would mask the original error or break the caller's own handling. Reporting a delivery failure through a decorated logger would recurse, because that logger raises the alert in the first place.

## Decision

- Delivery problems (unresolved webhook, non-2xx response, failed fetch, cache errors) are returned in `GasChatSendResult` and never thrown.
- `notifyError`, `run`'s alert and the logger decorator return or swallow every failure.
- `send` and the constructor throw `TypeError` for invalid arguments or options. These are programmer errors visible on the first call, not runtime conditions.
- Diagnostics go to `console.warn` only, never to the decorated logger, to avoid recursion.
- The webhook URL is a credential and is redacted from every result field and warning, including text echoed by Chat or by a failed fetch.

## Consequences

- Callers can ignore the result without risking a secondary failure.
- Failures are visible in Apps Script execution logs, not in the project's own logging pipeline.
- Callers that need certainty must inspect `ok`.
