import { describe, expect, it } from 'vitest';
import { loadGasChat } from './harness';

const NOW = new Date('2026-01-02T03:04:05.000Z');
const { exports } = loadGasChat();
const format = (alert: Record<string, unknown>, appName = 'Orders'): string =>
  exports._gasChatFormatAlert(
    appName,
    { title: 'Unexpected error', message: 'boom', context: {}, ...alert },
    NOW,
  );

describe('_gasChatFormatAlert', () => {
  it('renders header, message, context, time and stack', () => {
    expect(
      format({
        context: { source: 'dailySync', skipped: undefined, n: 3 },
        stack: 'Error: boom\n    at f (a.gs:1)',
      }),
    ).toBe(
      [
        '🚨 *Orders* · Unexpected error',
        '`boom`',
        '• `source`: `dailySync`',
        '• `n`: `3`',
        '• time: `2026-01-02T03:04:05.000Z`',
        '```',
        'Error: boom\n    at f (a.gs:1)',
        '```',
      ].join('\n'),
    );
  });

  it('neutralises backticks in the title', () => {
    const text = format({ title: 'a`b' });
    expect(text.split('\n')[0]).toBe('🚨 *Orders* · aˋb');
  });

  it('omits the message line when the message is empty', () => {
    const lines = format({ message: '' }).split('\n');
    expect(lines).not.toContain('``');
    expect(lines[1]).toMatch(/^• time:/);
  });

  it('replaces asterisks in developer-supplied names with lookalikes', () => {
    expect(format({ title: 'a*b' }, '*App*').split('\n')[0]).toBe(
      '🚨 *∗App∗* · a∗b',
    );
  });

  it('substitutes lookalikes for markup instead of dropping it', () => {
    const header = format({ title: 'a*b~c<d>' }, 'my_app').split('\n')[0] ?? '';
    expect(header).toContain('myˍapp');
    expect(header).toContain('a∗b˜c‹d›');
    expect(header.replace('🚨 *myˍapp* · ', '')).not.toMatch(/[*_~<>]/);
  });

  it('keeps mentions and backticks inside code spans', () => {
    const text = format({
      message: 'hi <users/all> `x` ```',
      context: { 'k`ey': '<users/all> `v`' },
      stack: '<users/all>\n```\nat `f`',
    });
    expect(text).not.toContain('`x`');
    const outside = text.slice(0, text.indexOf('\n```\n'));
    for (const line of outside.split('\n')) {
      if (line.includes('<users/all>')) {
        expect(line).toMatch(/`[^`]*<users\/all>[^`]*`$/);
      }
    }
    const fenceStart = text.indexOf('\n```\n');
    const fenceEnd = text.lastIndexOf('\n```');
    expect(text.slice(fenceStart + 5, fenceEnd)).not.toContain('`');
    expect(text.endsWith('\n```')).toBe(true);
  });

  it('stays within the limit with huge inputs and closes the fence', () => {
    const max = exports.GAS_CHAT_MAX_TEXT_LENGTH;
    const huge = 'x'.repeat(100000);
    const context: Record<string, unknown> = {};
    for (let i = 0; i < 50; i += 1) {
      context[`k${i}`] = huge;
    }
    const text = format({ message: huge, stack: huge, context });
    expect(text.length).toBeLessThanOrEqual(max);
    expect(text.split('```').length % 2).toBe(1);
    expect(text).toContain('…and ');
    expect(text).toContain('time: `2026-01-02T03:04:05.000Z`');
  });

  it('omits the stack when it does not fit', () => {
    const texts = Array.from({ length: 200 }, (_v, n) => {
      const context = Object.fromEntries(
        Array.from({ length: 20 }, (_k, i) => [`k${i}`, 'v'.repeat(300 + n)]),
      );
      return format({ context, stack: 'at f' });
    });
    for (const text of texts) {
      expect(text.length).toBeLessThanOrEqual(exports.GAS_CHAT_MAX_TEXT_LENGTH);
    }
    expect(texts.some((text) => !text.includes('```'))).toBe(true);
  });

  it('replaces markup and line breaks in title and appName', () => {
    const text = format({ title: 'a_b~c<d>e\r\nf\ng*h' }, '*A_p~p<>\n*');
    expect(text.split('\n')[0]).toBe('🚨 *∗Aˍp˜p‹› ∗* · aˍb˜c‹d›e f g∗h');
  });

  it('keeps one line per inline span', () => {
    const text = format({
      message: 'a\r\nb\nc',
      context: { 'k\ney': 'v\r\n1' },
    });
    expect(text).toContain('`a b c`');
    expect(text).toContain('• `k ey`: `v 1`');
  });

  it('never exposes <users/all> outside code', () => {
    const evil = '<users/all>';
    const text = format({
      title: `t ${evil}\n${evil}`,
      message: `m\n${evil}\n\`${evil}\``,
      context: { [evil]: `${evil}\n\`${evil}`, [`k\n${evil}`]: 1 },
      stack: `${evil}\n\`\`\`\n${evil}`,
    });
    const stripped = text
      .replace(/```[\s\S]*?```/g, '')
      .replace(/`[^`\n]*`/g, '');
    expect(stripped).not.toContain(evil);
    expect(stripped).not.toContain('<users');
  });

  it('stays bounded and balanced for any header length', () => {
    const max = exports.GAS_CHAT_MAX_TEXT_LENGTH;
    const cap = exports.GAS_CHAT_MAX_LABEL_LENGTH;
    // "🚨 *" + name + "* · " + title
    const overhead = '🚨 *'.length + '* · '.length;
    for (let n = cap - 5; n <= cap + 5; n += 1) {
      for (const text of [
        format({ title: 'T'.repeat(n), stack: 'at f\nat g' }),
        format({ title: 't', stack: 'at f\nat g' }, 'A'.repeat(n)),
        format({ title: 'T'.repeat(n), stack: 'at f\nat g' }, 'A'.repeat(n)),
      ]) {
        expect(text.length).toBeLessThanOrEqual(max);
        expect(text.split('```').length % 2).toBe(1);
        expect(text.split('\n')[0]?.length).toBeLessThanOrEqual(
          2 * cap + overhead,
        );
      }
    }
  });

  it('caps an oversized app name and title and keeps the time line', () => {
    const cap = exports.GAS_CHAT_MAX_LABEL_LENGTH;
    const marker = exports.GAS_CHAT_TRUNCATION_MARKER;
    const label = (c: string): string => c.repeat(cap - marker.length) + marker;
    const lines = format({ title: 'T'.repeat(5000) }, 'A'.repeat(5000)).split(
      '\n',
    );
    expect(lines[0]).toBe(`🚨 *${label('A')}* · ${label('T')}`);
    expect(lines).toContain('• time: `2026-01-02T03:04:05.000Z`');
  });

  it('does not split surrogate pairs when cutting', () => {
    const text = format({ title: '😀'.repeat(3000) });
    expect(text.length).toBeLessThanOrEqual(exports.GAS_CHAT_MAX_TEXT_LENGTH);
    expect(text).not.toMatch(/[\ud800-\udbff](?![\udc00-\udfff])/);
    expect(text).not.toMatch(/(?<![\ud800-\udbff])[\udc00-\udfff]/);
  });

  it('survives values whose String() throws', () => {
    const bad = Object.create(null) as Record<string, unknown>;
    bad.toJSON = () => {
      throw new Error('x');
    };
    expect(format({ context: { bad } })).toContain('[unserialisable]');
  });

  it('keeps the body when the title is oversized', () => {
    const text = format({
      title: 'T'.repeat(5000),
      message: 'm',
      context: { a: 1 },
      stack: 'Error: m\n    at f (a.gs:1)',
    });
    const lines = text.split('\n');
    expect(lines[0]).toContain(exports.GAS_CHAT_TRUNCATION_MARKER);
    expect(text).toContain('`m`');
    expect(text).toContain('• `a`: `1`');
    expect(text).toContain('• time: `2026-01-02T03:04:05.000Z`');
    expect(text).toContain('```\nError: m\n    at f (a.gs:1)\n```');
    expect(text.length).toBeLessThanOrEqual(exports.GAS_CHAT_MAX_TEXT_LENGTH);
  });

  it('caps context keys and reports the rest', () => {
    const context: Record<string, unknown> = {};
    for (let i = 0; i < 23; i += 1) {
      context[`k${i}`] = i;
    }
    const text = format({ context });
    expect(text).toContain('• `k19`: `19`');
    expect(text).not.toContain('`k20`');
    expect(text).toContain('• …and 3 more');
  });

  it('survives cycles, errors and unserialisable values', () => {
    const cyc: Record<string, unknown> = {};
    cyc.self = cyc;
    const text = format({
      context: { cyc, err: new TypeError('bad'), fn: () => 1, obj: { a: 1 } },
    });
    expect(text).toContain('• `cyc`: `[object Object]`');
    expect(text).toContain('• `err`: `TypeError: bad`');
    expect(text).toContain('• `obj`: `{"a":1}`');
    expect(text).toContain('• `fn`: `');
  });

  it('truncates long context values', () => {
    const text = format({ context: { v: 'y'.repeat(900) } });
    expect(text).toContain(exports.GAS_CHAT_TRUNCATION_MARKER);
    expect(text).not.toContain('y'.repeat(501));
  });
});

describe('_gasChatFingerprintSource', () => {
  const fp = (alert: Record<string, unknown>) =>
    exports._gasChatFingerprintSource({ context: {}, ...alert });

  it('uses the first stack line after the first', () => {
    expect(
      fp({
        title: 't',
        message: 'm',
        stack: 'Error: m\n\n   at f (a.gs:1)\n   at g',
      }),
    ).toBe('t|m|at f (a.gs:1)');
  });

  it('prefers the first at-frame over message lines', () => {
    expect(
      fp({
        title: 't',
        message: 'm',
        stack: 'Error: m\nsecond line\n    at f (a.gs:1)',
      }),
    ).toBe('t|m|at f (a.gs:1)');
  });

  it('falls back to the second non-empty line without at-frames', () => {
    expect(fp({ title: 't', message: 'm', stack: 'Error: m\nframe@x' })).toBe(
      't|m|frame@x',
    );
  });

  it('is empty-framed without a stack', () => {
    expect(fp({ title: 't', message: 'm' })).toBe('t|m|');
  });
});
