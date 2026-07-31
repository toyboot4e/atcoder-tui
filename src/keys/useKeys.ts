import { useRef } from "react";
import { useInput, type Key } from "ink";

export interface ListNavActions {
  /** Move selection to the given index (already clamped). */
  onMove: (index: number) => void;
  onSelect?: () => void;
  onBack?: () => void;
}

/**
 * Line/page motion shared by lists and scroll panes:
 * vim  — j/k lines, C-d/C-u half page, C-f/C-b full page;
 * emacs — C-n/C-p lines.
 * Returns the delta, or null when the key is not a motion.
 */
function motionDelta(input: string, key: Key, pageSize: number): number | null {
  const half = Math.max(1, Math.floor(pageSize / 2));
  const full = Math.max(1, pageSize);
  if (key.ctrl) {
    if (input === "d") return half;
    if (input === "u") return -half;
    if (input === "f") return full;
    if (input === "b") return -full;
    if (input === "n") return 1;
    if (input === "p") return -1;
    return null;
  }
  if (input === "j" || key.downArrow) return 1;
  if (input === "k" || key.upArrow) return -1;
  return null;
}

/**
 * Vim-style list navigation over `count` rows with selection at `index`:
 * j/k, gg/G, C-d/C-u, C-f/C-b (+ emacs C-n/C-p). Enter/l select; h/esc back.
 * `active: false` detaches the handler (e.g. while a text input has focus).
 */
export function useVimNav(
  active: boolean,
  count: number,
  index: number,
  pageSize: number,
  actions: ListNavActions,
): void {
  const pendingG = useRef(false);

  useInput(
    (input, key) => {
      const clamp = (i: number) => Math.max(0, Math.min(count - 1, i));
      const move = (i: number) => {
        if (count > 0) actions.onMove(clamp(i));
      };

      if (input === "g" && !key.ctrl) {
        if (pendingG.current) {
          pendingG.current = false;
          move(0);
        } else {
          pendingG.current = true;
        }
        return;
      }
      pendingG.current = false;

      const delta = motionDelta(input, key, pageSize);
      if (delta !== null) move(index + delta);
      else if (input === "G") move(count - 1);
      else if (key.return || input === "l" || key.rightArrow) actions.onSelect?.();
      else if (input === "h" || key.leftArrow || key.escape) actions.onBack?.();
    },
    { isActive: active },
  );
}

/**
 * Scroll keys over pre-rendered lines: the shared motions plus g/G home/end.
 * Unhandled keys fall through to `onOther` for pane-specific bindings.
 */
export function useScrollKeys(
  active: boolean,
  lineCount: number,
  height: number,
  scrollTop: number,
  setScrollTop: (next: number) => void,
  clamp: (scrollTop: number, lineCount: number, height: number) => number,
  onOther?: (input: string, key: Key) => void,
): void {
  useInput(
    (input, key) => {
      const delta = motionDelta(input, key, height);
      if (delta !== null) setScrollTop(clamp(scrollTop + delta, lineCount, height));
      else if (input === "G") setScrollTop(clamp(lineCount, lineCount, height));
      else if (input === "g") setScrollTop(0);
      else onOther?.(input, key);
    },
    { isActive: active },
  );
}

export type { Key };
