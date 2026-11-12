import { describe, expect, it, vi } from 'vitest';
import { loadGasChat } from './harness';
import { WEBHOOK_URL } from './mocks';

const REPORTS_URL =
  'https://chat.googleapis.com/v1/spaces/BBBB5678/messages?key=reports-key&token=reports-token';

function setup(webhookUrl: unknown = { default: WEBHOOK_URL }) {
  const { exports, mocks } = loadGasChat();
  return { exports, mocks, chat: new exports.GasChat({ webhookUrl }) };
}

function fetchedUrls(mocks: ReturnType<typeof loadGasChat>['mocks']) {
  return mocks.UrlFetchApp.fetch.mock.calls.map((call) => String(call[0]));
}

describe('named webhook validation', () => {
  it.each([
    ['a map without default', { reports: REPORTS_URL }],
    ['an empty map', {}],
    ['an array', [WEBHOOK_URL]],
    ['a Map', new Map([['default', WEBHOOK_URL]])],
    ['a bad name', { default: WEBHOOK_URL, '1bad': REPORTS_URL }],
    ['a name with a space', { default: WEBHOOK_URL, 'a b': REPORTS_URL }],
    ['a non-URL value', { default: WEBHOOK_URL, reports: 5 }],
  ])('throws TypeError for %s', (_label, webhookUrl) => {
    const { exports } = loadGasChat();
    expect(() => new exports.GasChat({ webhookUrl })).toThrow(TypeError);
  });

  it('reports the missing default and empty map', () => {
    const { exports } = loadGasChat();
    expect(
      () => new exports.GasChat({ webhookUrl: { reports: REPORTS_URL } }),
    ).toThrow('[GasChat] webhookUrl needs a "default" webhook');
    expect(() => new exports.GasChat({ webhookUrl: {} })).toThrow(
      '[GasChat] webhookUrl needs at least one webhook',
    );
  });

  it('never echoes a URL used as a key', () => {
    const { exports } = loadGasChat();
    let message = '';
    try {
      new exports.GasChat({
        webhookUrl: { default: WEBHOOK_URL, [REPORTS_URL]: WEBHOOK_URL },
      });
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain('webhook name');
    expect(message).not.toContain('reports-token');
    expect(message).not.toContain('reports-key');
  });

  it('never echoes a URL used as the webhook name', () => {
    const { chat } = setup();
    let message = '';
    try {
      chat.send({ text: 'hi', webhook: REPORTS_URL });
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain('unknown webhook');
    expect(message).not.toContain('reports-token');
    expect(message).not.toContain('reports-key');
  });

  it('names the key but not the URL for a bad value', () => {
    const { exports } = loadGasChat();
    const bad = 'https://evil.example.com/x?key=secret-k&token=secret-t';
    let message = '';
    try {
      new exports.GasChat({
        webhookUrl: { default: WEBHOOK_URL, reports: bad },
      });
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain('reports');
    expect(message).not.toContain('secret-k');
    expect(message).not.toContain('secret-t');
    expect(message).not.toContain('evil.example.com');
    expect(message).toContain('must be a Chat webhook URL or a function');
  });

  it('accepts resolvers as values', () => {
    const { exports } = loadGasChat();
    expect(
      () =>
        new exports.GasChat({
          webhookUrl: { default: () => WEBHOOK_URL, reports: () => null },
        }),
    ).not.toThrow();
  });
});

describe('send routing', () => {
  it('posts to default when no webhook is given', () => {
    const { chat, mocks } = setup({
      default: WEBHOOK_URL,
      reports: REPORTS_URL,
    });
    expect(chat.send('hi').ok).toBe(true);
    expect(fetchedUrls(mocks)).toEqual([WEBHOOK_URL]);
  });

  it('posts to the named webhook', () => {
    const { chat, mocks } = setup({
      default: WEBHOOK_URL,
      reports: REPORTS_URL,
    });
    expect(chat.send({ text: 'hi', webhook: 'reports' }).ok).toBe(true);
    expect(fetchedUrls(mocks)).toEqual([REPORTS_URL]);
    const payload = JSON.parse(
      String(
        mocks.UrlFetchApp.fetch.mock.calls[0]?.[1] &&
          (mocks.UrlFetchApp.fetch.mock.calls[0][1] as { payload: string })
            .payload,
      ),
    );
    expect(payload).toEqual({ text: 'hi' });
  });

  it.each([
    ['an unknown name', 'missing'],
    ['an empty name', ''],
    ['a number', 5],
    ['null', null],
  ])('throws TypeError for %s before any fetch', (_label, webhook) => {
    const { chat, mocks } = setup({
      default: WEBHOOK_URL,
      reports: REPORTS_URL,
    });
    expect(() => chat.send({ text: 'hi', webhook })).toThrow(TypeError);
    expect(mocks.UrlFetchApp.fetch).not.toHaveBeenCalled();
  });

  it('names an unknown webhook in the error', () => {
    const { chat } = setup();
    expect(() => chat.send({ text: 'hi', webhook: 'missing' })).toThrow(
      '[GasChat] unknown webhook "missing"',
    );
  });

  it('accepts default and rejects other names in the single-URL form', () => {
    const { chat, mocks } = setup(WEBHOOK_URL);
    expect(chat.send({ text: 'hi', webhook: 'default' }).ok).toBe(true);
    expect(fetchedUrls(mocks)).toEqual([WEBHOOK_URL]);
    expect(() => chat.send({ text: 'hi', webhook: 'reports' })).toThrow(
      TypeError,
    );
  });
});

describe('per-name resolution', () => {
  it('calls each resolver once and caches per name', () => {
    const defaultResolver = vi.fn(() => WEBHOOK_URL);
    const reportsResolver = vi.fn(() => REPORTS_URL);
    const { chat } = setup({
      default: defaultResolver,
      reports: reportsResolver,
    });
    chat.send('a');
    chat.send('b');
    chat.send({ text: 'c', webhook: 'reports' });
    chat.send({ text: 'd', webhook: 'reports' });
    expect(defaultResolver).toHaveBeenCalledTimes(1);
    expect(reportsResolver).toHaveBeenCalledTimes(1);
  });

  it('does not cache a failure and does not affect other names', () => {
    let reports: string | null = null;
    const { chat, mocks } = setup({
      default: WEBHOOK_URL,
      reports: () => reports,
    });
    const failed = chat.send({ text: 'x', webhook: 'reports' });
    expect(failed.ok).toBe(false);
    expect(chat.send('y').ok).toBe(true);
    reports = REPORTS_URL;
    expect(chat.send({ text: 'z', webhook: 'reports' }).ok).toBe(true);
    expect(fetchedUrls(mocks)).toEqual([WEBHOOK_URL, REPORTS_URL]);
  });

  it('names the webhook in a failing resolver warning', () => {
    const { chat, mocks } = setup({
      default: WEBHOOK_URL,
      reports: () => {
        throw new Error('boom');
      },
    });
    const result = chat.send({ text: 'x', webhook: 'reports' });
    expect(result.ok).toBe(false);
    expect(String(mocks.console.warn.mock.calls[0]?.[0])).toContain(
      'for webhook "reports"',
    );
    expect(result.error).toContain('for webhook "reports"');
  });

  it('names the webhook when it is not configured', () => {
    const { chat } = setup({ default: WEBHOOK_URL, reports: () => null });
    expect(chat.send({ text: 'x', webhook: 'reports' }).error).toBe(
      'Webhook URL is not configured for webhook "reports"',
    );
  });

  it('keeps single-URL messages unchanged', () => {
    const { chat } = setup(() => null);
    expect(chat.send('x').error).toBe('Webhook URL is not configured');
  });
});

describe('redaction across webhooks', () => {
  it('masks another webhook token echoed in an error body', () => {
    const { chat, mocks } = setup({
      default: WEBHOOK_URL,
      reports: REPORTS_URL,
    });
    chat.send('warm default');
    mocks.UrlFetchApp.fetch.mockImplementation(() => ({
      getResponseCode: () => 400,
      getContentText: () => 'bad request: test-token and test-key',
    }));
    const result = chat.send({ text: 'x', webhook: 'reports' });
    expect(result.ok).toBe(false);
    const seen = JSON.stringify(mocks.console.warn.mock.calls);
    expect(seen).not.toContain('test-token');
    expect(seen).not.toContain('test-key');
    const returned = JSON.stringify(result);
    expect(returned).not.toContain('test-token');
    expect(returned).not.toContain('test-key');
  });

  it('masks another webhook token echoed in a thrown error', () => {
    const { chat, mocks } = setup({
      default: WEBHOOK_URL,
      reports: REPORTS_URL,
    });
    chat.send('warm default');
    mocks.UrlFetchApp.fetch.mockImplementation(() => {
      throw new Error('failed for token test-token');
    });
    const result = chat.send({ text: 'x', webhook: 'reports' });
    const seen = JSON.stringify([result, mocks.console.warn.mock.calls]);
    expect(seen).not.toContain('test-token');
  });
});
