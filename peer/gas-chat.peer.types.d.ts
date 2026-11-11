/**
 * Ambient declarations for gas-chat, consumed as a peer subtree package.
 *
 * gas-chat is expected as a runtime global (Apps Script has no module
 * system); this file declares its public surface so a consuming package can
 * typecheck standalone via `tsc --noEmit` without vendoring the source.
 *
 * Canonical copy: gas-chat/peer/gas-chat.peer.types.d.ts. Do not edit
 * downstream copies — update the canonical file and re-copy, so every peer
 * stays in step with the published surface.
 *
 * Being a `.d.ts`, this file is type-only: it matches a consumer's
 * `include: ["src/**\/*.ts"]` but emits nothing, so no counterpart reaches
 * dist/ or the published package.
 *
 * Usage: list `gas-chat` in `gasdev.peers` and run `gasdev peers sync`,
 * which writes it to `src/internal/`.
 *
 * @see https://github.com/yorsh-co/gas-chat
 * @version 0.0.0
 */

/** Options for {@link GasChat}. */
interface GasChatOptions {
  /** Webhook URL, or a resolver called on first send per instance (result cached). */
  webhookUrl: string | (() => string | null | undefined);
  /** Shown in alert headers. @default 'Apps Script' */
  appName?: string;
  /** Suppress identical alerts to the same webhook, app and thread for this many seconds; 0 disables. @default 300 */
  throttleSeconds?: number;
  /** Default thread for every message; per-message `threadKey` overrides. */
  threadKey?: string;
}

/** A Chat Cards v2 card, passed through to the webhook untouched. */
interface GasChatCardV2 {
  /** Unique card identifier within the message. */
  cardId: string;
  /** Card body as defined by the Chat API. */
  card: Record<string, unknown>;
}

/** A message to post to the space. At least one of `text` or `cardsV2` is required. */
interface GasChatMessage {
  /** Plain text in Chat markdown, up to 4096 characters. */
  text?: string;
  /** Cards v2 to attach. */
  cardsV2?: ReadonlyArray<GasChatCardV2>;
  /** Thread to post into; overrides the instance `threadKey`. */
  threadKey?: string;
}

/** Outcome of a send. Never contains the webhook URL. */
interface GasChatSendResult {
  /** True when Chat accepted the message, or the alert was throttled. */
  ok: boolean;
  /** HTTP status, or `null` when no request was made or it failed to complete. */
  status: number | null;
  /** True when an identical alert was suppressed by the throttle. */
  throttled: boolean;
  /** Short failure description when `ok` is false. */
  error?: string;
}

/** Anything with an `error` method, such as GasLogger or `console`. */
interface GasChatLoggerTarget {
  error(msg: string, meta?: Record<string, unknown>): void;
}

/** Options for {@link GasChat.logger}. */
interface GasChatLoggerOptions {
  /** Logger methods that also raise a Chat alert. @default ['error', 'fatal'] */
  levels?: ReadonlyArray<string>;
}

/**
 * Posts messages to a Google Chat space through an incoming webhook.
 *
 * Delivery failures are returned in the result and logged with `console.warn`;
 * the webhook URL is a credential and never appears in either.
 */
declare class GasChat {
  /**
   * @param options - See {@link GasChatOptions}.
   * @throws {TypeError} When an option is invalid or unknown.
   */
  constructor(options: GasChatOptions);

  /**
   * Posts a message to the space.
   *
   * @param message - Text, or a message with `text` and/or `cardsV2`.
   * @returns The delivery outcome; delivery failures never throw.
   * @throws {TypeError} When the message has no content or `threadKey` is invalid.
   */
  send(message: string | GasChatMessage): GasChatSendResult;

  /**
   * Reports an unexpected error to the space. Never throws.
   *
   * @param err - The caught value; non-Error values are stringified.
   * @param context - Extra key/value pairs shown in the alert; non-object values are ignored.
   * @returns The delivery outcome, or `throttled: true` for a recent duplicate.
   */
  notifyError(
    err: unknown,
    context?: Record<string, unknown>,
  ): GasChatSendResult;

  /**
   * Runs `fn`, alerts on a throw and rethrows the original value unchanged.
   *
   * @param source - Name of the entry point, shown as `source` in the alert.
   * @param fn - The guarded function.
   * @returns The value returned by `fn`.
   */
  run<T>(source: string, fn: () => T): T;

  /**
   * Decorates a logger so selected levels also raise a Chat alert.
   *
   * The inner logger is always called first and keeps its `this`; alerts never
   * throw. `child` loggers are decorated too.
   *
   * @param inner - Any object with an `error` method, such as GasLogger or `console`.
   * @param options - See {@link GasChatLoggerOptions}.
   * @returns A proxy with the same shape as `inner`. Freezing or sealing the
   * proxy and non-configurable `defineProperty` calls are unsupported.
   * @throws {TypeError} When `inner` or `levels` is invalid.
   */
  logger<T extends GasChatLoggerTarget>(
    inner: T,
    options?: GasChatLoggerOptions,
  ): T;
}
