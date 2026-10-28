import { accessSync, constants, existsSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { delimiter, isAbsolute, join } from "node:path";

export function dataHome(): string {
  return process.env.XDG_DATA_HOME && isAbsolute(process.env.XDG_DATA_HOME)
    ? process.env.XDG_DATA_HOME : join(homedir(), ".local/share");
}

export function configHome(): string {
  return process.env.XDG_CONFIG_HOME && isAbsolute(process.env.XDG_CONFIG_HOME)
    ? process.env.XDG_CONFIG_HOME : join(homedir(), ".config");
}

export function executablePaths(name: string, searchPath = process.env.PATH || ""): string[] {
  const candidates = isAbsolute(name) ? [name] : searchPath.split(delimiter).filter(isAbsolute).map((directory) => join(directory, name));
  return [...new Set(candidates)].filter((path) => {
    try { accessSync(path, constants.X_OK); return statSync(path).isFile(); } catch { return false; }
  });
}

export function executable(name: string): string {
  const path = executablePaths(name)[0];
  if (!path) throw new Error(`Install ${name} and make it available on PATH.`);
  return path;
}

const pythonCache = new Map<string, string>();
export function pythonExecutable(preferred = ""): string {
  const key = preferred || process.env.PATH || "";
  const cached = pythonCache.get(key);
  if (cached && existsSync(cached)) return cached;
  for (const path of executablePaths(preferred || "python3")) {
    try {
      execFileSync(path, ["-c", "import gi; from gi.repository import GLib"], { timeout: 3000, stdio: "ignore" });
      pythonCache.set(key, path);
      return path;
    } catch { /* Another Python installation on PATH may provide PyGObject. */ }
  }
  throw new Error("Install Python 3 with PyGObject, or select its interpreter in this extension's preferences.");
}

export const appIdPattern = /^(?:vicinae-webapp-|io\.vicinae\.webapp\.a|(?:[A-Za-z\d_-]+\.)+[A-Za-z\d_-]+\.vicinae\.a)[a-f\d]{24}$/;
export function validProfile(profile: string): boolean {
  return typeof profile === "string" && !!profile && profile !== "." && profile !== ".." && !/[/\\\x00-\x1f\x7f]/.test(profile);
}

export function absolutePath(value: string): boolean {
  return typeof value === "string" && isAbsolute(value) && !/[\x00-\x1f\x7f]/.test(value);
}
