import { describe, expect, it, vi } from 'vitest';
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

type Meta = Record<string, unknown> | undefined;

function fakeLogger() {
  const calls: Array<{ level: string; self: unknown; msg: string }> = [];
  const make = (level: string) =>
    function (this: unknown, msg: string) {
      calls.push({ level, self: this, msg });
    };
  const logger: Record<string, unknown> = {
    trace: make('trace'),
    debug: make('debug'),
    info: make('info'),
    warn: make('warn'),
    error: make('error'),
    fatal: make('fatal'),
    flush: vi.fn(function (this: unknown) {
      return this;
    }),
  };
  logger.child = vi.fn(() => fakeLogger().logger);
  return { logger, calls };
}

describe('logger', () => {
  it('alerts for a GasError-shaped error call', () => {
    const { chat, mocks } = setup();
    const { logger, calls } = fakeLogger();
    const log = chat.logger(logger as { error(msg: string): void });
    (log as unknown as { error: (m: string, x: Meta) => void }).error(
      'Unexpected error',
      {
        method: 'POST',
        path: '/orders',
        statusCode: 500,
        code: 'INTERNAL',
        message: 'boom',
        sessionId: 's1',
        stack: 'Error: boom\n    at a (x.gs:1)\n    at b (x.gs:2)',
      },
    );
    expect(calls).toHaveLength(1);
    expect(mocks.UrlFetchApp.fetch).toHaveBeenCalledTimes(1);
    const text = sentText(mocks);
    expect(text).toContain('Unexpected error');
    expect(text).toContain('`boom`');
    expect(text).toContain('• `path`: `/orders`');
    expect(text).toContain('• `statusCode`: `500`');
    expect(text).toContain('• `sessionId`: `s1`');
    expect(text).toContain('at a (x.gs:1)');
    expect(text).not.toContain('• `message`');
    expect(text).not.toContain('• `stack`');
  });

  it('does not alert for warn by default', () => {
    const { chat, mocks } = setup();
    const { logger, calls } = fakeLogger();
    const log = chat.logger(
      logger as { error(msg: string): void },
    ) as never as {
      warn: (m: string, x: Meta) => void;
    };
    log.warn('Request error', { statusCode: 400 });
    expect(calls).toHaveLength(1);
    expect(mocks.UrlFetchApp.fetch).not.toHaveBeenCalled();
  });

  it('keeps this, passes methods through and decorates child', () => {
    const { chat, mocks } = setup();
    const { logger, calls } = fakeLogger();
    const log = chat.logger(
      logger as { error(msg: string): void },
    ) as never as {
      info: (m: string) => void;
      flush: () => unknown;
      fatal: (m: string) => void;
      child: (b: unknown) => { error: (m: string) => void };
    };
    log.info('hi');
    expect(calls[0]?.self).toBe(logger);
    expect(log.flush()).toBe(logger);
    log.fatal('dead');
    expect(calls[1]?.self).toBe(logger);
    expect(mocks.UrlFetchApp.fetch).toHaveBeenCalledTimes(1);
    log.child({ a: 1 }).error('child failed');
    expect(logger.child).toHaveBeenCalledWith({ a: 1 });
    expect(mocks.UrlFetchApp.fetch).toHaveBeenCalledTimes(2);
  });

  it('honours custom levels', () => {
    const { chat, mocks } = setup();
    const { logger } = fakeLogger();
    const log = chat.logger(logger as { error(msg: string): void }, {
      levels: ['warn', 'error'],
    }) as never as { warn: (m: string) => void; fatal: (m: string) => void };
    log.fatal('no');
    expect(mocks.UrlFetchApp.fetch).not.toHaveBeenCalled();
    log.warn('yes');
    expect(mocks.UrlFetchApp.fetch).toHaveBeenCalledTimes(1);
  });

  it('derives message and stack from an error in meta', () => {
    const { chat, mocks } = setup();
    const log = chat.logger(fakeLogger().logger as { error(m: string): void });
    const err = new Error('inner');
    (log as unknown as { error: (m: string, x: Meta) => void }).error(
      'Failed',
      {
        err,
        extra: 1,
      },
    );
    const text = sentText(mocks);
    expect(text).toContain('`inner`');
    expect(text).toContain('• `extra`: `1`');
    expect(text).not.toContain('• `err`');
  });

  it('falls back to msg when meta is absent', () => {
    const { chat, mocks } = setup();
    const log = chat.logger(fakeLogger().logger as { error(m: string): void });
    (log as unknown as { error: (m: string) => void }).error('plain');
    expect(sentText(mocks)).toContain('`plain`');
  });

  it('works with console as the inner logger', () => {
    const { chat, mocks } = setup();
    const log = chat.logger(
      mocks.console as unknown as { error(m: string): void },
    );
    log.error('oops');
    expect(mocks.console.error).toHaveBeenCalledWith('oops');
    expect(mocks.UrlFetchApp.fetch).toHaveBeenCalledTimes(1);
  });

  it('survives an alert failure', () => {
    const { chat, mocks } = setup();
    mocks.UrlFetchApp.fetch.mockImplementation(() => {
      throw new Error('net');
    });
    const { logger, calls } = fakeLogger();
    const log = chat.logger(logger as { error(m: string): void });
    expect(() => log.error('x')).not.toThrow();
    expect(calls).toHaveLength(1);
  });

  it('survives hostile meta', () => {
    const { chat } = setup();
    const { logger, calls } = fakeLogger();
    const log = chat.logger(logger as { error(m: string): void });
    const meta = {
      get message(): string {
        throw new Error('getter');
      },
    };
    expect(() =>
      (log as unknown as { error: (m: string, x: Meta) => void }).error(
        'x',
        meta,
      ),
    ).not.toThrow();
    expect(calls).toHaveLength(1);
  });

  it('forwards every argument and returns the inner result', () => {
    const { chat } = setup();
    const received: unknown[][] = [];
    const inner = {
      error: (...args: unknown[]) => {
        received.push(args);
        return 'result';
      },
    };
    const wrapped = chat.logger(inner) as unknown as {
      error(...args: unknown[]): unknown;
    };
    expect(wrapped.error('m', { a: 1 }, 'extra', 3)).toBe('result');
    expect(received).toEqual([['m', { a: 1 }, 'extra', 3]]);
  });

  it('validates arguments', () => {
    const { chat } = setup();
    expect(() => chat.logger({} as never)).toThrow(TypeError);
    expect(() => chat.logger(null as never)).toThrow(TypeError);
    const target = { error: () => undefined };
    expect(() => chat.logger(target, { levels: [] })).toThrow(TypeError);
    expect(() => chat.logger(target, { levels: [1] })).toThrow(TypeError);
    expect(() => chat.logger(target, { levels: 'error' })).toThrow(TypeError);
  });
});
