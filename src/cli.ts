import { checkSession, findSessionCandidates, maskSession, saveSession } from "./session.js";
import { loadConfig } from "./config.js";
import readline from "node:readline";

const HELP = `atcoder-tui session — manage the AtCoder login cookie

usage:
  atcoder-tui session status         show whether a session is configured
  atcoder-tui session import         copy REVEL_SESSION from oj / acc
  atcoder-tui session set [value]    set the cookie (prompts if omitted)
  atcoder-tui session check          verify the configured session against atcoder.jp

The cookie is stored in the app config (see README). To get it manually:
browser DevTools -> Application/Storage -> Cookies -> https://atcoder.jp
-> REVEL_SESSION.`;

function promptHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stderr,
    });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/** Returns true when argv was a CLI command (the TUI should not start). */
export async function runCli(args: string[]): Promise<boolean> {
  if (args[0] !== "session") {
    if (args[0] === "--help" || args[0] === "-h") {
      console.log(HELP);
      return true;
    }
    return false;
  }

  const sub = args[1] ?? "status";
  switch (sub) {
    case "status": {
      const { config, path } = loadConfig();
      if (config.revelSession !== undefined) {
        console.log(`session configured: ${maskSession(config.revelSession)}  [${path}]`);
        console.log("run `atcoder-tui session check` to verify it against atcoder.jp");
      } else {
        console.log(`no session configured  [${path}]`);
        const found = findSessionCandidates();
        if (found.length > 0) {
          console.log(`found importable sessions:`);
          for (const c of found)
            console.log(
              `  - ${c.source}${c.expires !== undefined ? ` (expires ${c.expires})` : ""}`,
            );
          console.log("run `atcoder-tui session import` to use one");
        } else {
          console.log("run `atcoder-tui session set` to paste one (see --help)");
        }
      }
      return true;
    }
    case "import": {
      const found = findSessionCandidates();
      if (found.length === 0) {
        console.error("no oj/acc session found; use `atcoder-tui session set` instead");
        process.exitCode = 1;
        return true;
      }
      const chosen = found[0]!;
      const ok = await checkSession(chosen.value);
      if (!ok) {
        console.error(
          `session from ${chosen.source} is expired/invalid — log in with that tool again, or use \`session set\``,
        );
        process.exitCode = 1;
        return true;
      }
      const file = saveSession(chosen.value);
      console.log(`imported ${maskSession(chosen.value)} from ${chosen.source}`);
      console.log(`verified against atcoder.jp and saved to ${file}`);
      return true;
    }
    case "set": {
      const value = args[2] ?? (await promptHidden("paste REVEL_SESSION value: "));
      if (value === "") {
        console.error("empty value; aborted");
        process.exitCode = 1;
        return true;
      }
      const ok = await checkSession(value);
      if (!ok) {
        console.error(
          "that value does not authenticate against atcoder.jp (expired or truncated?) — not saved",
        );
        process.exitCode = 1;
        return true;
      }
      const file = saveSession(value);
      console.log(`verified and saved ${maskSession(value)} to ${file}`);
      return true;
    }
    case "check": {
      const { config } = loadConfig();
      if (config.revelSession === undefined) {
        console.error("no session configured");
        process.exitCode = 1;
        return true;
      }
      const ok = await checkSession(config.revelSession);
      console.log(ok ? "session is valid" : "session is expired or invalid");
      if (!ok) process.exitCode = 1;
      return true;
    }
    default: {
      console.log(HELP);
      process.exitCode = args[1] === "help" || args[1] === "--help" ? 0 : 1;
      return true;
    }
  }
}
