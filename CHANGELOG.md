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

- A long alert title no longer evicts the alert body: the app name and title are each capped at 200 characters.

---
