import { fileURLToPath } from 'node:url';
import { createGasLoader, loadOrderFiles } from 'gasdev/test';
import { createMocks, type Mocks } from './mocks';

/** Constants and values exported by the loaded sources. */
export interface GasChatExports {
  GAS_CHAT_WEBHOOK_PATTERN: RegExp;
  GAS_CHAT_MAX_TEXT_LENGTH: number;
  GAS_CHAT_MAX_CONTEXT_VALUE_LENGTH: number;
  GAS_CHAT_MAX_CONTEXT_KEYS: number;
  GAS_CHAT_DEFAULT_APP_NAME: string;
  GAS_CHAT_DEFAULT_THROTTLE_SECONDS: number;
  GAS_CHAT_MAX_THROTTLE_SECONDS: number;
  GAS_CHAT_DEFAULT_LOG_LEVELS: ReadonlyArray<string>;
  GAS_CHAT_CACHE_PREFIX: string;
  GAS_CHAT_TRUNCATION_MARKER: string;
}

const ROOT = fileURLToPath(new URL('..', import.meta.url));

const load = createGasLoader<GasChatExports>({
  files: loadOrderFiles(ROOT),
  exports: [
    'GAS_CHAT_WEBHOOK_PATTERN',
    'GAS_CHAT_MAX_TEXT_LENGTH',
    'GAS_CHAT_MAX_CONTEXT_VALUE_LENGTH',
    'GAS_CHAT_MAX_CONTEXT_KEYS',
    'GAS_CHAT_DEFAULT_APP_NAME',
    'GAS_CHAT_DEFAULT_THROTTLE_SECONDS',
    'GAS_CHAT_MAX_THROTTLE_SECONDS',
    'GAS_CHAT_DEFAULT_LOG_LEVELS',
    'GAS_CHAT_CACHE_PREFIX',
    'GAS_CHAT_TRUNCATION_MARKER',
  ],
  root: ROOT,
});

/**
 * Evaluates the sources in a fresh context wired to fake Apps Script
 * services, so each call is isolated from every other. `Error` is shared
 * with the host so `instanceof Error` holds across the context boundary.
 */
export function loadGasChat(overrides: Partial<Mocks> = {}): {
  exports: GasChatExports;
  mocks: Mocks;
} {
  const mocks = { ...createMocks(), ...overrides };
  const { UrlFetchApp, CacheService, Utilities, console } = mocks;

  return {
    exports: load({ UrlFetchApp, CacheService, Utilities, console, Error }),
    mocks,
  };
}
