import { Box, Text, useApp, useInput } from "ink";
import type { Services } from "./state/services.js";
import { ServicesProvider } from "./state/services.js";
import { StoreProvider, useAppDispatch, useAppState, useCurrentRoute } from "./state/store.js";
import { Dashboard } from "./ui/Dashboard.js";
import { StatusBar } from "./ui/StatusBar.js";
import { t } from "./ui/strings.js";

export function App({ services }: { services: Services }) {
  return (
    <ServicesProvider services={services}>
      <StoreProvider language={services.config.language}>
        <Root />
      </StoreProvider>
    </ServicesProvider>
  );
}

function Root() {
  const { exit } = useApp();
  const { inputActive } = useAppState();
  const dispatch = useAppDispatch();
  const route = useCurrentRoute();

  useInput(
    (input) => {
      if (input === "q") exit();
      else if (input === "t") dispatch({ type: "toggleLanguage" });
    },
    { isActive: !inputActive },
  );

  switch (route.screen) {
    case "dashboard":
      return <Dashboard />;
    case "contest":
      return <ContestStub contestId={route.contestId} />;
  }
}

/** Placeholder until milestone 6 lands the real contest view. */
function ContestStub({ contestId }: { contestId: string }) {
  const { language } = useAppState();
  const dispatch = useAppDispatch();
  useInput(
    (input, key) => {
      if (input === "h" || key.escape || (key.ctrl && input === "o")) dispatch({ type: "pop" });
    },
    { isActive: true },
  );
  return (
    <Box flexDirection="column">
      <Box borderStyle="round" paddingX={1} flexGrow={1}>
        <Text>
          contest: <Text bold color="cyan">{contestId}</Text> (view coming soon)
        </Text>
      </Box>
      <StatusBar hints={`h ${t("back", language)} · q ${t("quit", language)}`} />
    </Box>
  );
}
