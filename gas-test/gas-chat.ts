/** Well-formed webhook URL for a space that does not exist. */
const INVALID_SPACE_URL =
  'https://chat.googleapis.com/v1/spaces/__gt_invalid/messages?key=x&token=y';

/** Script property holding a real webhook URL for the live send. */
const LIVE_URL_PROPERTY = 'GAS_CHAT_TEST_WEBHOOK_URL';

test('invalid url', () => {
  let message = '';
  try {
    new GasChat({ webhookUrl: 'https://example.com/hook' });
  } catch (error) {
    assert(error instanceof TypeError, 'expected a TypeError');
    message = error.message;
  }
  assert(message !== '', 'an invalid URL should throw at construction');
});

test('failed delivery', ({ prefix }) => {
  const chat = new GasChat({ webhookUrl: INVALID_SPACE_URL });
  const error = new Error(`${prefix}failed delivery`);

  const first = chat.notifyError(error);
  assert(!first.ok, 'a nonexistent space should not accept the message');
  assert(
    first.status !== null && first.status >= 400 && first.status < 500,
    `expected a 4xx status, got ${String(first.status)}`,
  );
  assert(!first.throttled, 'the first alert should not be throttled');
  assert(
    !JSON.stringify(first).includes('token=y'),
    'the result should not contain the webhook URL',
  );

  const second = chat.notifyError(error);
  assert(
    !second.throttled,
    'the throttle key should be removed after a failed delivery',
  );
});

info('live send', ({ prefix }) => {
  const url =
    PropertiesService.getScriptProperties().getProperty(LIVE_URL_PROPERTY);
  if (url === null || url === '') {
    return `skipped: ${LIVE_URL_PROPERTY} not set`;
  }

  const chat = new GasChat({ webhookUrl: url, appName: 'gas-chat gas-test' });
  const sent = chat.send(`gas-chat gas-test ${prefix}`);
  const error = new Error(`gas-chat gas-test ${prefix}`);
  const first = chat.notifyError(error);
  const repeat = chat.notifyError(error);

  return `send status ${String(sent.status)}; alert ok ${String(first.ok)} status ${String(first.status)}; repeated alert throttled: ${String(repeat.throttled)}`;
});
