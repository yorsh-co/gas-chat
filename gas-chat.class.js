'use strict';
/** Option keys accepted by the {@link GasChat} constructor. */
const GAS_CHAT_OPTION_KEYS = [
  'webhookUrl',
  'appName',
  'throttleSeconds',
  'threadKey',
];
/** True for a resolver function or a string that is a Chat webhook URL. */
function _gasChatIsWebhookSource(value) {
  return (
    typeof value === 'function' ||
    (typeof value === 'string' && GAS_CHAT_WEBHOOK_PATTERN.test(value))
  );
}
/**
 * Posts messages to a Google Chat space through an incoming webhook.
 *
 * Delivery failures are returned in the result and logged with `console.warn`;
 * the webhook URL is a credential and never appears in either.
 */
class GasChat {
  /**
   * @param options - See {@link GasChatOptions}.
   * @throws {TypeError} When an option is invalid or unknown.
   */
  constructor(options) {
    this._resolvedUrls = new Map();
    if (options === null || typeof options !== 'object') {
      throw new TypeError('[GasChat] options must be an object');
    }
    for (const key of Object.keys(options)) {
      if (GAS_CHAT_OPTION_KEYS.indexOf(key) === -1) {
        throw new TypeError(`[GasChat] unknown option "${key}"`);
      }
    }
    const { webhookUrl, appName, throttleSeconds, threadKey } = options;
    const proto =
      webhookUrl !== null && typeof webhookUrl === 'object'
        ? Object.getPrototypeOf(webhookUrl)
        : undefined;
    // Realm-independent plain-object check: null prototype, or a prototype
    // that is itself a root (Object.prototype).
    const namedForm =
      proto === null ||
      (typeof proto === 'object' && Object.getPrototypeOf(proto) === null);
    const webhooks = new Map();
    if (namedForm) {
      const entries = Object.keys(webhookUrl);
      if (entries.length === 0) {
        throw new TypeError('[GasChat] webhookUrl needs at least one webhook');
      }
      if (entries.indexOf(GAS_CHAT_DEFAULT_WEBHOOK) === -1) {
        throw new TypeError(
          `[GasChat] webhookUrl needs a "${GAS_CHAT_DEFAULT_WEBHOOK}" webhook`,
        );
      }
      for (const name of entries) {
        if (!GAS_CHAT_WEBHOOK_NAME_PATTERN.test(name)) {
          throw new TypeError(
            `[GasChat] webhook name "${this._maskChatUrls(name)}" must match ${GAS_CHAT_WEBHOOK_NAME_PATTERN.source}`,
          );
        }
        const source = webhookUrl[name];
        if (!_gasChatIsWebhookSource(source)) {
          throw new TypeError(
            `[GasChat] webhookUrl "${name}" must be a Chat webhook URL or a function`,
          );
        }
        webhooks.set(name, source);
      }
    } else {
      if (!_gasChatIsWebhookSource(webhookUrl)) {
        throw new TypeError(
          '[GasChat] webhookUrl must be a Chat webhook URL or a function',
        );
      }
      webhooks.set(GAS_CHAT_DEFAULT_WEBHOOK, webhookUrl);
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
    this._webhooks = webhooks;
    this._namedForm = namedForm;
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
   * @throws {TypeError} When the message has no content, or `threadKey` or `webhook` is invalid or unknown.
   */
  send(message) {
    const msg = typeof message === 'string' ? { text: message } : message;
    if (msg === null || typeof msg !== 'object') {
      throw new TypeError('[GasChat] message must be a string or an object');
    }
    const { text, cardsV2, threadKey, webhook } = msg;
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
    const webhookName = this._checkWebhook(webhook);
    const resolved = this._resolveUrl(webhookName);
    if (typeof resolved !== 'string') {
      return resolved;
    }
    const payload = {};
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
      const body = this._redactAll(
        this._redact(String(response.getContentText()), resolved),
      ).slice(0, 500);
      console.warn(`[GasChat] Chat returned HTTP ${status}: ${body}`);
      return {
        ok: false,
        status,
        throttled: false,
        error: `Chat returned HTTP ${status}`,
      };
    } catch (err) {
      const error = this._redactAll(
        this._redact(
          err instanceof Error ? err.message : String(err),
          resolved,
        ),
      );
      console.warn(`[GasChat] Request failed: ${error}`);
      return { ok: false, status: null, throttled: false, error };
    }
  }
  /**
   * Reports an unexpected error to the space. Never throws.
   *
   * @param err - The caught value; non-Error values are stringified.
   * @param context - Extra key/value pairs shown in the alert; non-object values, arrays and boxed primitives are ignored.
   * @param options - See {@link GasChatAlertOptions}; an unknown webhook name returns a failed result.
   * @returns The delivery outcome, or `throttled: true` for a recent duplicate.
   */
  notifyError(err, context = {}, options = {}) {
    try {
      const isError = err instanceof Error;
      const extra = {};
      if (isError && err.name !== 'Error') {
        extra.name = err.name;
      }
      const webhook =
        typeof options === 'object' && options !== null
          ? options.webhook
          : undefined;
      return this._alert(
        {
          title: 'Unexpected error',
          message: isError ? err.message : String(err),
          ...(isError && err.stack !== undefined ? { stack: err.stack } : {}),
          context: {
            ...extra,
            ...(typeof context === 'object' &&
            context !== null &&
            !Array.isArray(context) &&
            !/^\[object (String|Number|Boolean)\]$/.test(
              Object.prototype.toString.call(context),
            )
              ? context
              : {}),
          },
        },
        webhook,
      );
    } catch (e) {
      return this._alertFailure(e);
    }
  }
  /**
   * Runs `fn`, alerts on a throw and rethrows the original value unchanged.
   *
   * @param source - Name of the entry point, shown as `source` in the alert.
   * @param fn - The guarded function.
   * @param options - See {@link GasChatAlertOptions}.
   * @returns The value returned by `fn`.
   */
  run(source, fn, options) {
    try {
      return fn();
    } catch (err) {
      this.notifyError(err, { source }, options);
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
   * proxy, non-configurable `defineProperty` calls and `new` on a callable proxy
   * are unsupported.
   * @throws {TypeError} When `inner`, `levels` or `webhook` is invalid.
   */
  logger(inner, options = {}) {
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
    const webhook = this._checkWebhook(options.webhook);
    const target = inner;
    // Reuses a wrapper while the inner method is unchanged, for stable identity.
    const wrappers = new Map();
    // Proxy a shadow so invariants never bind to inner's frozen properties.
    const shadow =
      typeof inner === 'function'
        ? Object.setPrototypeOf(() => undefined, inner)
        : Object.create(inner);
    const proxy = new Proxy(shadow, {
      get: (_obj, prop) => {
        const value = target[prop];
        if (typeof value !== 'function') {
          return value;
        }
        const cached = wrappers.get(prop);
        if (cached !== undefined && cached.method === value) {
          return cached.wrapper;
        }
        const method = value;
        let wrapper;
        if (typeof prop === 'string' && levels.indexOf(prop) !== -1) {
          wrapper = (...args) => {
            const result = method.apply(inner, args);
            try {
              this._alert(this._alertFromLog(args[0], args[1]), webhook);
            } catch (e) {
              this._alertFailure(e);
            }
            return result;
          };
        } else if (prop === 'child') {
          wrapper = (...args) =>
            this.logger(method.apply(inner, args), {
              ...options,
              levels,
              webhook,
            });
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
      apply: (_obj, thisArg, args) => Reflect.apply(inner, thisArg, args),
    });
    return proxy;
  }
  /** Builds an alert from a logger call's message and metadata. */
  _alertFromLog(msg, meta = {}) {
    const source = meta !== null && typeof meta === 'object' ? meta : {};
    const causeError = [source.error, source.err, msg].find(
      (c) => c instanceof Error,
    );
    const message =
      typeof source.message === 'string'
        ? source.message
        : (causeError?.message ?? String(msg));
    const stack =
      typeof source.stack === 'string' ? source.stack : causeError?.stack;
    const context = {};
    for (const key of Object.keys(source)) {
      if (['message', 'stack', 'error', 'err'].indexOf(key) === -1) {
        context[key] = source[key];
      }
    }
    return {
      title: msg instanceof Error ? msg.name : String(msg),
      message,
      ...(stack !== undefined ? { stack } : {}),
      context,
    };
  }
  /** Sends an alert to a named webhook, suppressing duplicates. Never throws. */
  _alert(alert, webhook) {
    try {
      const name = this._checkWebhook(webhook);
      const url = this._resolveUrl(name);
      if (typeof url !== 'string') {
        return url;
      }
      const text = _gasChatFormatAlert(this._appName, alert, new Date());
      let cache = null;
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
      const result = this.send({ text, webhook: name });
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
  _alertFailure(e) {
    const error = this._redactAny(e);
    console.warn(`[GasChat] Alert failed: ${error}`);
    return { ok: false, status: null, throttled: false, error };
  }
  /** Text of a thrown value; never throws. */
  _errorText(e) {
    try {
      if (e instanceof Error) {
        return typeof e.message === 'string' ? e.message : String(e.message);
      }
      return String(e);
    } catch {
      return 'unknown error';
    }
  }
  /** Error text with any webhook URL masked, for diagnostics. */
  _redactAny(e) {
    return this._redactAll(this._errorText(e));
  }
  /** Masks every resolved webhook URL, then any Chat URL, in `text`. */
  _redactAll(text) {
    let out = text;
    for (const url of this._resolvedUrls.values()) {
      out = this._redact(out, url);
    }
    return this._maskChatUrls(out);
  }
  /**
   * Validates a webhook name and returns it, defaulting to `default`.
   * @throws {TypeError} When the name is not a string or is not configured.
   */
  _checkWebhook(name) {
    if (name === undefined) {
      return GAS_CHAT_DEFAULT_WEBHOOK;
    }
    if (typeof name !== 'string' || name === '') {
      throw new TypeError('[GasChat] webhook must be a non-empty string');
    }
    if (!this._webhooks.has(name)) {
      throw new TypeError(
        `[GasChat] unknown webhook "${this._maskChatUrls(name)}"`,
      );
    }
    return name;
  }
  /**
   * Returns the named webhook's URL, or a failure result when it cannot be
   * resolved. A resolved URL is cached per name; failures are not, so the
   * next call retries. Resolver errors mask every resolved webhook URL and
   * any full Chat URL.
   */
  _resolveUrl(name) {
    const cached = this._resolvedUrls.get(name);
    if (cached !== undefined) {
      return cached;
    }
    const source = this._webhooks.get(name);
    const suffix = this._namedForm ? ` for webhook "${name}"` : '';
    let url = source;
    let error = null;
    if (typeof source === 'function') {
      try {
        url = source();
      } catch (e) {
        url = null;
        const reason = this._redactAll(this._errorText(e));
        error = `Webhook URL resolver failed${suffix}: ${reason}`;
      }
    }
    if (error === null) {
      if (typeof url !== 'string' || url === '') {
        error = `Webhook URL is not configured${suffix}`;
      } else if (!GAS_CHAT_WEBHOOK_PATTERN.test(url)) {
        error = `Webhook URL is invalid${suffix}`;
      }
    }
    if (error !== null || typeof url !== 'string') {
      console.warn(`[GasChat] ${error}`);
      return { ok: false, status: null, throttled: false, error: error ?? '' };
    }
    this._resolvedUrls.set(name, url);
    return url;
  }
  /** Masks the webhook URL, its key and token, and any Chat URL in `text`. */
  _redact(text, url) {
    let out = text.split(url).join('[redacted]');
    const query = url.slice(url.indexOf('?') + 1);
    for (const pair of query.split('&')) {
      const eq = pair.indexOf('=');
      if (eq === -1) {
        continue;
      }
      const value = pair.slice(eq + 1);
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
    return this._maskChatUrls(out);
  }
  /** Masks any Google Chat URL in `text`. */
  _maskChatUrls(text) {
    return text.replace(
      /https:\/\/chat\.googleapis\.com[^\s"'<>)]*/g,
      '[redacted]',
    );
  }
}
