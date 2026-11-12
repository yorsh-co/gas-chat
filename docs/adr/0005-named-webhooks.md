# 0005. Named webhooks in one instance

## Status

Accepted

## Context

Projects often alert one space and post reports to another. With a single `webhookUrl`, that needs one `GasChat` instance per space, each with its own resolver, cache and throttle configuration.

## Decision

`webhookUrl` also accepts a map of named webhooks, each a URL or a resolver. The map requires a `default` entry, so calls without a `webhook` always have a target; the single-URL form is normalised to `{ default: url }`. Each name is resolved lazily and cached independently, and failures are not cached. `send`, `notifyError`, `run` and `logger` select a webhook by name. Redaction covers every resolved URL, so one webhook's token cannot leak through another's error.

Alternatives rejected:

- **A separate `alertWebhookUrl`.** Handles only two targets and only alerts, not `send`.
- **Per-level routes.** Couples routing to log levels and cannot route by destination.
- **Multiple instances only.** Works, but duplicates configuration and spreads the throttle and redaction state.

## Consequences

- The single-URL form behaves as before.
- Webhook names are not secrets and may appear in errors and warnings; URLs, keys and tokens never do.
- An unknown name is a programming error: `send` and `logger` throw a `TypeError`, while `notifyError` and `run` return a failed result and warn, per ADR 0003.
- Throttling is per webhook because the throttle key already includes the URL.
