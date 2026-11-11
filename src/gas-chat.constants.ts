/* Accepts only Chat incoming webhook URLs, so alert data cannot reach another host */
const GAS_CHAT_WEBHOOK_PATTERN =
  /^https:\/\/chat\.googleapis\.com\/v1\/spaces\/[^/?#]+\/messages\?(?=(?:[^#]*&)?key=[^&#]+)(?=(?:[^#]*&)?token=[^&#]+)/;

/* Chat's limit for the `text` field, in characters */
const GAS_CHAT_MAX_TEXT_LENGTH = 4096;

/* Longest rendered context value in an alert, in characters */
const GAS_CHAT_MAX_CONTEXT_VALUE_LENGTH = 500;

/* Most context entries rendered in an alert */
const GAS_CHAT_MAX_CONTEXT_KEYS = 20;

/* Alert header name when `appName` is not provided */
const GAS_CHAT_DEFAULT_APP_NAME = 'Apps Script';

/* Seconds identical alerts are suppressed when `throttleSeconds` is not provided */
const GAS_CHAT_DEFAULT_THROTTLE_SECONDS = 300;

/* Longest throttle window CacheService can hold, in seconds */
const GAS_CHAT_MAX_THROTTLE_SECONDS = 21600;

/* Logger levels that raise an alert when `levels` is not provided */
const GAS_CHAT_DEFAULT_LOG_LEVELS: ReadonlyArray<string> = Object.freeze([
  'error',
  'fatal',
]);

/* Prefix for throttle keys in the script cache */
const GAS_CHAT_CACHE_PREFIX = 'gas-chat:';

/* Appended where text was cut to fit a limit */
const GAS_CHAT_TRUNCATION_MARKER = '…[truncated]';
