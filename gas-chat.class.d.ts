/** Option keys accepted by the {@link GasChat} constructor. */
declare const GAS_CHAT_OPTION_KEYS: ReadonlyArray<string>;
/** True for a resolver function or a string that is a Chat webhook URL. */
declare function _gasChatIsWebhookSource(
  value: unknown,
): value is GasChatWebhookSource;
/**
 * Posts messages to a Google Chat space through an incoming webhook.
 *
 * Delivery failures are returned in the result and logged with `console.warn`;
 * the webhook URL is a credential and never appears in either.
 */
declare class GasChat {
  private readonly _webhooks;
  private readonly _namedForm;
  private readonly _appName;
  private readonly _throttleSeconds;
  private readonly _threadKey;
  private readonly _resolvedUrls;
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
   * @throws {TypeError} When the message has no content, or `threadKey` or `webhook` is invalid or unknown.
   */
  send(message: string | GasChatMessage): GasChatSendResult;
  /**
   * Reports an unexpected error to the space. Never throws.
   *
   * @param err - The caught value; non-Error values are stringified.
   * @param context - Extra key/value pairs shown in the alert; non-object values, arrays and boxed primitives are ignored.
   * @param options - See {@link GasChatAlertOptions}; an unknown webhook name returns a failed result.
   * @returns The delivery outcome, or `throttled: true` for a recent duplicate.
   */
  notifyError(
    err: unknown,
    context?: Record<string, unknown>,
    options?: GasChatAlertOptions,
  ): GasChatSendResult;
  /**
   * Runs `fn`, alerts on a throw and rethrows the original value unchanged.
   *
   * @param source - Name of the entry point, shown as `source` in the alert.
   * @param fn - The guarded function.
   * @param options - See {@link GasChatAlertOptions}.
   * @returns The value returned by `fn`.
   */
  run<T>(source: string, fn: () => T, options?: GasChatAlertOptions): T;
  /**
   * Decorates a logger so selected levels also raise a Chat alert.
   *
   * The inner logger is always called first and keeps its `this`; alerts never
   * throw. `child` loggers are decorated too.
   *
   * @param inner - Any object with an `error` method, such as GasLogger or `console`.
   * @param options - See {@link GasChatLoggerOptions}.
   * @returns A proxy with the same shape as `inner`. Freezing or sealing the
   * proxy, non-configurable `defineProperty` calls and `new` on a callable proxy
   * are unsupported.
   * @throws {TypeError} When `inner`, `levels` or `webhook` is invalid.
   */
  logger<T extends GasChatLoggerTarget>(
    inner: T,
    options?: GasChatLoggerOptions,
  ): T;
  /** Builds an alert from a logger call's message and metadata. */
  private _alertFromLog;
  /** Sends an alert to a named webhook, suppressing duplicates. Never throws. */
  private _alert;
  /** Converts an unexpected internal failure into a result and a warning. */
  private _alertFailure;
  /** Text of a thrown value; never throws. */
  private _errorText;
  /** Error text with any webhook URL masked, for diagnostics. */
  private _redactAny;
  /** Masks every resolved webhook URL, then any Chat URL, in `text`. */
  private _redactAll;
  /**
   * Validates a webhook name and returns it, defaulting to `default`.
   * @throws {TypeError} When the name is not a string or is not configured.
   */
  private _checkWebhook;
  /**
   * Returns the named webhook's URL, or a failure result when it cannot be
   * resolved. A resolved URL is cached per name; failures are not, so the
   * next call retries. Resolver errors mask every resolved webhook URL and
   * any full Chat URL.
   */
  private _resolveUrl;
  /** Masks the webhook URL, its key and token, and any Chat URL in `text`. */
  private _redact;
  /** Masks any Google Chat URL in `text`. */
  private _maskChatUrls;
}
