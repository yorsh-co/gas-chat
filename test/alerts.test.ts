import { describe, expect, it } from 'vitest';
import { loadGasChat } from './harness';
import { WEBHOOK_URL } from './mocks';

function setup(options: Record<string, unknown> = {}) {
  const { exports, mocks } = loadGasChat();
  const chat = new exports.GasChat({ webhookUrl: WEBHOOK_URL, ...options });
  return { exports, mocks, chat };
}

const sentText = (mocks: ReturnType<typeof setup>['mocks'], call = 0) =>
  JSON.parse(
    (mocks.UrlFetchApp.fetch.mock.calls[call]?.[1] as { payload: string })
      .payload,
  ).text as string;

describe('notifyError', () => {
  it.each([[new Error()], ['']])('omits an empty message line (%#)', (err) => {
    const { chat, mocks } = setup();
    chat.notifyError(err);
    expect(sentText(mocks).split('\n')).not.toContain('``');
  });

  it.each([
    ['abc'],
    [['a', 'b']],
    [null],
    [new String('abc')],
    [new Number(1)],
    [new Boolean(true)],
  ])('ignores a non-object context (%#)', (context) => {
    const { chat, mocks } = setup();
    chat.notifyError(new Error('x'), context as never);
    expect(mocks.UrlFetchApp.fetch).toHaveBeenCalledTimes(1);
    const text = sentText(mocks);
    expect(text).toContain('`x`');
    expect(text).not.toContain('`0`');
    expect(text).not.toContain('`1`');
    expect(text).not.toContain('`2`');
  });

  it('accepts a class-instance context', () => {
    const { chat, mocks } = setup();
    chat.notifyError(
      new Error('x'),
      new (class {
        a = 1;
      })() as never,
    );
    expect(sentText(mocks)).toContain('• `a`: `1`');
  });

  it('sends a formatted alert', () => {
    const { chat, mocks } = setup({ appName: 'Orders' });
    const result = chat.notifyError(new Error('boom'), { source: 's' });
    expect(result).toEqual({ ok: true, status: 200, throttled: false });
    const text = sentText(mocks);
    expect(text).toContain('🚨 *Orders* · Unexpected error');
    expect(text).toContain('`boom`');
    expect(text).toContain('• `source`: `s`');
    expect(text).not.toContain('• `name`:');
  });

  it('includes the name of non-plain errors', () => {
    const { chat, mocks } = setup();
    chat.notifyError(new TypeError('bad'));
    expect(sentText(mocks)).toContain('• `name`: `TypeError`');
  });

  it.each([['x'], [null], [{}]])('handles non-Error %j', (value) => {
    const { chat, mocks } = setup();
    expect(chat.notifyError(value).ok).toBe(true);
    expect(sentText(mocks)).toContain(`\`${String(value)}\``);
  });

  it('never throws, even for hostile values', () => {
    const { chat, mocks } = setup();
    const hostile = {
      toString() {
        throw new Error('nope');
      },
    };
    const result = chat.notifyError(hostile);
    expect(result.ok).toBe(false);
    expect(mocks.console.warn).toHaveBeenCalled();
  });
});

