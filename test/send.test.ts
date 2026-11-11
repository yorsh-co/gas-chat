import { describe, expect, it } from 'vitest';
import { loadGasChat } from './harness';
import { WEBHOOK_URL } from './mocks';

const SECRETS = ['test-key', 'test-token', 'chat.googleapis.com'];

function setup(options: Record<string, unknown> = { webhookUrl: WEBHOOK_URL }) {
  const { exports, mocks } = loadGasChat();
  return { exports, mocks, chat: new exports.GasChat(options) };
}

function expectNoLeak(
  mocks: ReturnType<typeof loadGasChat>['mocks'],
  result: unknown,
) {
  const seen = JSON.stringify([mocks.console.warn.mock.calls, result]);
  for (const secret of SECRETS) {
    expect(seen).not.toContain(secret);
  }
}

describe('constructor', () => {
  it.each([
    ['a missing webhookUrl', {}],
    [
      'a non-Chat host',
      { webhookUrl: 'https://evil.example.com/x?key=k&token=t' },
    ],
    ['a number webhookUrl', { webhookUrl: 5 }],
    ['an empty appName', { webhookUrl: WEBHOOK_URL, appName: '' }],
    ['a non-string appName', { webhookUrl: WEBHOOK_URL, appName: 1 }],
    ['a negative throttle', { webhookUrl: WEBHOOK_URL, throttleSeconds: -1 }],
    [
      'a fractional throttle',
      { webhookUrl: WEBHOOK_URL, throttleSeconds: 1.5 },
    ],
    [
      'a throttle over the max',
      { webhookUrl: WEBHOOK_URL, throttleSeconds: 21601 },
    ],
    ['an empty threadKey', { webhookUrl: WEBHOOK_URL, threadKey: '' }],
    ['a fragment', { webhookUrl: `${WEBHOOK_URL}#x` }],
    ['an existing threadKey', { webhookUrl: `${WEBHOOK_URL}&threadKey=x` }],
    ['a non-https URL', { webhookUrl: WEBHOOK_URL.replace('https', 'http') }],
    [
      'a userinfo host',
      {
        webhookUrl:
          'https://chat.googleapis.com@evil/v1/spaces/A/messages?key=k&token=t',
      },
    ],
    ['an unknown key', { webhookUrl: WEBHOOK_URL, extra: true }],
  ])('throws TypeError for %s', (_name, options) => {
    const { exports } = loadGasChat();
    expect(() => new exports.GasChat(options)).toThrow(TypeError);
    expect(() => new exports.GasChat(options)).toThrow(/^\[GasChat\] /);
  });

  it('names the unknown key', () => {
    const { exports } = loadGasChat();
    expect(
      () => new exports.GasChat({ webhookUrl: WEBHOOK_URL, bogus: 1 }),
    ).toThrow(/"bogus"/);
  });

  it('does not echo the webhook URL', () => {
    const { exports } = loadGasChat();
    try {
      new exports.GasChat({
        webhookUrl: 'https://x.test/?key=test-key&token=test-token',
      });
      expect.unreachable();
    } catch (err) {
      expect((err as Error).message).not.toContain('test-token');
    }
  });

  it('accepts a resolver and the boundary throttles', () => {
    const { exports } = loadGasChat();
    expect(
      () =>
        new exports.GasChat({
          webhookUrl: () => WEBHOOK_URL,
          throttleSeconds: 0,
        }),
    ).not.toThrow();
    expect(
      () =>
        new exports.GasChat({
          webhookUrl: WEBHOOK_URL,
          throttleSeconds: 21600,
        }),
    ).not.toThrow();
  });
});

