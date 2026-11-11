# Changelog

---

## [Unreleased]

### Added

- `GasChat` class to post messages to a Google Chat space through an incoming webhook: `send` (text and `cardsV2`, optional `threadKey`) and `notifyError`.
- `run` to guard an entry point, alert on a throw and rethrow the original error.
- `logger` to decorate GasLogger, GasError or `console` so selected levels also raise a Chat alert.
- Duplicate alert throttling through `CacheService`, configurable with `throttleSeconds`.
- Peer type declarations (`peer/gas-chat.peer.types.d.ts`).
- Usage and Google Chat webhook setup documentation.

### Fixed

- Throttle key now includes the webhook, app name and thread, so instances sharing the script cache no longer suppress each other's alerts.
- `logger()` works with frozen or non-configurable loggers.
- `logger()` snapshots `levels` at creation, including for child loggers.
- Decorated logger methods keep a stable identity.
- `logger` now reports an `Error` passed as the first argument with its name, message and stack instead of `String(err)`.

---
