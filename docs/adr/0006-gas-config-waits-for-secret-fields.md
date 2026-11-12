# 0006. gas-config integration waits for secret fields

## Status

Accepted

## Context

gas-config 2.0 is documented as not for secrets: its settings UI shows every value to anyone who can open it, read-only viewers included. A Chat webhook URL is a credential, since anyone holding it can post to the space.

## Decision

No gas-config integration until gas-config 2.1 ships write-only secret fields. The planned shape is a static `GasChat.configField()` returning a `url` field whose pattern is `GAS_CHAT_WEBHOOK_PATTERN`, wired through the existing resolver, with no runtime dependency.

## Consequences

- Users keep the webhook URL in Script Properties for now.
- The README warns against storing it as a regular gas-config setting.
- gas-chat has no gas-config code, peer or dependency.
