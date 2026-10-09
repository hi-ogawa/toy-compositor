import { useState } from "react";
import { matchKeyboardEvent } from "../lib/keyboard";
import { clamp } from "../utils/math";

type UseDraftInputOptions = {
  value: number;
  onCommit: (value: number) => void;
  min?: number;
  max?: number;
  /** Arrow keys step by this, and by ten times this with Shift. */
  step?: number;
};

/**
 * Commits only on Enter or blur. Escape reverts the typed text, and a second
 * Escape leaves the field. Arrow keys step the committed value, which is the
 * main way to nudge layout.
 *
 * The draft exists only while the user edits, so the field otherwise shows the
 * value itself, including after a commit that leaves it unchanged.
 */
export function useDraftInput({
  value,
  onCommit,
  min = -Infinity,
  max = Infinity,
  step = 1,
}: UseDraftInputOptions) {
  const [draft, setDraft] = useState<string>();

  const commit = () => {
    if (draft === undefined) {
      return;
    }
    setDraft(undefined);
    const n = Number.parseFloat(draft);
    if (!Number.isNaN(n)) {
      onCommit(clamp(n, min, max));
    }
  };

  const stepBy = (delta: number) => {
    setDraft(undefined);
    onCommit(clamp(value + delta, min, max));
  };

  return {
    props: {
      value: draft ?? String(value),
      onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
        setDraft(e.target.value),
      onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (matchKeyboardEvent(e, "Enter")) {
          // Leave the field, which commits the draft.
          e.currentTarget.blur();
        } else if (matchKeyboardEvent(e, "Escape")) {
          if (draft === undefined) {
            e.currentTarget.blur();
          } else {
            setDraft(undefined);
          }
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
