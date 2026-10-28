import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Browser } from "../src/browsers.ts";
import type { Runtime } from "../src/runtime.ts";
import { pythonExecutable } from "../src/platform.ts";

export const browser: Browser = { id: "chrome-flatpak", name: "Test Browser", executable: process.execPath,
  userDataDir: join(tmpdir(), "web-apps-test-browser-profile"), flatpakId: "com.google.Chrome" };
export const runtime: Runtime = { node: process.execPath, python: pythonExecutable(),
  worker: fileURLToPath(new URL("../assets/pwa-worker.cjs", import.meta.url)), native: fileURLToPath(new URL("../assets/webapp.py", import.meta.url)) };
