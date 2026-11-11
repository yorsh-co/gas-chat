/** Option keys accepted by the {@link GasChat} constructor. */
const GAS_CHAT_OPTION_KEYS: ReadonlyArray<string> = [
  'webhookUrl',
  'appName',
  'throttleSeconds',
  'threadKey',
];

/**
 * Posts messages to a Google Chat space through an incoming webhook.
 *
 * Delivery failures are returned in the result and logged with `console.warn`;
 * the webhook URL is a credential and never appears in either.
 */
class GasChat {
  private readonly _webhookUrl: string | (() => string | null | undefined);
  private readonly _appName: string;
  private readonly _throttleSeconds: number;
  private readonly _threadKey: string | undefined;
  private _resolvedUrl: string | null = null;

  /**
   * @param options - See {@link GasChatOptions}.
   * @throws {TypeError} When an option is invalid or unknown.
   */
  constructor(options: GasChatOptions) {
    if (options === null || typeof options !== 'object') {
      throw new TypeError('[GasChat] options must be an object');
    }
    for (const key of Object.keys(options)) {
      if (GAS_CHAT_OPTION_KEYS.indexOf(key) === -1) {
        throw new TypeError(`[GasChat] unknown option "${key}"`);
      }
    }

    const { webhookUrl, appName, throttleSeconds, threadKey } = options;
    if (
      typeof webhookUrl !== 'function' &&
      !(
        typeof webhookUrl === 'string' &&
        GAS_CHAT_WEBHOOK_PATTERN.test(webhookUrl)
      )
    ) {
      throw new TypeError(
        '[GasChat] webhookUrl must be a Chat webhook URL or a function',
      );
    }
    if (
      appName !== undefined &&
      (typeof appName !== 'string' || appName === '')
    ) {
      throw new TypeError('[GasChat] appName must be a non-empty string');
    }
    if (
      throttleSeconds !== undefined &&
      (typeof throttleSeconds !== 'number' ||
        !Number.isInteger(throttleSeconds) ||
        throttleSeconds < 0 ||
        throttleSeconds > GAS_CHAT_MAX_THROTTLE_SECONDS)
    ) {
      throw new TypeError(
        `[GasChat] throttleSeconds must be an integer from 0 to ${GAS_CHAT_MAX_THROTTLE_SECONDS}`,
      );
    }
    if (
      threadKey !== undefined &&
      (typeof threadKey !== 'string' || threadKey === '')
    ) {
      throw new TypeError('[GasChat] threadKey must be a non-empty string');
    }

    this._webhookUrl = webhookUrl;
    this._appName = appName ?? GAS_CHAT_DEFAULT_APP_NAME;
    this._throttleSeconds =
      throttleSeconds ?? GAS_CHAT_DEFAULT_THROTTLE_SECONDS;
    this._threadKey = threadKey;
  }

  /**
   * Posts a message to the space.
   *
   * @param message - Text, or a message with `text` and/or `cardsV2`.
   * @returns The delivery outcome; delivery failures never throw.
   * @throws {TypeError} When the message has no content or `threadKey` is invalid.
   */
  send(message: string | GasChatMessage): GasChatSendResult {
    const msg: GasChatMessage =
      typeof message === 'string' ? { text: message } : message;
    if (msg === null || typeof msg !== 'object') {
      throw new TypeError('[GasChat] message must be a string or an object');
    }

    const { text, cardsV2, threadKey } = msg;
    const hasText = typeof text === 'string' && text !== '';
    const hasCards = Array.isArray(cardsV2) && cardsV2.length > 0;
    if (cardsV2 !== undefined && !Array.isArray(cardsV2)) {
      throw new TypeError('[GasChat] cardsV2 must be an array');
    }
    if (text !== undefined && typeof text !== 'string') {
      throw new TypeError('[GasChat] text must be a string');
    }
    if (!hasText && !hasCards) {
      throw new TypeError(
        '[GasChat] message needs a non-empty text or cardsV2',
      );
    }
    if (
      threadKey !== undefined &&
      (typeof threadKey !== 'string' || threadKey === '')
    ) {
      throw new TypeError('[GasChat] threadKey must be a non-empty string');
    }

    const resolved = this._resolveUrl();
    if (typeof resolved !== 'string') {
      return resolved;
    }

    const payload: { text?: string; cardsV2?: ReadonlyArray<GasChatCardV2> } =
      {};
    if (hasText) {
      payload.text = _gasChatCut(text, GAS_CHAT_MAX_TEXT_LENGTH);
    }
    if (hasCards) {
      payload.cardsV2 = cardsV2;
    }

    const thread = threadKey ?? this._threadKey;
    const url =
      thread === undefined
        ? resolved
        : `${resolved}&threadKey=${encodeURIComponent(thread)}&messageReplyOption=REPLY_MESSAGE_FALLBACK_TO_NEW_THREAD`;

    try {
      const response = UrlFetchApp.fetch(url, {
        method: 'post',
        contentType: 'application/json; charset=UTF-8',
        payload: JSON.stringify(payload),
        muteHttpExceptions: true,
      });
      const status = response.getResponseCode();
      if (status >= 200 && status < 300) {
        return { ok: true, status, throttled: false };
      }
      const body = this._redact(
        String(response.getContentText()),
        resolved,
      ).slice(0, 500);
      console.warn(`[GasChat] Chat returned HTTP ${status}: ${body}`);
      return {
        ok: false,
        status,
        throttled: false,
        error: `Chat returned HTTP ${status}`,
      };
    } catch (err) {
      const error = this._redact(
        err instanceof Error ? err.message : String(err),
        resolved,
      );
      console.warn(`[GasChat] Request failed: ${error}`);
      return { ok: false, status: null, throttled: false, error };
    }
  }

