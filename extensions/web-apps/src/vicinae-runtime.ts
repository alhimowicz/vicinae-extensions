import { environment, getPreferenceValues } from "@vicinae/api";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pythonExecutable } from "./platform.ts";
import type { Runtime } from "./runtime.ts";
import { validateRuntime } from "./runtime.ts";

export function getRuntime(): Runtime {
  const { pythonPath } = getPreferenceValues<{ pythonPath?: string }>();
  const directory = join(environment.supportPath, "runtime");
  mkdirSync(directory, { recursive: true });
  for (const file of ["pwa-worker.cjs", "webapp.py"]) {
    const target = join(directory, file);
    const source = readFileSync(join(environment.assetsPath, file));
    if (!existsSync(target) || !readFileSync(target).equals(source)) {
      const temporary = target + "." + randomBytes(6).toString("hex");
      writeFileSync(temporary, source, { flag: "wx", mode: 0o600 });
      renameSync(temporary, target);
    }
  }
  let python: string | undefined;
  try { python = pythonExecutable(pythonPath); } catch { /* Chrome app mode also works without Python. */ }
  return validateRuntime({ node: process.execPath, worker: join(directory, "pwa-worker.cjs"), native: join(directory, "webapp.py"), python });
}
