import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { validatePwa } from "./pwa.ts";
import type { PwaInfo } from "./pwa.ts";
import { releaseNativePwa } from "./pwa-native.ts";
import { browserCommand, legacyBrowser, validateBrowser } from "./browsers.ts";
import type { Browser } from "./browsers.ts";
import { absolutePath, appIdPattern, dataHome, validProfile } from "./platform.ts";
import { validateRuntime } from "./runtime.ts";
import type { Runtime } from "./runtime.ts";
export { getProfiles } from "./browsers.ts";
export type { Profile } from "./browsers.ts";

export type AppOptions = { icon?: string; iconSource?: string; frameless?: boolean; preferPwa?: boolean; pwa?: PwaInfo; pwaDesktopId?: string; browser?: Browser; runtime?: Runtime };
export type WebApp = { id: string; name: string; url: string; profile: string } & AppOptions;

const applicationsDirectory = join(dataHome(), "applications");

export function nativeApplicationId(id: string): string {
  if (!appIdPattern.test(id)) throw new Error("Invalid web app launcher.");
  return id.includes(".") ? id : `io.vicinae.webapp.a${id.slice("vicinae-webapp-".length)}`;
}

export function normalizeApp(name: string, input: string, profile: string, options: AppOptions = {}, id?: string): WebApp {
  const browser = options.browser ? validateBrowser(options.browser) : undefined;
  const runtime = options.runtime ? validateRuntime(options.runtime) : undefined;
  id ??= `${options.frameless || (browser && !browser.flatpakId) ? "io.vicinae.webapp.a" : `${browser?.flatpakId || legacyBrowser().flatpakId}.vicinae.a`}${randomBytes(12).toString("hex")}`;
  name = name.trim();
  input = input.trim();
  if (!name || /[\x00-\x1f\x7f]/.test(name)) throw new Error("Enter an app name on one line.");
  if (!input || /[\x00-\x20\x7f]/.test(input)) throw new Error("Enter a website URL without spaces.");
  // Only HTTPS is inferred; explicit schemes must be HTTP or HTTPS.
  const url = new URL(/^[a-z][a-z\d+.-]*:/i.test(input) ? input : `https://${input}`);
  if (!["http:", "https:"].includes(url.protocol) || !url.hostname || url.username || url.password) {
    throw new Error("Use an HTTP or HTTPS website URL without embedded passwords.");
  }
  if (!validProfile(profile)) throw new Error("Choose an existing browser profile.");
  if (!appIdPattern.test(id)) throw new Error("Invalid web app launcher.");
  if (options.icon && !absolutePath(options.icon)) throw new Error("Invalid cached icon path.");
  const preferPwa = options.preferPwa === true && !options.frameless;
  const pwa = preferPwa && options.pwa ? validatePwa(options.pwa, url.href) : undefined;
  const pwaDesktopId = pwa ? options.pwaDesktopId : undefined;
  if (pwaDesktopId && (!/^[a-zA-Z\d_.-]+$/.test(pwaDesktopId) || !pwaDesktopId.includes(`chrome-${pwa!.appId}-`))) throw new Error("Invalid Chrome PWA desktop identity.");
  return { id, name, url: url.href, profile, icon: options.icon, iconSource: options.iconSource?.trim() ?? "", frameless: options.frameless === true, preferPwa, pwa, pwaDesktopId, browser, runtime };
}

function desktopString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t");
}

function execArgument(value: string): string {
  const quoted = `"${value.replace(/[\\"`$]/g, "\\$&").replace(/%/g, "%%")}"`;
  return desktopString(quoted);
}

