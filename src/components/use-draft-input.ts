import { useEffect, useState } from "react";
import { matchKeyboardEvent } from "../lib/keyboard";
import { clamp } from "../utils/math";

type UseDraftInputOptions = {
  value: number;
  onCommit: (value: number) => void;
  min?: number;
  max?: number;
  /** Arrow keys step by this, and by ten times this with Shift. */
  step?: number;
  format?: (value: number) => string;
};

/**
 * Commits only on Enter or blur. Arrow keys step the committed value, which is
 * the main way to nudge layout.
 */
export function useDraftInput({
  value,
  onCommit,
  min = -Infinity,
  max = Infinity,
  step = 1,
  format = String,
}: UseDraftInputOptions) {
  const [draft, setDraft] = useState(format(value));

  useEffect(() => {
    setDraft(format(value));
  }, [format, value]);

  const commit = () => {
    // Leave the value alone when the draft was not edited, so a rounded
    // display never rewrites a more precise value on blur.
    if (draft === format(value)) {
      return;
    }
    const n = Number.parseFloat(draft);
    if (!Number.isNaN(n)) {
      onCommit(clamp(n, min, max));
    }
    // Show the committed value again, which an accepted commit then replaces
    // with the new one, so a rejected or clamped-away draft does not linger.
    setDraft(format(value));
  };

  const reset = () => setDraft(format(value));

  const stepBy = (delta: number) => onCommit(clamp(value + delta, min, max));

  return {
    draft,
    commit,
    reset,
    props: {
      value: draft,
      onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
        setDraft(e.target.value),
      onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (matchKeyboardEvent(e, "Enter")) {
          // Blurring commits, so committing here too would commit twice.
          e.currentTarget.blur();
        } else if (matchKeyboardEvent(e, "Escape")) {
          reset();
          e.currentTarget.blur();
        } else if (matchKeyboardEvent(e, "ArrowUp")) {
          e.preventDefault();
          stepBy(step);
        } else if (matchKeyboardEvent(e, "Shift+ArrowUp")) {
          e.preventDefault();
          stepBy(step * 10);
        } else if (matchKeyboardEvent(e, "ArrowDown")) {
          e.preventDefault();
          stepBy(-step);
        } else if (matchKeyboardEvent(e, "Shift+ArrowDown")) {
          e.preventDefault();
          stepBy(-step * 10);
        }
      },
      onBlur: commit,
    },
  };
}
