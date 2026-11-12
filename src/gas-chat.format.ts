/** Replaces backticks so untrusted text cannot close a Chat code span or fence. */
function _gasChatInert(text: string): string {
  return text.split('`').join('ˋ');
}

/** Collapses line breaks to a single space so text stays on one Chat line. */
function _gasChatInline(text: string): string {
  return text.replace(/\r\n|\r|\n/g, ' ');
}

const GAS_CHAT_MARKUP_LOOKALIKES: Record<string, string> = {
  '*': '∗',
  _: 'ˍ',
  '~': '˜',
  '<': '‹',
  '>': '›',
};

/**
 * Cleans a developer or log supplied label: no line breaks, and Chat markup
 * characters are replaced by single-unit lookalikes rather than removed.
 */
function _gasChatLabel(text: string): string {
  return _gasChatInert(_gasChatInline(text)).replace(
    /[*_~<>]/g,
    (char) => GAS_CHAT_MARKUP_LOOKALIKES[char] ?? char,
  );
}

/** Slices to `max` characters without splitting a surrogate pair. */
function _gasChatSlice(text: string, max: number): string {
  let end = Math.max(0, max);
  if (end > 0 && end < text.length) {
    const before = text.charCodeAt(end - 1);
    const after = text.charCodeAt(end);
    if (
      before >= 0xd800 &&
      before <= 0xdbff &&
      after >= 0xdc00 &&
      after <= 0xdfff
    ) {
      end -= 1;
    }
  }
  return text.slice(0, end);
}

/** Cuts `text` to `max` characters, ending with the truncation marker. */
function _gasChatCut(text: string, max: number): string {
  if (text.length <= max) {
    return text;
  }
  if (max < GAS_CHAT_TRUNCATION_MARKER.length) {
    return _gasChatSlice(text, max);
  }
  return (
    _gasChatSlice(text, max - GAS_CHAT_TRUNCATION_MARKER.length) +
    GAS_CHAT_TRUNCATION_MARKER
  );
}

/** Renders a context value as bounded text; never throws. */
function _gasChatStringify(value: unknown): string {
  let text: string;
  if (typeof value === 'string') {
    text = value;
  } else if (value instanceof Error) {
    text = `${value.name}: ${value.message}`;
  } else {
    try {
      const json = JSON.stringify(value);
      text = typeof json === 'string' ? json : String(value);
    } catch (_err) {
      try {
        text = String(value);
      } catch (_err2) {
        text = '[unserialisable]';
      }
    }
  }
  return _gasChatCut(text, GAS_CHAT_MAX_CONTEXT_VALUE_LENGTH);
}

/**
 * Renders an alert as Chat text, never longer than `GAS_CHAT_MAX_TEXT_LENGTH`.
 * Untrusted text appears only inside code spans or a fenced block.
 *
 * @param appName - Developer-supplied application name.
 * @param alert - The alert to render.
 * @param now - Timestamp shown in the alert.
 */
function _gasChatFormatAlert(
  appName: string,
  alert: GasChatAlert,
  now: Date,
): string {
  const limit = GAS_CHAT_MAX_TEXT_LENGTH;
  const name = _gasChatCut(_gasChatLabel(appName), GAS_CHAT_MAX_LABEL_LENGTH);
  const title = _gasChatCut(
    _gasChatLabel(alert.title),
    GAS_CHAT_MAX_LABEL_LENGTH,
  );
  const header = `🚨 *${name}* · ${title}`;
  const timeLine = `• time: \`${now.toISOString()}\``;
  // Room kept for the time line and a possible "…and N more" line.
  const reserve = 1 + timeLine.length + 1 + 30;

  const lines: string[] = [header];
  let used = header.length;

  const messageRoom = limit - used - reserve - 3;
  if (messageRoom > 0 && alert.message !== '') {
    const message = _gasChatCut(
      _gasChatInert(_gasChatInline(alert.message)),
      messageRoom,
    );
    const line = `\`${message}\``;
    lines.push(line);
    used += 1 + line.length;
  }

  const entries = Object.keys(alert.context).filter(
    (key) => alert.context[key] !== undefined,
  );
  let omitted = Math.max(0, entries.length - GAS_CHAT_MAX_CONTEXT_KEYS);
  for (const key of entries.slice(0, GAS_CHAT_MAX_CONTEXT_KEYS)) {
    const k = _gasChatInert(_gasChatInline(key));
    const v = _gasChatInert(
      _gasChatInline(_gasChatStringify(alert.context[key])),
    );
    const line = `• \`${k}\`: \`${v}\``;
    if (used + 1 + line.length + reserve <= limit) {
      lines.push(line);
      used += 1 + line.length;
    } else {
      omitted += 1;
    }
  }
  if (omitted > 0) {
    lines.push(`• …and ${omitted} more`);
  }
  lines.push(timeLine);

  let text = lines.join('\n');
  if (alert.stack !== undefined && alert.stack !== '') {
    // Newline before the fence, plus the opening and closing fences.
    const room = limit - text.length - 1 - 8;
    if (room > GAS_CHAT_TRUNCATION_MARKER.length) {
      const stack = _gasChatCut(_gasChatInert(alert.stack), room);
      text += `\n\`\`\`\n${stack}\n\`\`\``;
    }
  }
  return text;
}

/** Fingerprint input for throttling: title, message and the first stack frame. */
function _gasChatFingerprintSource(alert: GasChatAlert): string {
  const lines = (alert.stack ?? '').split('\n');
  const frame =
    lines.find((line) => /^\s*at /.test(line)) ??
    lines.filter((line) => line.trim() !== '')[1] ??
    '';
  return `${alert.title}|${alert.message}|${frame.trim()}`;
}
