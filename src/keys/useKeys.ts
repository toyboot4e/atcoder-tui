import { useRef } from "react";
import { useInput, type Key } from "ink";

export interface ListNavActions {
  /** Move selection to the given index (already clamped). */
  onMove: (index: number) => void;
  onSelect?: () => void;
  onBack?: () => void;
}

/**
 * Vim-style list/scroll navigation over `count` rows with selection at
 * `index`: j/k, gg/G, ctrl-d/ctrl-u. Enter/l select; h/esc back.
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

      if (input === "g") {
        if (pendingG.current) {
          pendingG.current = false;
          move(0);
        } else {
          pendingG.current = true;
        }
        return;
      }
      pendingG.current = false;

      if (input === "j" || key.downArrow) move(index + 1);
      else if (input === "k" || key.upArrow) move(index - 1);
      else if (input === "G") move(count - 1);
      else if (key.ctrl && input === "d") move(index + Math.max(1, Math.floor(pageSize / 2)));
      else if (key.ctrl && input === "u") move(index - Math.max(1, Math.floor(pageSize / 2)));
      else if (key.return || input === "l" || key.rightArrow) actions.onSelect?.();
      else if (input === "h" || key.leftArrow || key.escape) actions.onBack?.();
    },
    { isActive: active },
  );
}

export type { Key };
