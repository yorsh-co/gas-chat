import { fileURLToPath } from 'node:url';
import { createGasLoader, loadOrderFiles } from 'gasdev/test';
import { createMocks, type Mocks } from './mocks';

/** Constants and values exported by the loaded sources. */
export interface GasChatExports {
  GAS_CHAT_WEBHOOK_PATTERN: RegExp;
  GAS_CHAT_DEFAULT_WEBHOOK: string;
  GAS_CHAT_WEBHOOK_NAME_PATTERN: RegExp;
  GAS_CHAT_MAX_TEXT_LENGTH: number;
  GAS_CHAT_MAX_CONTEXT_VALUE_LENGTH: number;
  GAS_CHAT_MAX_CONTEXT_KEYS: number;
  GAS_CHAT_MAX_LABEL_LENGTH: number;
  GAS_CHAT_DEFAULT_APP_NAME: string;
  GAS_CHAT_DEFAULT_THROTTLE_SECONDS: number;
  GAS_CHAT_MAX_THROTTLE_SECONDS: number;
  GAS_CHAT_DEFAULT_LOG_LEVELS: ReadonlyArray<string>;
  GAS_CHAT_CACHE_PREFIX: string;
  GAS_CHAT_TRUNCATION_MARKER: string;
  _gasChatFormatAlert(appName: string, alert: unknown, now: Date): string;
  _gasChatFingerprintSource(alert: unknown): string;
  GasChat: new (options: Record<string, unknown>) => GasChatInstance;
}

/** Loose test-side view of the `GasChat` instance. */
export interface GasChatInstance {
  send(message: unknown): {
    ok: boolean;
    status: number | null;
    throttled: boolean;
    error?: string;
  };
  notifyError(
    err: unknown,
    context?: Record<string, unknown>,
    options?: { webhook?: unknown },
  ): {
    ok: boolean;
    status: number | null;
    throttled: boolean;
    error?: string;
  };
  run<T>(source: string, fn: () => T, options?: { webhook?: unknown }): T;
  logger<T extends object>(
    inner: T,
    options?: { levels?: unknown; webhook?: unknown },
  ): T;
}

const ROOT = fileURLToPath(new URL('..', import.meta.url));

const load = createGasLoader<GasChatExports>({
  files: loadOrderFiles(ROOT),
  exports: [
    'GAS_CHAT_WEBHOOK_PATTERN',
    'GAS_CHAT_DEFAULT_WEBHOOK',
    'GAS_CHAT_WEBHOOK_NAME_PATTERN',
    'GAS_CHAT_MAX_TEXT_LENGTH',
    'GAS_CHAT_MAX_CONTEXT_VALUE_LENGTH',
    'GAS_CHAT_MAX_CONTEXT_KEYS',
    'GAS_CHAT_MAX_LABEL_LENGTH',
    'GAS_CHAT_DEFAULT_APP_NAME',
    'GAS_CHAT_DEFAULT_THROTTLE_SECONDS',
    'GAS_CHAT_MAX_THROTTLE_SECONDS',
    'GAS_CHAT_DEFAULT_LOG_LEVELS',
    'GAS_CHAT_CACHE_PREFIX',
    'GAS_CHAT_TRUNCATION_MARKER',
    '_gasChatFormatAlert',
    '_gasChatFingerprintSource',
    'GasChat',
  ],
  root: ROOT,
});

/**
 * Evaluates the sources in a fresh context wired to fake Apps Script
 * services, so each call is isolated from every other. `Error` and `TypeError` are shared
 * with the host so `instanceof Error` holds across the context boundary.
 */
export function loadGasChat(overrides: Partial<Mocks> = {}): {
  exports: GasChatExports;
  mocks: Mocks;
} {
  const mocks = { ...createMocks(), ...overrides };
  const { UrlFetchApp, CacheService, Utilities, console } = mocks;

  return {
    exports: load({
      UrlFetchApp,
      CacheService,
      Utilities,
      console,
      Error,
      TypeError,
    }),
    mocks,
  };
}
