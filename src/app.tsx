import { useEffect, useRef, useState } from "react";
import { useApp, useInput } from "ink";
import { autoImportSession } from "./autoSession.js";
import { loadState, saveState } from "./state/persist.js";
import type { Services } from "./state/services.js";
import { ServicesProvider, useServices } from "./state/services.js";
import { StoreProvider, useAppDispatch, useAppState, useCurrentRoute } from "./state/store.js";
import { ContestView } from "./ui/ContestView.js";
import { Dashboard } from "./ui/Dashboard.js";
import { SubmissionView } from "./ui/SubmissionView.js";
import { HelpOverlay } from "./ui/HelpOverlay.js";

export function App({ services }: { services: Services }) {
  // Relaunch where the previous session quit, in the language last used.
  const [persisted] = useState(() => loadState());
  return (
    <ServicesProvider services={services}>
      <StoreProvider
        language={persisted?.language ?? services.config.language}
        initialRoutes={persisted?.routes}
      >
        <Root />
      </StoreProvider>
    </ServicesProvider>
  );
}

function Root() {
  const { exit } = useApp();
  const { inputActive, routes, language } = useAppState();
  const dispatch = useAppDispatch();
  const route = useCurrentRoute();
  const services = useServices();
  const [showHelp, setShowHelp] = useState(false);

  // Persist screen stack + language so the next launch restores both.
  // Skip the mount-time run: writing what we just loaded is pointless, and
  // a stray second instance must never clobber the file at boot.
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    saveState({ routes, language });
  }, [routes, language]);

  // Convenience: adopt a stored oj/acc session when none is configured.
  // The result (or expiry) lands in the status bar as a notice.
  useEffect(() => {
    void autoImportSession({
      client: services.client,
      notices: services.notices,
      configuredSession: services.config.revelSession,
    }).then(() => {
      services.config.revelSession = services.client.getCookie() ?? services.config.revelSession;
    });
  }, [services]);

  const openHelp = () => {
    setShowHelp(true);
    // Reuse the input lock so screen handlers idle under the overlay.
    dispatch({ type: "setInputActive", value: true });
  };
  const closeHelp = () => {
    setShowHelp(false);
    dispatch({ type: "setInputActive", value: false });
  };

  useInput(
    (input) => {
      if (input === "q") {
        // q closes the current screen; only the root screen quits the app.
        if (routes.length > 1) dispatch({ type: "pop" });
        else exit();
      } else if (input === "t") dispatch({ type: "toggleLanguage" });
      else if (input === "?") openHelp();
    },
    { isActive: !inputActive },
  );

  useInput(() => closeHelp(), { isActive: showHelp });

  if (showHelp) return <HelpOverlay />;

  switch (route.screen) {
    case "dashboard":
      return <Dashboard />;
    case "contest":
      return (
        <ContestView
          key={route.contestId}
          contestId={route.contestId}
          startsAt={route.startsAt}
          endsAt={route.endsAt}
        />
      );
    case "submission":
      return (
        <SubmissionView
          key={route.submissionId}
          contestId={route.contestId}
          submissionId={route.submissionId}
          summary={route.summary}
        />
      );
  }
}
