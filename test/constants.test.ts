import { describe, expect, it } from 'vitest';
import { loadGasChat } from './harness';
import { WEBHOOK_URL } from './mocks';

describe('GAS_CHAT_WEBHOOK_PATTERN', () => {
  const { GAS_CHAT_WEBHOOK_PATTERN: pattern } = loadGasChat().exports;

  it('accepts a well-formed webhook URL', () => {
    expect(pattern.test(WEBHOOK_URL)).toBe(true);
    expect(
      pattern.test(
        'https://chat.googleapis.com/v1/spaces/AAAA/messages?token=t&key=k',
      ),
    ).toBe(true);
  });

  it.each([
    [
      'another host',
      'https://evil.example.com/v1/spaces/AAAA/messages?key=k&token=t',
    ],
    [
      'a host that only starts like Chat',
      'https://chat.googleapis.com.evil.example/v1/spaces/AAAA/messages?key=k&token=t',
    ],
    [
      'http',
      'http://chat.googleapis.com/v1/spaces/AAAA/messages?key=k&token=t',
    ],
    [
      'a missing token',
      'https://chat.googleapis.com/v1/spaces/AAAA/messages?key=k',
    ],
    [
      'a missing key',
      'https://chat.googleapis.com/v1/spaces/AAAA/messages?token=t',
    ],
    [
      'a different path',
      'https://chat.googleapis.com/v1/spaces/AAAA/members?key=k&token=t',
    ],
    ['an empty string', ''],
    ['a fragment', `${WEBHOOK_URL}#frag`],
    ['an existing threadKey', `${WEBHOOK_URL}&threadKey=x`],
    [
      'an existing messageReplyOption',
      `messageReplyOption=x&${WEBHOOK_URL.split('?')[1]}`.replace(
        /^/,
        WEBHOOK_URL.split('?')[0] + '?',
      ),
    ],
    [
      'whitespace in the token',
      'https://chat.googleapis.com/v1/spaces/AAAA/messages?key=k&token=t t',
    ],
    ['a newline after the URL', `${WEBHOOK_URL}\nx`],
    [
      'key and token only after a fragment',
      'https://chat.googleapis.com/v1/spaces/AAAA/messages?a=b#key=k&token=t',
    ],
    [
      'a userinfo host',
      'https://chat.googleapis.com@evil.example/v1/spaces/AAAA/messages?key=k&token=t',
    ],
    [
      'a suffixed host',
      'https://chat.googleapis.com.evil.com/v1/spaces/AAAA/messages?key=k&token=t',
    ],
    [
      'a slash in the space id',
      'https://chat.googleapis.com/v1/spaces/A/B/messages?key=k&token=t',
    ],
  ])('rejects %s', (_label, url) => {
    expect(pattern.test(url)).toBe(false);
  });
});

describe('GAS_CHAT_MAX_LABEL_LENGTH', () => {
  it('caps app names and titles at 200 characters', () => {
    expect(loadGasChat().exports.GAS_CHAT_MAX_LABEL_LENGTH).toBe(200);
  });
});

describe('GAS_CHAT_WEBHOOK_NAME_PATTERN', () => {
  const { GAS_CHAT_WEBHOOK_NAME_PATTERN: pattern, GAS_CHAT_DEFAULT_WEBHOOK } =
    loadGasChat().exports;

  it('names the default webhook', () => {
    expect(GAS_CHAT_DEFAULT_WEBHOOK).toBe('default');
  });

  it.each(['default', 'reports', 'ops-2', 'a_b', 'A'])('accepts %s', (name) => {
    expect(pattern.test(name)).toBe(true);
  });

  it.each(['', '1ops', '-ops', 'a b', 'a.b', 'a/b', 'ops\n'])(
    'rejects %j',
    (name) => {
      expect(pattern.test(name)).toBe(false);
    },
  );
});
