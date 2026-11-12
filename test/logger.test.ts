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
  it('uses an Error first argument as the cause', () => {
    const { chat, mocks } = setup();
    const { logger } = fakeLogger();
    const log = chat.logger(logger as { error(msg: string): void });
    const err = new TypeError('boom');
    err.stack = 'TypeError: boom\n    at a (x.gs:1)';
    (log as unknown as { error: (m: unknown, x?: Meta) => void }).error(err);
    const text = sentText(mocks);
    expect(text.split('\n')[0]).toMatch(/· TypeError$/);
    expect(text).toContain('`boom`');
    expect(text).toContain('at a (x.gs:1)');
  });

  it('keeps the Error stack when meta.error is not an Error', () => {
    const { chat, mocks } = setup();
    const { logger } = fakeLogger();
    const log = chat.logger(logger as { error(msg: string): void });
    const err = new TypeError('boom');
    err.stack = 'TypeError: boom\n    at a (x.gs:1)';
    (log as unknown as { error: (m: unknown, x?: Meta) => void }).error(err, {
      error: 'x',
    });
    const text = sentText(mocks);
    expect(text).toContain('`boom`');
    expect(text).toContain('at a (x.gs:1)');
  });

  it('keeps context when the first argument is an Error', () => {
    const { chat, mocks } = setup();
    const { logger } = fakeLogger();
    const log = chat.logger(logger as { error(msg: string): void });
    (log as unknown as { error: (m: unknown, x?: Meta) => void }).error(
      new TypeError('boom'),
      { orderId: 1 },
    );
    const text = sentText(mocks);
    expect(text).toContain('`boom`');
    expect(text).toContain('• `orderId`: `1`');
    expect(text).not.toMatch(/• `(error|err)`/);
  });

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

  describe('proxy shape', () => {
    it('works on a frozen logger', () => {
      const { chat, mocks } = setup();
      const inner = Object.freeze({ error: vi.fn(), info: vi.fn() });
      const log = chat.logger(inner);
      log.error('x');
      log.info('y');
      expect(inner.error).toHaveBeenCalledWith('x');
      expect(inner.info).toHaveBeenCalledWith('y');
      expect(mocks.UrlFetchApp.fetch).toHaveBeenCalledTimes(1);
    });

    it('preserves instanceof, in, keys and writes', () => {
      const { chat } = setup();
      class Base {
        error = vi.fn();
        info = vi.fn();
      }
      const inner = Object.freeze(new Base());
      const log = chat.logger(inner);
      expect(log instanceof Base).toBe(true);
      expect('error' in log).toBe(true);
      expect(Object.keys(log)).toEqual(Object.keys(inner));
      const loose = new Base() as Base & { foo?: number };
      const looseLog = chat.logger(loose) as typeof loose;
      looseLog.foo = 1;
      expect(loose.foo).toBe(1);
    });

    it('forwards configurable defineProperty to inner', () => {
      const { chat } = setup();
      const inner = { error: vi.fn() } as { error: () => void; x?: number };
      const log = chat.logger(inner);
      Object.defineProperty(log, 'x', {
        value: 1,
        configurable: true,
        enumerable: true,
        writable: true,
      });
      expect(inner.x).toBe(1);
      expect(Object.keys(log)).toEqual(['error', 'x']);
    });

    it('rejects non-configurable defineProperty without mutating inner', () => {
      const { chat } = setup();
      const inner = { error: vi.fn() } as { error: () => void; x?: number };
      const log = chat.logger(inner);
      expect(() =>
        Object.defineProperty(log, 'x', { value: 1, configurable: false }),
      ).toThrow(TypeError);
      expect(inner.x).toBeUndefined();
    });

    it('works on a frozen callable logger', () => {
      const { chat, mocks } = setup();
      const fn = vi.fn();
      const error = vi.fn();
      const inner = Object.freeze(Object.assign(fn, { error }));
      const log = chat.logger(inner);
      log.error('x');
      expect(error).toHaveBeenCalledWith('x');
      expect(mocks.UrlFetchApp.fetch).toHaveBeenCalledTimes(1);
      (log as unknown as (m: string) => void)('hi');
      expect(fn).toHaveBeenCalledWith('hi');
      expect(Object.keys(log)).toEqual(Object.keys(inner));
    });

    it('supports level methods defined as getters', () => {
      const { chat, mocks } = setup();
      const errorFn = vi.fn();
      const inner = {} as { error: () => void };
      Object.defineProperty(inner, 'error', {
        get: () => errorFn,
        enumerable: true,
      });
      const log = chat.logger(inner);
      log.error();
      expect(errorFn).toHaveBeenCalledTimes(1);
      expect(mocks.UrlFetchApp.fetch).toHaveBeenCalledTimes(1);
      expect(Object.getOwnPropertyDescriptor(log, 'error')?.configurable).toBe(
        true,
      );
    });

    it('forwards the prototype of inner', () => {
      const { chat } = setup();
      class Base {
        error = vi.fn();
      }
      expect(Object.getPrototypeOf(chat.logger(new Base()))).toBe(
        Base.prototype,
      );
    });

    it('rejects freeze and seal without breaking the proxy', () => {
      const { chat } = setup();
      const log = chat.logger({ error: vi.fn(), info: vi.fn() });
      expect(() => Object.freeze(log)).toThrow(TypeError);
      expect(() => Object.seal(log)).toThrow(TypeError);
      log.info('x');
      expect(Object.keys(log)).toEqual(['error', 'info']);
    });

    it('forwards delete to inner', () => {
      const { chat } = setup();
      const inner = { error: vi.fn(), x: 1 } as {
        error: () => void;
        x?: number;
      };
      const log = chat.logger(inner);
      delete log.x;
      expect('x' in inner).toBe(false);
    });

    it('reports own descriptors as configurable with the wrapped value', () => {
      const { chat, mocks } = setup();
      const inner = Object.freeze({ error: vi.fn() });
      const log = chat.logger(inner);
      const descriptor = Object.getOwnPropertyDescriptor(log, 'error');
      expect(descriptor?.configurable).toBe(true);
      expect(descriptor?.value).toBe(log.error);
      descriptor?.value('x');
      expect(mocks.UrlFetchApp.fetch).toHaveBeenCalledTimes(1);
    });

    it('snapshots levels at creation', () => {
      const { chat, mocks } = setup();
      const levels = ['error'];
      const log = chat.logger({ error: vi.fn(), warn: vi.fn() }, { levels });
      levels.push('warn');
      log.warn('x');
      expect(mocks.UrlFetchApp.fetch).not.toHaveBeenCalled();
    });

    it('passes the levels snapshot to child loggers', () => {
      const { chat, mocks } = setup();
      const levels = ['error'];
      const log = chat.logger(fakeLogger().logger as never, { levels }) as {
        child: (b: unknown) => { warn: (m: string) => void };
      };
      levels.push('warn');
      log.child({}).warn('x');
      expect(mocks.UrlFetchApp.fetch).not.toHaveBeenCalled();
    });

    it('returns stable method identity', () => {
      const { chat } = setup();
      const log = chat.logger({ error: vi.fn(), info: vi.fn() });
      expect(log.info).toBe(log.info);
      expect(log.error).toBe(log.error);
    });

    it('reflects a reassigned inner method', () => {
      const { chat } = setup();
      const first = vi.fn();
      const second = vi.fn();
      const inner = { error: vi.fn(), info: first };
      const log = chat.logger(inner);
      log.info('a');
      inner.info = second;
      log.info('b');
      expect(first).toHaveBeenCalledTimes(1);
      expect(second).toHaveBeenCalledTimes(1);
    });

    it('alerts on a frozen class-instance inner', () => {
      const { chat, mocks } = setup();
      class Base {
        error = vi.fn();
      }
      const log = chat.logger(Object.freeze(new Base()));
      log.error('x');
      expect(mocks.UrlFetchApp.fetch).toHaveBeenCalledTimes(1);
    });

    it('alerts on a callable inner and still reaches it when called', () => {
      const { chat, mocks } = setup();
      const fn = Object.assign(
        vi.fn(() => 42),
        { error: vi.fn() },
      );
      const log = chat.logger(fn as never) as unknown as (() => number) & {
        error(msg: string): void;
      };
      log.error('x');
      expect(mocks.UrlFetchApp.fetch).toHaveBeenCalledTimes(1);
      expect(log()).toBe(42);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('can call a callable inner through the proxy', () => {
      const { chat } = setup();
      const fn = Object.assign(
        vi.fn(() => 42),
        { error: vi.fn() },
      );
      const log = chat.logger(fn as never) as unknown as () => number;
      expect(log()).toBe(42);
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });
});

describe('logger named webhook', () => {
  const OPS_URL = WEBHOOK_URL.replace(/spaces\/[^/]+/, 'spaces/OPS');
  const named = () =>
    setup({ webhookUrl: { default: WEBHOOK_URL, ops: OPS_URL } });
  const fetchedUrl = (mocks: ReturnType<typeof setup>['mocks'], call = 0) =>
    String(mocks.UrlFetchApp.fetch.mock.calls[call]?.[0]);

  it('alerts the named webhook and its child inherits it', () => {
    const { chat, mocks } = named();
    const { logger } = fakeLogger();
    const wrapped = chat.logger(logger as { error: () => void }, {
      webhook: 'ops',
    }) as unknown as {
      error: (msg: string) => void;
      child: () => { error: (msg: string) => void };
    };
    wrapped.error('first');
    wrapped.child().error('second');
    expect(fetchedUrl(mocks, 0)).toBe(OPS_URL);
    expect(fetchedUrl(mocks, 1)).toBe(OPS_URL);
  });

  it('throws TypeError at creation for an unknown name', () => {
    const { chat } = named();
    const { logger } = fakeLogger();
    expect(() => chat.logger(logger, { webhook: 'nope' })).toThrow(TypeError);
  });
});
