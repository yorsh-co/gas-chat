/** A webhook URL, or a resolver called on first use (result cached). */
type GasChatWebhookSource = string | (() => string | null | undefined);

/** Options for {@link GasChat}. */
interface GasChatOptions {
  /**
   * Webhook URL, a resolver called on first send per instance (result cached),
   * or a map of named webhooks. The map requires a `default` entry.
   */
  webhookUrl:
    GasChatWebhookSource | Readonly<Record<string, GasChatWebhookSource>>;
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
  /** Named webhook to post to. @default 'default' */
  webhook?: string;
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

/** Internal, normalized error alert rendered by the formatter. */
interface GasChatAlert {
  title: string;
  message: string;
  stack?: string;
  context: Record<string, unknown>;
}
