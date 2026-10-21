import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

// Tests receive mocks from their fixtures, never developer keys or personal data.
export function verificationEnvironment(
  inherited = process.env,
  { temporaryParent = os.tmpdir() } = {},
) {
  const allowed = new Set([
    "PATH",
    "SYSTEMROOT",
    "WINDIR",
    "COMSPEC",
    "PATHEXT",
    "HOME",
    "USERPROFILE",
    "HOMEDRIVE",
    "HOMEPATH",
    "APPDATA",
    "LOCALAPPDATA",
    "PLAYWRIGHT_BROWSERS_PATH",
    "TEST_BROWSER_CHANNEL",
    "CI",
  ]);
  fs.mkdirSync(temporaryParent, { recursive: true });
  const parent = fs.realpathSync(temporaryParent);
  const directory = fs.mkdtempSync(path.join(parent, "ace-verification-"));
  const empty = path.join(directory, "empty.env");
  fs.writeFileSync(empty, "");
  const env = Object.fromEntries(
    Object.entries(inherited).filter(([name]) =>
      allowed.has(name.toUpperCase()),
    ),
  );
  Object.assign(env, {
    TEMP: directory,
    TMP: directory,
    TMPDIR: directory,
    DOTENV_CONFIG_PATH: empty,
    DOTENV_CONFIG_QUIET: "true",
    AI_MASTER_KEY: crypto.randomBytes(32).toString("base64"),
    AUTH_EMAIL_VERIFICATION_ENABLED: "0",
    EXPO_OFFLINE: "1",
  });
  return {
    env,
    cleanup() {
      if (!fs.existsSync(directory)) return;
      if (
        fs.lstatSync(directory).isSymbolicLink() ||
        path.dirname(fs.realpathSync(directory)) !== parent ||
        !path.basename(directory).startsWith("ace-verification-")
      )
        throw new Error("验收临时目录已改变，拒绝删除。");
      fs.rmSync(directory, { recursive: true, force: true });
    },
  };
}
