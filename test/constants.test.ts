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
  ])('rejects %s', (_label, url) => {
    expect(pattern.test(url)).toBe(false);
  });
});