export function desktopEntry(app: WebApp, directory = applicationsDirectory): string {
  const url = new URL(app.url);
  // Chrome's Wayland app ID is based on host/path and profile, not --class.
  const windowClass = app.frameless ? nativeApplicationId(app.id)
    : (app.pwaDesktopId && app.pwa ? `chrome-${app.pwa.appId}-${app.profile}`
      : `chrome-${url.hostname}_${url.pathname}-${app.profile}`).replace(/[\\/:*?"<>|\x00-\x20]/g, "_");
  const browser = app.browser || legacyBrowser();
  const [program, args] = browserCommand(browser, app.profile, app.pwaDesktopId && app.pwa ? `--app-id=${app.pwa.appId}` : `--app=${app.url}`);
  if (app.frameless && !app.runtime?.python) throw new Error("Borderless windows require Python 3 with GTK 4, WebKitGTK 6 and PyGObject. Open Web Apps after installing them.");
  const command = app.frameless
    ? [app.runtime!.python!, app.runtime!.native, join(directory, `${app.id}.desktop`)]
    : app.preferPwa && app.runtime
      ? [app.runtime.node, app.runtime.worker, "launch", join(directory, `${app.id}.desktop`)]
      : [program, ...args];
  return [
    "[Desktop Entry]",
    "Type=Application",
    `Name=${desktopString(app.name)}`,
    `Comment=${desktopString(`Web app for ${url.hostname}`)}`,
    `Exec=${command.map(execArgument).join(" ")}`,
    `Icon=${desktopString(app.icon || "web-browser")}`,
    "Terminal=false",
    "Categories=Network;",
    `StartupWMClass=${desktopString(windowClass)}`,
    `X-Vicinae-WebApp=${Buffer.from(JSON.stringify(app)).toString("base64")}`,
    "",
  ].join("\n");
}

export function createApp(name: string, url: string, profile: string, directory = applicationsDirectory, options: AppOptions = {}, id?: string): WebApp {
  const app = normalizeApp(name, url, profile, options, id);
  assertUnique(app, directory);
  mkdirSync(directory, { recursive: true });
  try {
    writeFileSync(join(directory, `${app.id}.desktop`), desktopEntry(app, directory), { flag: "wx", mode: 0o644 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new Error("This URL already has a launcher for that profile.");
    throw error;
  }
  return app;
}

export function listApps(directory = applicationsDirectory, onError?: (message: string) => void): WebApp[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory).filter((file) => file.endsWith(".desktop") && appIdPattern.test(file.slice(0, -8))).flatMap((file) => {
    try {
    const entry = readFileSync(join(directory, file), "utf8");
    const metadata = entry.match(/^X-Vicinae-WebApp=(.+)$/m)?.[1];
    if (!metadata) throw new Error(`Missing web app information in ${file}.`);
    const saved = JSON.parse(Buffer.from(metadata, "base64").toString("utf8"));
    const app = normalizeApp(saved.name, saved.url, saved.profile, saved, saved.id);
    if (file !== `${app.id}.desktop`) throw new Error(`Invalid web app information in ${file}.`);
    return [app];
    } catch (error) { onError?.(`${file}: ${String(error)}`); return []; }
  }).sort((a, b) => a.name.localeCompare(b.name));
}

export function removeApp(app: WebApp, directory = applicationsDirectory): void {
  normalizeApp(app.name, app.url, app.profile, app, app.id);
  releaseNativePwa(app, directory);
  unlinkSync(join(directory, `${app.id}.desktop`));
}

function assertUnique(app: WebApp, directory: string, editing = false): void {
  if (listApps(directory).some((item) => (!editing || item.id !== app.id) && item.url === app.url && item.profile === app.profile)) {
    throw new Error("This URL already has a launcher for that profile.");
  }
}

export function updateApp(app: WebApp, name: string, url: string, profile: string, options: AppOptions, directory = applicationsDirectory): WebApp {
  const updated = normalizeApp(name, url, profile, options, app.id);
  if (!updated.frameless && updated.browser?.flatpakId && (app.frameless || updated.browser.flatpakId !== (app.browser || legacyBrowser()).flatpakId) && !updated.id.startsWith(updated.browser.flatpakId + ".")) throw new Error("Create a new launcher for this Flatpak browser so GNOME can identify its windows correctly.");
  const current = listApps(directory).find((item) => item.id === app.id);
  if (!current) throw new Error("This launcher no longer exists.");
  if (JSON.stringify(current) !== JSON.stringify(normalizeApp(app.name, app.url, app.profile, app, app.id))) throw new Error("This launcher changed. Refresh it and try again.");
  assertUnique(updated, directory, true);
  const temporary = join(directory, `.${app.id}-${randomBytes(6).toString("hex")}.tmp`);
  try {
    writeFileSync(temporary, desktopEntry(updated, directory), { flag: "wx", mode: 0o644 });
    if (app.pwaDesktopId && (app.pwaDesktopId !== updated.pwaDesktopId || app.profile !== updated.profile || app.url !== updated.url)) releaseNativePwa(app, directory);
    renameSync(temporary, join(directory, `${app.id}.desktop`));
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary);
  }
  return updated;
}

export function launcherPath(app: WebApp): string { return join(applicationsDirectory, `${app.id}.desktop`); }
