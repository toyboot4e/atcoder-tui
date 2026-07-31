import { Box, Text } from "ink";
import { CONTEXT_LABELS, KEYMAP } from "../keys/keymap.js";
import { useAppState } from "../state/store.js";
import { useTerminalSize } from "./hooks.js";

/** Rendered instead of the current screen while open; any key closes it. */
export function HelpOverlay() {
  const { language } = useAppState();
  const { rows } = useTerminalSize();
  const contexts = ["global", "dashboard", "contest"] as const;

  return (
    <Box
      flexDirection="column"
      height={rows}
      borderStyle="round"
      paddingX={2}
      paddingY={1}
    >
      <Text bold color="cyan">
        atcoder-tui — {language === "ja" ? "キー一覧" : "key bindings"}
      </Text>
      {contexts.map((context) => (
        <Box key={context} flexDirection="column" marginTop={1}>
          <Text bold color="magenta">
            {CONTEXT_LABELS[context][language]}
          </Text>
          {KEYMAP.filter((b) => b.context === context).map((binding) => (
            <Text key={binding.keys}>
              {"  "}
              <Text color="cyan">{binding.keys.padEnd(18)}</Text>
              {language === "ja" ? binding.ja : binding.en}
            </Text>
          ))}
        </Box>
      ))}
      <Box marginTop={1}>
        <Text dimColor>
          {language === "ja"
            ? "何かキーを押すと閉じます"
            : "press any key to close"}
        </Text>
      </Box>
    </Box>
  );
}
