import { environment, getPreferenceValues, LocalStorage } from "@vicinae/api";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { mergeSnapshot, parseSnapshot, type Snapshot } from "./events.ts";

const execute = promisify(execFile);

export async function selectedCalendars(): Promise<string[] | undefined> {
  const stored = await LocalStorage.getItem<string>("calendar-ids");
  if (stored === undefined) return undefined;
  const ids: unknown = JSON.parse(stored);
  if (!Array.isArray(ids) || !ids.every((id) => typeof id === "string")) throw new Error("Invalid calendar selection. Run Select Calendars again.");
  return ids;
}

function selectionKey(ids?: string[]): string {
  return JSON.stringify(ids ? [...ids].sort() : null);
}

export async function cachedSnapshot(ids?: string[]): Promise<Snapshot | undefined> {
  try {
    const value = JSON.parse(await readFile(join(environment.supportPath, "agenda.json"), "utf8"));
    if (value.selectionKey === selectionKey(ids)) return parseSnapshot(value);
  } catch { /* A missing or old cache is replaced by the next successful read. */ }
}

export async function readCalendars(ids?: string[], metadataOnly = false): Promise<Snapshot> {
  const { pythonPath } = getPreferenceValues<{ pythonPath?: string }>();
  const args = [join(environment.assetsPath, "calendar.py")];
  if (ids !== undefined) args.push("--calendars", JSON.stringify(ids));
  if (metadataOnly) args.push("--list");
  let stdout: string;
  try {
    ({ stdout } = await execute(pythonPath || "/usr/bin/python3", args, { timeout: 20_000, maxBuffer: 12 * 1024 * 1024, encoding: "utf8" }));
  } catch (error) {
    const failure = error as Error & { stderr?: string; killed?: boolean };
    if (failure.killed) throw new Error("Calendar service timed out. Check your calendars in GNOME Calendar and try again.");
    if (/No module named|Namespace .* not available|Typelib file/.test(failure.stderr || "")) {
      throw new Error("Install Python PyGObject and the ECal 2.0 / EDataServer 1.2 bindings. See the Calendar README for your distribution.");
    }
    throw new Error(failure.stderr?.trim() || failure.message);
  }
  const fresh = parseSnapshot(JSON.parse(stdout));
  if (metadataOnly) return fresh;
  const merged = mergeSnapshot(fresh, await cachedSnapshot(ids));
  await mkdir(environment.supportPath, { recursive: true, mode: 0o700 });
  const target = join(environment.supportPath, "agenda.json");
  const temporary = target + "." + randomUUID();
  await writeFile(temporary, JSON.stringify({ ...merged, selectionKey: selectionKey(ids) }), { mode: 0o600, flag: "wx" });
  await rename(temporary, target);
  return merged;
}
