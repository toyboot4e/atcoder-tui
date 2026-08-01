import os from "node:os";
import { configFilePath } from "./config.js";
import { LoginRequiredError, type AtcoderClient } from "./net/http.js";
import { type Notices } from "./state/notices.js";
import { findSessionCandidates, saveSession } from "./session.js";

export interface AutoImportDeps {
  client: AtcoderClient;
  notices: Notices;
  /** Already-configured session, if any — auto-import is a no-op then. */
  configuredSession: string | undefined;
  home?: string;
  configPath?: string;
}

/** Short label like "oj" / "acc" out of "oj (/home/x/.../cookie.jar)". */
const sourceName = (source: string): string => source.split(" ")[0] ?? source;

/**
 * Startup convenience: when no session is configured, look for one in the
 * cookie stores of oj/acc, verify it against atcoder.jp (through the
 * rate-limited client), adopt it on success and tell the user either way.
 * Never throws — a viewer must boot fine offline.
 */
export async function autoImportSession(deps: AutoImportDeps): Promise<void> {
  if (deps.configuredSession !== undefined) return;
  const candidates = findSessionCandidates(deps.home ?? os.homedir());
  if (candidates.length === 0) return; // config hints already cover the "nothing at all" case

  const previous = deps.client.getCookie();
  for (const candidate of candidates) {
    deps.client.setCookie(candidate.value);
    try {
      // /settings is login-gated: 200 = session works, 302→/login = expired.
      await deps.client.fetch("/settings", {
        ttl: 0,
        bypassCache: true,
        noStore: true,
      });
      saveSession(candidate.value, deps.configPath ?? configFilePath());
      deps.notices.push(
        `session: imported from ${sourceName(candidate.source)} ✓ (saved to config)`,
      );
      return;
    } catch (error) {
      deps.client.setCookie(previous);
      if (!(error instanceof LoginRequiredError)) {
        // Offline or server trouble — do not claim the stored session is bad.
        return;
      }
    }
  }
  deps.notices.push(
    `session: found ${candidates.length === 1 ? sourceName(candidates[0]!.source) : `${candidates.length} stored sessions`} but expired — run \`atcoder-tui session set\``,
  );
}