describe('webhook resolution', () => {
  it('calls the resolver once and caches a valid result', () => {
    let calls = 0;
    const { chat, mocks } = setup({
      webhookUrl: () => {
        calls += 1;
        return WEBHOOK_URL;
      },
    });
    chat.send('a');
    chat.send('b');
    expect(calls).toBe(1);
    expect(mocks.UrlFetchApp.fetch).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['returns null', () => null, 'Webhook URL is not configured'],
    ['returns undefined', () => undefined, 'Webhook URL is not configured'],
    ['returns an empty string', () => '', 'Webhook URL is not configured'],
    ['returns a non-string', () => 42, 'Webhook URL is not configured'],
    [
      'returns another host',
      () => 'https://evil.example.com/v1/spaces/A/messages?key=k&token=t',
      'Webhook URL is invalid',
    ],
    [
      'returns a URL missing the token',
      () => 'https://chat.googleapis.com/v1/spaces/A/messages?key=k',
      'Webhook URL is invalid',
    ],
  ])(
    'fails without fetching when the resolver %s',
    (_name, resolver, error) => {
      const { chat, mocks } = setup({ webhookUrl: resolver });
      const result = chat.send('hi');
      expect(result).toEqual({
        ok: false,
        status: null,
        throttled: false,
        error,
      });
      expect(mocks.UrlFetchApp.fetch).not.toHaveBeenCalled();
      expect(mocks.console.warn).toHaveBeenCalledTimes(1);
      expect(mocks.console.warn.mock.calls[0]?.[0]).toMatch(/^\[GasChat\] /);
      expectNoLeak(mocks, result);
    },
  );

  it('reports a throwing resolver with its masked cause', () => {
    const { chat, mocks } = setup({
      webhookUrl: () => {
        throw new Error(
          'no prop at https://chat.googleapis.com/v1/spaces/X/messages?key=k&token=t',
        );
      },
    });
    const result = chat.send('hi');
    const error = 'Webhook URL resolver failed: no prop at [redacted]';
    expect(result).toEqual({
      ok: false,
      status: null,
      throttled: false,
      error,
    });
    expect(mocks.console.warn).toHaveBeenCalledTimes(1);
    expect(mocks.console.warn.mock.calls[0]?.[0]).toBe(`[GasChat] ${error}`);
    expect(mocks.UrlFetchApp.fetch).not.toHaveBeenCalled();
  });

  it('reports an unprintable thrown value from the resolver', () => {
    const { chat } = setup({
      webhookUrl: () => {
        throw Object.create(null);
      },
    });
    expect(chat.send('hi')).toEqual({
      ok: false,
      status: null,
      throttled: false,
      error: 'Webhook URL resolver failed: unknown error',
    });
  });

  it('retries a throwing resolver on the next call', () => {
    let calls = 0;
    const { chat, mocks } = setup({
      webhookUrl: () => {
        calls += 1;
        throw new Error('nope');
      },
    });
    const first = chat.send('a');
    const second = chat.send('b');
    expect(calls).toBe(2);
    expect(first.error).toBe('Webhook URL resolver failed: nope');
    expect(second.error).toBe('Webhook URL resolver failed: nope');
    expect(mocks.UrlFetchApp.fetch).not.toHaveBeenCalled();
  });

  it('reports an Error whose message getter throws', () => {
    const { chat } = setup({
      webhookUrl: () => {
        const err = new Error('x');
        Object.defineProperty(err, 'message', {
          get() {
            throw new Error('boom');
          },
        });
        throw err;
      },
    });
    expect(chat.send('hi').error).toBe(
      'Webhook URL resolver failed: unknown error',
    );
  });

  it('reports an Error whose message is not a string', () => {
    const { chat } = setup({
      webhookUrl: () => {
        const err = new Error('x');
        Object.defineProperty(err, 'message', { value: 42 });
        throw err;
      },
    });
    expect(chat.send('hi').error).toBe('Webhook URL resolver failed: 42');
  });

  it('does not cache a failure and retries on the next call', () => {
    let url: string | null = null;
    const { chat, mocks } = setup({ webhookUrl: () => url });
    expect(chat.send('a').ok).toBe(false);
    url = WEBHOOK_URL;
    expect(chat.send('a').ok).toBe(true);
    expect(mocks.UrlFetchApp.fetch).toHaveBeenCalledTimes(1);
  });
});