describe('throttle', () => {
  const OTHER_URL = WEBHOOK_URL.replace(/spaces\/[^/]+/, 'spaces/OTHER');

  it.each([
    ['webhook', { webhookUrl: OTHER_URL }],
    ['appName', { appName: 'Other' }],
    ['threadKey', { threadKey: 'thread-b' }],
  ])('does not suppress alerts that differ by %s', (_name, override) => {
    const { exports, mocks } = loadGasChat();
    const a = new exports.GasChat({
      webhookUrl: WEBHOOK_URL,
      threadKey: 'thread-a',
    });
    const b = new exports.GasChat({
      webhookUrl: WEBHOOK_URL,
      threadKey: 'thread-a',
      ...override,
    });
    const err = new Error('boom');
    expect(a.notifyError(err).throttled).toBe(false);
    expect(b.notifyError(err).throttled).toBe(false);
    expect(mocks.UrlFetchApp.fetch).toHaveBeenCalledTimes(2);
    for (const [key] of mocks.cache.put.mock.calls) {
      expect(key).not.toContain('test-token');
      expect(key).not.toContain('test-key');
      expect(key).not.toContain('chat.googleapis.com');
    }
  });

  it('suppresses identical alerts across identically configured instances', () => {
    const { exports, mocks } = loadGasChat();
    const config = {
      webhookUrl: WEBHOOK_URL,
      appName: 'Orders',
      threadKey: 'thread-a',
    };
    const a = new exports.GasChat(config);
    const b = new exports.GasChat(config);
    const err = new Error('boom');
    expect(a.notifyError(err).throttled).toBe(false);
    expect(b.notifyError(err).throttled).toBe(true);
    expect(mocks.UrlFetchApp.fetch).toHaveBeenCalledTimes(1);
  });

  it('does not touch the cache when the URL cannot be resolved', () => {
    const { exports, mocks } = loadGasChat();
    const chat = new exports.GasChat({ webhookUrl: () => null });
    const result = chat.notifyError(new Error('boom'));
    expect(result).toMatchObject({ ok: false, throttled: false });
    expect(result.error).toBe('Webhook URL is not configured');
    expect(mocks.cache.put).not.toHaveBeenCalled();
    expect(mocks.cache.get).not.toHaveBeenCalled();
    expect(mocks.CacheService.getScriptCache).not.toHaveBeenCalled();
    expect(mocks.Utilities.computeDigest).not.toHaveBeenCalled();
  });

  it('does not collide when fields contain the delimiter', () => {
    const { exports, mocks } = loadGasChat();
    const a = new exports.GasChat({
      webhookUrl: WEBHOOK_URL,
      appName: 'a|b',
      threadKey: 'c',
    });
    const b = new exports.GasChat({
      webhookUrl: WEBHOOK_URL,
      appName: 'a',
      threadKey: 'b|c',
    });
    const err = new Error('boom');
    expect(a.notifyError(err).throttled).toBe(false);
    expect(b.notifyError(err).throttled).toBe(false);
    expect(mocks.UrlFetchApp.fetch).toHaveBeenCalledTimes(2);
  });

  it('suppresses an identical second alert', () => {
    const { chat, mocks } = setup();
    const err = new Error('boom');
    chat.notifyError(err);
    const second = chat.notifyError(err);
    expect(second).toEqual({ ok: true, status: null, throttled: true });
    expect(mocks.UrlFetchApp.fetch).toHaveBeenCalledTimes(1);
  });

  it('sends distinct alerts and puts the configured expiry', () => {
    const { chat, mocks } = setup({ throttleSeconds: 60 });
    chat.notifyError(new Error('a'));
    chat.notifyError(new Error('b'));
    expect(mocks.UrlFetchApp.fetch).toHaveBeenCalledTimes(2);
    expect(mocks.cache.put).toHaveBeenCalledTimes(2);
    const [key, value, seconds] = mocks.cache.put.mock.calls[0] ?? [];
    expect(key).toMatch(/^gas-chat:[A-Za-z0-9_-]+$/);
    expect(value).toBe('1');
    expect(seconds).toBe(60);
  });

  it('sends again once the key expires', () => {
    const { chat, mocks } = setup();
    const err = new Error('boom');
    chat.notifyError(err);
    mocks.store.clear();
    expect(chat.notifyError(err).throttled).toBe(false);
    expect(mocks.UrlFetchApp.fetch).toHaveBeenCalledTimes(2);
  });

  it('does not touch the cache when disabled', () => {
    const { chat, mocks } = setup({ throttleSeconds: 0 });
    const err = new Error('boom');
    chat.notifyError(err);
    chat.notifyError(err);
    expect(mocks.UrlFetchApp.fetch).toHaveBeenCalledTimes(2);
    expect(mocks.CacheService.getScriptCache).not.toHaveBeenCalled();
  });

  it('removes the key when delivery fails so a retry is sent', () => {
    const { chat, mocks } = setup();
    mocks.UrlFetchApp.fetch.mockImplementationOnce(() => ({
      getResponseCode: () => 500,
      getContentText: () => 'err',
    }));
    const err = new Error('boom');
    expect(chat.notifyError(err).ok).toBe(false);
    expect(mocks.cache.remove).toHaveBeenCalledTimes(1);
    expect(mocks.store.size).toBe(0);
    expect(chat.notifyError(err)).toMatchObject({ ok: true, throttled: false });
  });

  it('fails open when the cache throws', () => {
    const { chat, mocks } = setup();
    mocks.cache.get.mockImplementation(() => {
      throw new Error('cache down');
    });
    const result = chat.notifyError(new Error('boom'));
    expect(result.ok).toBe(true);
    expect(mocks.UrlFetchApp.fetch).toHaveBeenCalledTimes(1);
    expect(mocks.console.warn).toHaveBeenCalled();
  });

  it('fails open when the put throws, without a cleanup attempt', () => {
    const { chat, mocks } = setup();
    mocks.cache.put.mockImplementation(() => {
      throw new Error('too big');
    });
    expect(chat.notifyError(new Error('boom')).ok).toBe(true);
    expect(mocks.cache.remove).not.toHaveBeenCalled();
  });

  it('does not leak the webhook URL in cache diagnostics', () => {
    const { chat, mocks } = setup();
    chat.notifyError(new Error('first'));
    mocks.cache.get.mockImplementation(() => {
      throw new Error(`failed for ${WEBHOOK_URL}`);
    });
    chat.notifyError(new Error('second'));
    expect(JSON.stringify(mocks.console.warn.mock.calls)).not.toContain(
      'test-token',
    );
  });
});

