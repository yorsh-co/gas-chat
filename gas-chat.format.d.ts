/** Replaces backticks so untrusted text cannot close a Chat code span or fence. */
declare function _gasChatInert(text: string): string;
/** Collapses line breaks to a single space so text stays on one Chat line. */
declare function _gasChatInline(text: string): string;
declare const GAS_CHAT_MARKUP_LOOKALIKES: Record<string, string>;
/**
 * Cleans a developer or log supplied label: no line breaks, and Chat markup
 * characters are replaced by single-unit lookalikes rather than removed.
 */
declare function _gasChatLabel(text: string): string;
/** Slices to `max` characters without splitting a surrogate pair. */
declare function _gasChatSlice(text: string, max: number): string;
/** Cuts `text` to `max` characters, ending with the truncation marker. */
declare function _gasChatCut(text: string, max: number): string;
/** Renders a context value as bounded text; never throws. */
declare function _gasChatStringify(value: unknown): string;
/**
 * Renders an alert as Chat text, never longer than `GAS_CHAT_MAX_TEXT_LENGTH`.
 * Untrusted text appears only inside code spans or a fenced block.
 *
 * @param appName - Developer-supplied application name.
 * @param alert - The alert to render.
 * @param now - Timestamp shown in the alert.
 */
declare function _gasChatFormatAlert(
  appName: string,
  alert: GasChatAlert,
  now: Date,
): string;
/** Fingerprint input for throttling: title, message and the first stack frame. */
declare function _gasChatFingerprintSource(alert: GasChatAlert): string;