describe('send arguments', () => {
  it.each([
    ['an empty string', ''],
    ['an empty object', {}],
    ['empty text', { text: '' }],
    ['empty cardsV2', { cardsV2: [] }],
    ['a non-string text', { text: 5 }],
    ['an empty threadKey', { text: 'x', threadKey: '' }],
    ['a non-string threadKey', { text: 'x', threadKey: 1 }],
    ['null', null],
    ['a non-array cardsV2', { text: 'x', cardsV2: 'nope' }],
  ])('throws TypeError for %s', (_name, message) => {
    const { chat, mocks } = setup();
    expect(() => chat.send(message)).toThrow(TypeError);
    expect(mocks.UrlFetchApp.fetch).not.toHaveBeenCalled();
  });
});

describe('send request', () => {
  it('posts a string as text JSON', () => {
    const { chat, mocks } = setup();
    expect(chat.send('hello')).toEqual({
      ok: true,
      status: 200,
      throttled: false,
    });
    expect(mocks.UrlFetchApp.fetch).toHaveBeenCalledWith(WEBHOOK_URL, {
      method: 'post',
      contentType: 'application/json; charset=UTF-8',
      payload: JSON.stringify({ text: 'hello' }),
      muteHttpExceptions: true,
    });
  });

  it('passes cardsV2 through untouched', () => {
    const { chat, mocks } = setup();
    const cardsV2 = [{ cardId: 'c1', card: { header: { title: 'T' } } }];
    chat.send({ text: 'hi', cardsV2 });
    const params = mocks.UrlFetchApp.fetch.mock.calls[0]?.[1] as {
      payload: string;
    };
    expect(JSON.parse(params.payload)).toEqual({ text: 'hi', cardsV2 });
  });

  it('accepts cards without text', () => {
    const { chat, mocks } = setup();
    chat.send({ cardsV2: [{ cardId: 'c1', card: {} }] });
    const params = mocks.UrlFetchApp.fetch.mock.calls[0]?.[1] as {
      payload: string;
    };
    expect(JSON.parse(params.payload)).toEqual({
      cardsV2: [{ cardId: 'c1', card: {} }],
    });
  });

  it('cuts long text to the limit including the marker', () => {
    const { chat, mocks, exports } = setup();
    chat.send('x'.repeat(exports.GAS_CHAT_MAX_TEXT_LENGTH + 100));
    const params = mocks.UrlFetchApp.fetch.mock.calls[0]?.[1] as {
      payload: string;
    };
    const text = (JSON.parse(params.payload) as { text: string }).text;
    expect(text).toHaveLength(exports.GAS_CHAT_MAX_TEXT_LENGTH);
    expect(text.endsWith(exports.GAS_CHAT_TRUNCATION_MARKER)).toBe(true);
  });

  it('does not split a surrogate pair at the cut point', () => {
    const { chat, mocks, exports } = setup();
    const keep =
      exports.GAS_CHAT_MAX_TEXT_LENGTH -
      exports.GAS_CHAT_TRUNCATION_MARKER.length;
    chat.send('x'.repeat(keep - 1) + '😀'.repeat(50));
    const params = mocks.UrlFetchApp.fetch.mock.calls[0]?.[1] as {
      payload: string;
    };
    const text = (JSON.parse(params.payload) as { text: string }).text;
    expect(text.length).toBeLessThanOrEqual(exports.GAS_CHAT_MAX_TEXT_LENGTH);
    expect(text).not.toMatch(/[\ud800-\udbff](?![\udc00-\udfff])/);
    expect(text.endsWith(exports.GAS_CHAT_TRUNCATION_MARKER)).toBe(true);
  });

  it('keeps text of exactly the limit', () => {
    const { chat, mocks, exports } = setup();
    const text = 'x'.repeat(exports.GAS_CHAT_MAX_TEXT_LENGTH);
    chat.send(text);
    const params = mocks.UrlFetchApp.fetch.mock.calls[0]?.[1] as {
      payload: string;
    };
    expect((JSON.parse(params.payload) as { text: string }).text).toBe(text);
  });

  it('appends the instance threadKey, encoded', () => {
    const { chat, mocks } = setup({
      webhookUrl: WEBHOOK_URL,
      threadKey: 'a b&c',
    });
    chat.send('hi');
    expect(mocks.UrlFetchApp.fetch.mock.calls[0]?.[0]).toBe(
      `${WEBHOOK_URL}&threadKey=a%20b%26c&messageReplyOption=REPLY_MESSAGE_FALLBACK_TO_NEW_THREAD`,
    );
  });

  it('prefers the message threadKey over the option', () => {
    const { chat, mocks } = setup({
      webhookUrl: WEBHOOK_URL,
      threadKey: 'opt',
    });
    chat.send({ text: 'hi', threadKey: 'msg' });
    expect(mocks.UrlFetchApp.fetch.mock.calls[0]?.[0]).toContain(
      '&threadKey=msg&',
    );
  });

  it('adds no thread parameters without a threadKey', () => {
    const { chat, mocks } = setup();
    chat.send('hi');
    expect(mocks.UrlFetchApp.fetch.mock.calls[0]?.[0]).not.toContain(
      'threadKey',
    );
  });

  it('treats any 2xx as success', () => {
    const { chat, mocks } = setup();
    mocks.UrlFetchApp.fetch.mockReturnValueOnce({
      getResponseCode: () => 204,
      getContentText: () => '',
    });
    expect(chat.send('hi')).toEqual({
      ok: true,
      status: 204,
      throttled: false,
    });
  });
});

