import { useCallback, useEffect, useRef, useState } from "react";

export interface Loaded<T> {
  data: T;
  stale: boolean;
  fetchedAt: number;
}

export type DataState<T> =
  | { status: "loading" }
  | ({ status: "ready"; pending?: boolean } & Loaded<T>)
  | { status: "error"; error: Error };

/**
 * Async data hook. `fetcher` is re-run when `key` changes; `refresh()`
 * re-runs it with bypassCache=true (the `r` key).
 */
export function useData<T>(key: string, fetcher: (bypassCache: boolean) => Promise<Loaded<T>>) {
  const [state, setState] = useState<DataState<T>>({ status: "loading" });
  const generation = useRef(0);

  const run = useCallback(
    (bypassCache: boolean) => {
      const gen = ++generation.current;
      // Keep showing the previous data while the next load is in flight —
      // blanking the pane between problem flips reads as screen flashing.
      setState((prev) =>
        prev.status === "ready" ? { ...prev, pending: true } : { status: "loading" },
      );
      fetcher(bypassCache).then(
        (loaded) => {
          if (generation.current === gen) setState({ pending: false, status: "ready", ...loaded });
        },
        (error: unknown) => {
          if (generation.current === gen) {
            setState({
              error: error instanceof Error ? error : new Error(String(error)),
              status: "error",
            });
          }
        },
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );

  useEffect(() => {
    run(false);
  }, [run]);

  const refresh = useCallback(() => run(true), [run]);
  return { refresh, state };
}
