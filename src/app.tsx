import { Box, Text, useApp, useInput } from "ink";

export function App() {
  const { exit } = useApp();
  useInput((input) => {
    if (input === "q") {
      exit();
    }
  });
  return (
    <Box borderStyle="round" paddingX={1} flexDirection="column">
      <Text bold>atcoder-tui</Text>
      <Text dimColor>hello from Ink — press q to quit</Text>
    </Box>
  );
}
