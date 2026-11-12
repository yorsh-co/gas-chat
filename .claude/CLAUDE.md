# gas-chat

## Peer types

`peer/gas-chat.peer.types.d.ts` is the canonical ambient declaration of the public surface, copied into consuming packages.

- Its `@version` header tracks `package.json` `version`. Every version bump (release or hotfix) updates both in the same commit.
- Any change to the public surface in `src/` (`GasChatOptions`, `GasChatCardV2`, `GasChatMessage`, `GasChatSendResult`, `GasChatLoggerTarget`, `GasChatLoggerOptions`, or `GasChat`'s public methods) is mirrored in the peer file, JSDoc included. Internal types such as `GasChatAlert` stay out.
