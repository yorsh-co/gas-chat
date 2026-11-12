# 0002. Incoming webhook transport

## Status

Accepted

## Context

Google Chat can receive messages through an incoming webhook, through a Chat API app authenticated as a service account (`chat.bot` scope), or through a pluggable transport that supports both.

## Decision

Use Chat incoming webhooks only (`https://chat.googleapis.com/v1/spaces/<id>/messages?key=…&token=…`), called with `UrlFetchApp`. The URL carries its own credential, so no GCP project and no service-account key are needed per consumer.

Alternatives rejected:

- **Chat API app.** Needs a GCP project, a service account and key management per consumer, which is too heavy for alerting.
- **Pluggable transport.** Speculative; no second transport is planned for v1.

## Consequences

- Google Workspace only, and an admin must allow incoming webhooks.
- One space per webhook URL.
- Messages can be created only: no edits, deletes or reads.
- The webhook URL is a credential and must be stored outside source control.
- A full Chat app can be added later as another transport without changing the public surface.
