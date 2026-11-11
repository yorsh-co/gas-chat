# 0001. Separate library, not a gas-logger feature

## Status

Accepted

## Context

Chat alerts need `UrlFetchApp`. Apps Script derives a project's OAuth scopes by scanning source, so any library that references `UrlFetchApp` adds `https://www.googleapis.com/auth/script.external_request` to every project that includes it, whether or not the feature is used. gas-logger deliberately avoids this: `test/scopes.test.ts` and the README "Scopes" section guarantee that it only needs spreadsheet and storage scopes.

Users of gas-error who do not use gas-logger should also be able to send alerts.

## Decision

Ship Chat delivery as its own library, `gas-chat`, with no runtime gas-\* dependency. It integrates with gas-error and gas-logger structurally, through the `{ warn, error }` / `error(msg, meta)` logger shape, so load order does not matter.

Alternatives rejected:

- **A gas-logger sink.** Pulls `UrlFetchApp` into gas-logger and widens the scopes of all its consumers.
- **A gas-logger hook option.** Keeps the scope out of gas-logger, but ties alerting to gas-logger and leaves gas-error-only users without a path.

## Consequences

- Consumers opt in to the external request scope by including gas-chat.
- gas-chat keeps its own scope guard test to document that single scope.
- Integration relies on structural typing, so a breaking change in a logger's method shape is not caught at load time.