  /**
   * Reports an unexpected error to the space. Never throws.
   *
   * @param err - The caught value; non-Error values are stringified.
   * @param context - Extra key/value pairs shown in the alert.
   * @returns The delivery outcome, or `throttled: true` for a recent duplicate.
   */
  notifyError(
    err: unknown,
    context: Record<string, unknown> = {},
  ): GasChatSendResult {
    try {
      const isError = err instanceof Error;
      const extra: Record<string, unknown> = {};
      if (isError && err.name !== 'Error') {
        extra.name = err.name;
      }
      return this._alert({
        title: 'Unexpected error',
        message: isError ? err.message : String(err),
        ...(isError && err.stack !== undefined ? { stack: err.stack } : {}),
        context: { ...extra, ...context },
      });
    } catch (e) {
      return this._alertFailure(e);
    }
  }

  /**
   * Runs `fn`, alerts on a throw and rethrows the original value unchanged.
   *
   * @param source - Name of the entry point, shown as `source` in the alert.
   * @param fn - The guarded function.
   * @returns The value returned by `fn`.
   */
  run<T>(source: string, fn: () => T): T {
    try {
      return fn();
    } catch (err) {
      this.notifyError(err, { source });
      throw err;
    }
  }

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
    options: GasChatLoggerOptions = {},
  ): T {
    if (
      inner === null ||
      (typeof inner !== 'object' && typeof inner !== 'function') ||
      typeof inner.error !== 'function'
    ) {
      throw new TypeError('[GasChat] logger target needs an error() method');
    }
    const requested = options.levels ?? GAS_CHAT_DEFAULT_LOG_LEVELS;
    if (
      !Array.isArray(requested) ||
      requested.length === 0 ||
      requested.some((level) => typeof level !== 'string')
    ) {
      throw new TypeError('[GasChat] levels must be a non-empty string array');
    }
    const levels = requested.slice();

    const target = inner as unknown as Record<string, unknown>;
    // Reuses a wrapper while the inner method is unchanged, for stable identity.
    const wrappers = new Map<
      PropertyKey,
      { method: unknown; wrapper: unknown }
    >();
    // Proxy a shadow so invariants never bind to inner's frozen properties.
    const shadow: object =
      typeof inner === 'function'
        ? Object.setPrototypeOf(() => undefined, inner)
        : Object.create(inner);
    const proxy = new Proxy(shadow, {
      get: (_obj, prop) => {
        const value = target[prop as string];
        if (typeof value !== 'function') {
          return value;
        }
        const cached = wrappers.get(prop);
        if (cached !== undefined && cached.method === value) {
          return cached.wrapper;
        }
        const method = value as (...args: unknown[]) => unknown;
        let wrapper: unknown;
        if (typeof prop === 'string' && levels.indexOf(prop) !== -1) {
          wrapper = (...args: unknown[]) => {
            const result = method.apply(inner, args);
            try {
              this._alert(
                this._alertFromLog(
                  args[0] as string,
                  args[1] as Record<string, unknown> | undefined,
                ),
              );
            } catch (e) {
              this._alertFailure(e);
            }
            return result;
          };
        } else if (prop === 'child') {
          wrapper = (...args: unknown[]) =>
            this.logger(method.apply(inner, args) as T, { ...options, levels });
        } else {
          wrapper = method.bind(inner);
        }
        wrappers.set(prop, { method: value, wrapper });
        return wrapper;
      },
      set: (_obj, prop, value) => Reflect.set(inner, prop, value),
      deleteProperty: (_obj, prop) => Reflect.deleteProperty(inner, prop),
      defineProperty: (_obj, prop, descriptor) =>
        descriptor.configurable === false
          ? false
          : Reflect.defineProperty(inner, prop, descriptor),
      getPrototypeOf: () => Reflect.getPrototypeOf(inner),
      preventExtensions: () => false,
      ownKeys: () => Reflect.ownKeys(inner),
      getOwnPropertyDescriptor: (_obj, prop) => {
        const descriptor = Reflect.getOwnPropertyDescriptor(inner, prop);
        if (descriptor === undefined) {
          return undefined;
        }
        if ('value' in descriptor) {
          descriptor.value = Reflect.get(proxy, prop);
        }
        descriptor.configurable = true;
        return descriptor;
      },
      apply: (_obj, thisArg, args) =>
        Reflect.apply(inner as unknown as () => unknown, thisArg, args),
    });
    return proxy as T;
  }

  /** Builds an alert from a logger call's message and metadata. */
  private _alertFromLog(
    msg: string,
    meta: Record<string, unknown> = {},
  ): GasChatAlert {
    const source = meta !== null && typeof meta === 'object' ? meta : {};
    const cause = source.error ?? source.err;
    const causeError = cause instanceof Error ? cause : undefined;
    const message =
      typeof source.message === 'string'
        ? source.message
        : (causeError?.message ?? String(msg));
    const stack =
      typeof source.stack === 'string' ? source.stack : causeError?.stack;
    const context: Record<string, unknown> = {};
    for (const key of Object.keys(source)) {
      if (['message', 'stack', 'error', 'err'].indexOf(key) === -1) {
        context[key] = source[key];
      }
    }
    return {
      title: String(msg),
      message,
      ...(stack !== undefined ? { stack } : {}),
      context,
    };
  }

  /** Sends an alert, suppressing duplicates. Never throws. */
  private _alert(alert: GasChatAlert): GasChatSendResult {
    try {
      const url = this._resolveUrl();
      if (typeof url !== 'string') {
        return url;
      }
      const text = _gasChatFormatAlert(this._appName, alert, new Date());
      let cache: GoogleAppsScript.Cache.Cache | null = null;
      let key = '';
      if (this._throttleSeconds > 0) {
        try {
          key =
            GAS_CHAT_CACHE_PREFIX +
            Utilities.base64EncodeWebSafe(
              Utilities.computeDigest(
                Utilities.DigestAlgorithm.SHA_256,
                JSON.stringify([
                  url,
                  this._appName,
                  this._threadKey ?? null,
                  _gasChatFingerprintSource(alert),
                ]),
                Utilities.Charset.UTF_8,
              ),
            );
          const scriptCache = CacheService.getScriptCache();
          if (scriptCache.get(key) !== null) {
            return { ok: true, status: null, throttled: true };
          }
          scriptCache.put(key, '1', this._throttleSeconds);
          cache = scriptCache;
        } catch (e) {
          // Fail open: a cache error must not suppress the alert.
          console.warn(`[GasChat] Throttle unavailable: ${this._redactAny(e)}`);
          cache = null;
        }
      }

      const result = this.send({ text });
      if (!result.ok && cache !== null) {
        try {
          cache.remove(key);
        } catch (e) {
          console.warn(
            `[GasChat] Throttle cleanup failed: ${this._redactAny(e)}`,
          );
        }
      }
      return result;
    } catch (e) {
      return this._alertFailure(e);
    }
  }

  /** Converts an unexpected internal failure into a result and a warning. */
  private _alertFailure(e: unknown): GasChatSendResult {
    const error = this._redactAny(e);
    console.warn(`[GasChat] Alert failed: ${error}`);
    return { ok: false, status: null, throttled: false, error };
  }

  /** Error text with any webhook URL masked, for diagnostics. */
  private _redactAny(e: unknown): string {
    const text = e instanceof Error ? e.message : String(e);
    return this._resolvedUrl === null
      ? text
      : this._redact(text, this._resolvedUrl);
  }

  /**
   * Returns the webhook URL, or a failure result when it cannot be resolved.
   * A resolved URL is cached; failures are not, so the next call retries.
   */
  private _resolveUrl(): string | GasChatSendResult {
    if (this._resolvedUrl !== null) {
      return this._resolvedUrl;
    }

    let url: unknown = this._webhookUrl;
    if (typeof this._webhookUrl === 'function') {
      try {
        url = this._webhookUrl();
      } catch (_err) {
        url = null;
      }
    }

    let error: string | null = null;
    if (typeof url !== 'string' || url === '') {
      error = 'Webhook URL is not configured';
    } else if (!GAS_CHAT_WEBHOOK_PATTERN.test(url)) {
      error = 'Webhook URL is invalid';
    }
    if (error !== null || typeof url !== 'string') {
      console.warn(`[GasChat] ${error}`);
      return { ok: false, status: null, throttled: false, error: error ?? '' };
    }

    this._resolvedUrl = url;
    return url;
  }

  /** Masks the webhook URL, its key and token, and any Chat URL in `text`. */
  private _redact(text: string, url: string): string {
    let out = text.split(url).join('[redacted]');
    const query = url.slice(url.indexOf('?') + 1);
    for (const pair of query.split('&')) {
      const value = pair.slice(pair.indexOf('=') + 1);
      if (value === '') {
        continue;
      }
      out = out.split(value).join('[redacted]');
      try {
        const decoded = decodeURIComponent(value);
        if (decoded !== '' && decoded !== value) {
          out = out.split(decoded).join('[redacted]');
        }
      } catch (_err) {
        // Malformed escape: the raw value is already masked.
      }
    }
    return out.replace(
      /https:\/\/chat\.googleapis\.com[^\s"'<>)]*/g,
      '[redacted]',
    );
  }
}
