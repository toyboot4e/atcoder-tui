import { Box, Text } from "ink";

/**
 * Ink has no native scrolling; this renders a window into pre-rendered lines.
 * The parent owns scrollTop (clamped with clampScroll) — this stays a pure view.
 *
 * IMPORTANT: total rendered rows never exceed `height`. Overflowing the parent
 * box makes Ink clip it, and Ink's clipping drops leading full-width (CJK)
 * characters — so the percent indicator row is budgeted inside `height` via
 * viewportSize().
 */
export function ScrollView({ lines, height, scrollTop }: { lines: string[]; height: number; scrollTop: number }) {
  const view = viewportSize(lines.length, height);
  const visible = lines.slice(scrollTop, scrollTop + view);
  const showPercent = lines.length > view;
  const percent = showPercent ? Math.round((scrollTop / Math.max(1, lines.length - view)) * 100) : 0;

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box flexDirection="column" flexGrow={1}>
        {visible.map((line, i) => (
          <Text key={scrollTop + i} wrap="truncate-end">
            {line === "" ? " " : line}
          </Text>
        ))}
      </Box>
      {showPercent && (
        <Box justifyContent="flex-end">
          <Text dimColor>{percent}%</Text>
        </Box>
      )}
    </Box>
  );
}

/** Lines visible at once: one row is reserved for the percent indicator when scrolling. */
export function viewportSize(lineCount: number, height: number): number {
  return lineCount <= height ? height : Math.max(1, height - 1);
}

export function clampScroll(scrollTop: number, lineCount: number, height: number): number {
  return Math.max(0, Math.min(scrollTop, lineCount - viewportSize(lineCount, height)));
}
