import { createHash } from 'node:crypto';
import { vi } from 'vitest';

/** Webhook URL accepted by `GAS_CHAT_WEBHOOK_PATTERN`; the key and token are fake. */
export const WEBHOOK_URL =
  'https://chat.googleapis.com/v1/spaces/AAAA1234/messages?key=test-key&token=test-token';

/** Fresh set of Apps Script service fakes injected as globals. */
export function createMocks() {
  const store = new Map<string, string>();

  const fetch = vi.fn((url: string, params?: unknown) => {
    void url;
    void params;
    return { getResponseCode: () => 200, getContentText: () => '{}' };
  });

  const cache = {
    get: vi.fn((key: string): string | null => store.get(key) ?? null),
    put: vi.fn((key: string, value: string, seconds?: number): void => {
      void seconds;
      store.set(key, value);
    }),
    remove: vi.fn((key: string): void => {
      store.delete(key);
    }),
  };

  return {
    /** Backing store of the script cache, for inspecting keys. */
    store,
    cache,
    UrlFetchApp: { fetch },
    CacheService: { getScriptCache: vi.fn(() => cache) },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'SHA_256' },
      Charset: { UTF_8: 'UTF_8' },
      computeDigest: vi.fn((algorithm: string, value: string): number[] => {
        void algorithm;
        return Array.from(createHash('sha256').update(value, 'utf8').digest());
      }),
      base64EncodeWebSafe: vi.fn((bytes: number[]): string =>
        Buffer.from(bytes).toString('base64url'),
      ),
    },
    console: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
    },
  };
}

export type Mocks = ReturnType<typeof createMocks>;