describe('send redaction', () => {
  it('masks a token cut at the 500-character boundary', () => {
    const { chat, mocks } = setup();
    mocks.UrlFetchApp.fetch.mockReturnValueOnce({
      getResponseCode: () => 400,
      getContentText: () => `${'b'.repeat(497)}test-token`,
    });
    expectNoLeak(mocks, chat.send('hi'));
    expect(String(mocks.console.warn.mock.calls[0]?.[0])).not.toContain('tok');
  });

  it('masks a percent-decoded token in an error', () => {
    const url =
      'https://chat.googleapis.com/v1/spaces/AAAA/messages?key=k%2Fey&token=to%2Bken%3D';
    const { chat, mocks } = setup({ webhookUrl: url });
    mocks.UrlFetchApp.fetch.mockImplementationOnce(() => {
      throw new Error('bad token to+ken= key k/ey');
    });
    const result = chat.send('hi');
    const seen = JSON.stringify([mocks.console.warn.mock.calls, result]);
    expect(seen).not.toContain('to+ken=');
    expect(seen).not.toContain('k/ey');
  });

  it('ignores a bare query pair without a value', () => {
    const { chat, mocks } = setup({ webhookUrl: `${WEBHOOK_URL}&v` });
    mocks.UrlFetchApp.fetch
      .mockReturnValueOnce({
        getResponseCode: () => 400,
        getContentText: () => 'invalid value test-token',
      })
      .mockImplementationOnce(() => {
        throw new Error('invalid value test-token');
      });
    const first = chat.send('hi');
    const second = chat.send('hi again');
    const warnings = mocks.console.warn.mock.calls.map((c) => String(c[0]));
    expect(warnings[0]).toContain('invalid value [redacted]');
    expect(warnings[1]).toContain('invalid value [redacted]');
    expect(second.error).toContain('invalid value [redacted]');
    expectNoLeak(mocks, first);
    expectNoLeak(mocks, second);
  });

  it('masks Chat URLs in a cache error', () => {
    const { chat, mocks } = setup();
    mocks.CacheService.getScriptCache.mockImplementationOnce(() => {
      throw new Error(
        'boom https://chat.googleapis.com/v1/spaces/X/messages?key=k&token=t',
      );
    });
    chat.notifyError(new Error('x'));
    const warning = String(mocks.console.warn.mock.calls[0]?.[0]);
    expect(warning).toContain('[redacted]');
    expect(warning).not.toContain('token=t');
    expect(warning).not.toContain('key=k');
  });

  it.each([
    [
      'notifyError',
      (chat: { notifyError: (e: unknown) => unknown }, hostile: unknown) =>
        chat.notifyError(hostile) as { error?: string } | undefined,
      true,
    ],
    [
      'logger',
      (
        chat: { logger: (t: unknown) => { error: (m: unknown) => void } },
        hostile: unknown,
      ) => {
        chat.logger({ error: () => undefined }).error(hostile);
        return undefined;
      },
      false,
    ],
  ])(
    'masks Chat URLs in an error raised before the URL is resolved (%s)',
    (_label, run, expectsResult) => {
      const { chat, mocks } = setup();
      const hostile = {
        toString() {
          throw new Error(
            'boom https://chat.googleapis.com/v1/spaces/X/messages?key=k&token=t',
          );
        },
      };
      const result = run(chat as never, hostile);
      expect(mocks.UrlFetchApp.fetch).not.toHaveBeenCalled();
      expect(mocks.CacheService.getScriptCache).not.toHaveBeenCalled();
      expect(mocks.console.warn).toHaveBeenCalledTimes(1);
      const warning = String(mocks.console.warn.mock.calls[0]?.[0]);
      expect(warning).toBe('[GasChat] Alert failed: boom [redacted]');
      expect(warning).not.toContain('token=t');
      expect(warning).not.toContain('key=k');
      if (expectsResult) {
        expect(result).toBeDefined();
        expect(result?.error).toBe('boom [redacted]');
        expect(result?.error).not.toContain('token=t');
        expect(result?.error).not.toContain('key=k');
      } else {
        expect(result).toBeUndefined();
      }
    },
  );

  it('masks a threadKey-appended URL in a non-2xx body', () => {
    const { chat, mocks } = setup({ webhookUrl: WEBHOOK_URL, threadKey: 't' });
    mocks.UrlFetchApp.fetch.mockReturnValueOnce({
      getResponseCode: () => 400,
      getContentText: () =>
        `bad "${WEBHOOK_URL}&threadKey=t&messageReplyOption=X" end`,
    });
    expectNoLeak(mocks, chat.send('hi'));
  });
});

