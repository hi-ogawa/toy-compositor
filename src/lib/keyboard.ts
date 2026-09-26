type KeyboardLikeEvent = {
  code: string;
  shiftKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
};

/**
 * Matches a key with optional `Ctrl+`, `Alt+`, and `Shift+` modifiers, such as
 * `Ctrl+S` or `Shift+ArrowUp`. `Ctrl` matches either Control or Command.
 * Letters match physical keys, and other keys are matched by their `code`.
 * Unlisted modifiers must be released.
 */
export function matchKeyboardEvent(
  event: KeyboardLikeEvent,
  shortcut: string,
): boolean {
  const tokens = shortcut.split("+");
  const key = tokens.pop()!;
  const code = /^[A-Z]$/.test(key) ? `Key${key}` : key;
  return (
    event.code === code &&
    tokens.includes("Ctrl") === (event.ctrlKey || event.metaKey) &&
    tokens.includes("Alt") === event.altKey &&
    tokens.includes("Shift") === event.shiftKey
  );
}
