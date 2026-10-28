import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { absolutePath, configHome, dataHome, executable, executablePaths, validProfile } from "./platform.ts";

export type Browser = { id: string; name: string; executable: string; userDataDir: string; flatpakId?: string };
export type Profile = { directory: string; name: string };
export type BrowserPreferences = { browserExecutable?: string; browserDataDirectory?: string };

const families = [
  { id: "chrome", name: "Google Chrome", commands: ["google-chrome-stable", "google-chrome"], config: "google-chrome", flatpak: "com.google.Chrome" },
  { id: "chromium", name: "Chromium", commands: ["chromium", "chromium-browser"], config: "chromium", flatpak: "org.chromium.Chromium" },
  { id: "brave", name: "Brave", commands: ["brave-browser", "brave"], config: "BraveSoftware/Brave-Browser", flatpak: "com.brave.Browser" },
  { id: "edge", name: "Microsoft Edge", commands: ["microsoft-edge-stable", "microsoft-edge"], config: "microsoft-edge", flatpak: "com.microsoft.Edge" },
];

export function validateBrowser(browser: Browser): Browser {
  if (!browser || !/^[a-z\d-]+$/.test(browser.id) || typeof browser.name !== "string" || !browser.name.trim()
    || !absolutePath(browser.executable) || !absolutePath(browser.userDataDir)
    || (browser.flatpakId && !/^[A-Za-z\d_-]+(?:\.[A-Za-z\d_-]+){2,}$/.test(browser.flatpakId))) {
    throw new Error("Invalid browser configuration. Choose an installed Chromium-based browser.");
  }
  return { id: browser.id, name: browser.name, executable: browser.executable, userDataDir: browser.userDataDir, flatpakId: browser.flatpakId };
}

export function discoverBrowsers(preferences: BrowserPreferences = {}): Browser[] {
  const browsers: Browser[] = [];
  const flatpak = executablePaths("flatpak")[0];
  let installed: string[] = [];
  if (flatpak) {
    try { installed = execFileSync(flatpak, ["list", "--app", "--columns=application"], { encoding: "utf8", timeout: 5000 }).trim().split(/\r?\n/); } catch { /* Native browsers remain available without Flatpak. */ }
  }
  for (const family of families) {
    const native = family.commands.flatMap((command) => executablePaths(command))[0];
    if (native) browsers.push({ id: family.id, name: family.name, executable: native, userDataDir: join(configHome(), family.config) });
    if (flatpak && installed.includes(family.flatpak)) browsers.push({ id: family.id + "-flatpak", name: family.name + " (Flatpak)", executable: flatpak,
      userDataDir: join(homedir(), ".var/app", family.flatpak, "config", family.config), flatpakId: family.flatpak });
  }
  if (preferences.browserExecutable || preferences.browserDataDirectory) {
    if (!preferences.browserExecutable || !preferences.browserDataDirectory) throw new Error("Set both the custom browser executable and user-data directory in extension preferences.");
    const expand = (path: string) => path.startsWith("~/") ? join(homedir(), path.slice(2)) : path;
    browsers.unshift(validateBrowser({ id: "custom", name: "Custom Chromium Browser", executable: executable(expand(preferences.browserExecutable)), userDataDir: expand(preferences.browserDataDirectory) }));
  }
  return browsers;
}

// Launchers from the original release always used Flatpak Chrome.
export function legacyBrowser(): Browser {
  return { id: "chrome-flatpak", name: "Google Chrome (Flatpak)", executable: executablePaths("flatpak")[0] || "flatpak",
    userDataDir: join(homedir(), ".var/app", "com.google.Chrome", "config", "google-chrome"), flatpakId: "com.google.Chrome" };
}

export function getProfiles(browser = legacyBrowser()): { profiles: Profile[]; selected: string } {
  let data;
  try { data = JSON.parse(readFileSync(join(browser.userDataDir, "Local State"), "utf8")); }
  catch { throw new Error(`Open ${browser.name} and create a profile first. For a custom location, set its user-data directory in extension preferences.`); }
  const profiles = Object.entries(data.profile?.info_cache ?? {}).filter(([directory]) => validProfile(directory)).map(([directory, value]) => ({
    directory, name: typeof (value as { name?: unknown })?.name === "string" ? (value as { name: string }).name || directory : directory,
  }));
  if (!profiles.length && existsSync(join(browser.userDataDir, "Default", "Preferences"))) profiles.push({ directory: "Default", name: "Default" });
  if (!profiles.length) throw new Error(`Open ${browser.name} and create a profile first.`);
  return { profiles, selected: profiles.find((profile) => profile.directory === data.profile?.last_used)?.directory ?? profiles[0].directory };
}

export function browserCommand(browser: Browser, profile: string, mode: string): [string, string[]] {
  if (!validProfile(profile)) throw new Error("Choose an existing browser profile.");
  const args = [`--user-data-dir=${browser.userDataDir}`, `--profile-directory=${profile}`, mode];
  return [browser.executable, browser.flatpakId ? ["run", browser.flatpakId, ...args] : args];
}

export function flatpakAccessProblem(browser: Browser): string | undefined {
  if (!browser.flatpakId) return undefined;
  const folders = [join(dataHome(), "applications"), join(dataHome(), "icons")];
  folders.forEach((folder) => mkdirSync(folder, { recursive: true }));
  try {
    const rows = execFileSync(browser.executable, ["ps", "--columns=instance,application"], { encoding: "utf8", timeout: 5000 }).trim().split(/\r?\n/);
    const instances = rows.map((row) => row.trim().split(/\s+/)).filter(([id, application]) => /^\d+$/.test(id) && application === browser.flatpakId);
    if (!instances.length) {
      try { execFileSync(browser.executable, ["run", "--command=sh", browser.flatpakId, "-c", 'test -w "$1" && test -w "$2"', "web-apps-access-check", ...folders], { timeout: 5000, stdio: "ignore" }); }
      catch { return `Allow ${folders.join(" and ")} for ${browser.name} in Flatseal, then retry PWA installation.`; }
    }
    for (const [instance] of instances) {
      try {
        execFileSync(browser.executable, ["enter", instance, "sh", "-c", 'test -w "$1" && test -w "$2"', "web-apps-access-check", ...folders], { timeout: 5000, stdio: "ignore" });
      } catch {
        return `Exit ${browser.name} and ALL its web-app windows. In Flatseal allow ${folders.join(" and ")}, then reopen the browser and retry. Running sessions keep their old permissions.`;
      }
    }
  } catch { return "Could not check Flatpak access. Check that Flatpak works, and allow the applications and icons folders in Flatseal before installing a PWA."; }
  return undefined;
}
