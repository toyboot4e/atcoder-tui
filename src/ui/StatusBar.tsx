import { useEffect, useState } from "react";
import { Box, Text } from "ink";
import { useServices } from "../state/services.js";
import { useAppState } from "../state/store.js";
import type { LoadStats } from "../net/load.js";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

/**
 * Always-visible bottom bar. The right side is the load meter: what this
 * session and this day have actually cost AtCoder, so politeness is
 * observable rather than claimed.
 */
export function StatusBar({ hints }: { hints: string }) {
  const { meter, warnings } = useServices();
  const { language } = useAppState();
  const [stats, setStats] = useState<LoadStats>(() => meter.stats());

  useEffect(() => {
    setStats(meter.stats());
    return meter.subscribe(() => setStats(meter.stats()));
  }, [meter]);

  const net =
    `net ${stats.sessionRequests}req/${formatBytes(stats.sessionBytes)}` +
    ` · today ${stats.todayRequests}req/${formatBytes(stats.todayBytes)}` +
    (stats.cacheHits > 0 ? ` · cache ${(stats.cacheHitRatio * 100).toFixed(0)}%` : "");
  const activity = stats.inFlight ? ` ⇄${stats.queued > 1 ? `×${stats.queued}` : ""}` : "";

  return (
    <Box flexDirection="column">
      {warnings.map((warning) => (
        <Text key={warning} color="yellow">
          {warning}
        </Text>
      ))}
      <Box justifyContent="space-between">
        <Text>
          <Text color="cyan" bold>
            [{language}]
          </Text>
          <Text dimColor> {hints}</Text>
        </Text>
        <Text dimColor>
          {net}
          <Text color="yellow">{activity}</Text>
        </Text>
      </Box>
    </Box>
  );
}