describe('send failures', () => {
  it('reports a non-2xx status and warns with a bounded body', () => {
    const { chat, mocks } = setup();
    mocks.UrlFetchApp.fetch.mockReturnValueOnce({
      getResponseCode: () => 400,
      getContentText: () => 'b'.repeat(2000),
    });
    const result = chat.send('hi');
    expect(result).toEqual({
      ok: false,
      status: 400,
      throttled: false,
      error: 'Chat returned HTTP 400',
    });
    const warning = String(mocks.console.warn.mock.calls[0]?.[0]);
    expect(warning).toContain('400');
    expect(warning.length).toBeLessThan(600);
    expectNoLeak(mocks, result);
  });

  it('redacts the URL echoed in a response body', () => {
    const { chat, mocks } = setup();
    mocks.UrlFetchApp.fetch.mockReturnValueOnce({
      getResponseCode: () => 403,
      getContentText: () =>
        `denied ${WEBHOOK_URL} key test-key token test-token`,
    });
    const result = chat.send('hi');
    expectNoLeak(mocks, result);
  });

  it('turns a thrown fetch into a failed result', () => {
    const { chat, mocks } = setup();
    mocks.UrlFetchApp.fetch.mockImplementationOnce(() => {
      throw new Error('DNS error');
    });
    const result = chat.send('hi');
    expect(result).toEqual({
      ok: false,
      status: null,
      throttled: false,
      error: 'DNS error',
    });
    expect(mocks.console.warn).toHaveBeenCalledTimes(1);
    expectNoLeak(mocks, result);
  });

  it('redacts the URL from a thrown fetch message', () => {
    const { chat, mocks } = setup();
    mocks.UrlFetchApp.fetch.mockImplementationOnce(() => {
      throw new Error(
        `Invalid argument: ${WEBHOOK_URL}&threadKey=x (token test-token)`,
      );
    });
    const result = chat.send('hi');
    expect(result.ok).toBe(false);
    expectNoLeak(mocks, result);
  });

  it('handles a non-Error throw', () => {
    const { chat, mocks } = setup();
    mocks.UrlFetchApp.fetch.mockImplementationOnce(() => {
      throw 'plain';
    });
    expect(chat.send('hi').error).toBe('plain');
  });
});