describe('run', () => {
  it('returns the value without alerting', () => {
    const { chat, mocks } = setup();
    expect(chat.run('s', () => 42)).toBe(42);
    expect(mocks.UrlFetchApp.fetch).not.toHaveBeenCalled();
  });

  it('alerts and rethrows the original value', () => {
    const { chat, mocks } = setup();
    const err = new Error('boom');
    expect(() =>
      chat.run('dailySync', () => {
        throw err;
      }),
    ).toThrow(err);
    expect(sentText(mocks)).toContain('• `source`: `dailySync`');
  });

  it('rethrows non-Error values by identity', () => {
    const { chat } = setup();
    const thrown = { code: 1 };
    let caught: unknown;
    try {
      chat.run('s', () => {
        throw thrown;
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBe(thrown);
  });

  it('still rethrows when delivery fails', () => {
    const { chat, mocks } = setup();
    mocks.UrlFetchApp.fetch.mockImplementation(() => {
      throw new Error('net');
    });
    const err = new Error('boom');
    expect(() =>
      chat.run('s', () => {
        throw err;
      }),
    ).toThrow(err);
  });
});

describe('named webhook alerts', () => {
  const OPS_URL = WEBHOOK_URL.replace(/spaces\/[^/]+/, 'spaces/OPS');

  function setupNamed() {
    return setup({ webhookUrl: { default: WEBHOOK_URL, ops: OPS_URL } });
  }

  const fetchedUrl = (mocks: ReturnType<typeof setup>['mocks'], call = 0) =>
    String(mocks.UrlFetchApp.fetch.mock.calls[call]?.[0]);

  it('notifyError posts to the named webhook', () => {
    const { chat, mocks } = setupNamed();
    expect(chat.notifyError(new Error('boom'), {}, { webhook: 'ops' }).ok).toBe(
      true,
    );
    expect(fetchedUrl(mocks)).toBe(OPS_URL);
  });

  it('returns a failed result and warns for an unknown name', () => {
    const { chat, mocks } = setupNamed();
    const result = chat.notifyError(new Error('boom'), {}, { webhook: 'nope' });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('unknown webhook "nope"');
    expect(mocks.console.warn).toHaveBeenCalledTimes(1);
    expect(mocks.UrlFetchApp.fetch).not.toHaveBeenCalled();
  });

  it('treats non-object options as empty', () => {
    const { chat, mocks } = setupNamed();
    chat.notifyError(new Error('boom'), {}, null as never);
    expect(fetchedUrl(mocks)).toBe(WEBHOOK_URL);
  });

  it('throttles independently per webhook', () => {
    const { chat, mocks } = setupNamed();
    const err = new Error('boom');
    expect(chat.notifyError(err).throttled).toBe(false);
    expect(chat.notifyError(err, {}, { webhook: 'ops' }).throttled).toBe(false);
    expect(chat.notifyError(err, {}, { webhook: 'ops' }).throttled).toBe(true);
    expect(mocks.UrlFetchApp.fetch).toHaveBeenCalledTimes(2);
  });

  it('run alerts the named webhook and rethrows the original error', () => {
    const { chat, mocks } = setupNamed();
    const err = new Error('boom');
    expect(() =>
      chat.run(
        'job',
        () => {
          throw err;
        },
        { webhook: 'ops' },
      ),
    ).toThrow(err);
    expect(fetchedUrl(mocks)).toBe(OPS_URL);
  });
});
