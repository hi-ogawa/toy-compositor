import { useEffect, useState } from "react";
import { matchKeyboardEvent } from "../lib/keyboard";

type UseDraftInputOptions = {
  value: number;
  onCommit: (value: number) => void;
  min?: number;
  max?: number;
  /** Arrow keys step by this, and by ten times this with Shift. */
  step?: number;
  format?: (value: number) => string;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/**
 * Hook for numeric inputs that only commit on Enter or blur.
 * Arrow keys step the committed value, which is the main way to nudge layout.
 *
 * @example
 * ```tsx
 * const xInput = useDraftInput({ value: box.x, onCommit: setX, step: 1 });
 *
 * <input type="text" inputMode="decimal" {...xInput.props} />
 * ```
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
    } else {
      setDraft(format(value)); // Reset on invalid input
    }
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
          commit();
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
