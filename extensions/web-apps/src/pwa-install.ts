import { spawn } from "node:child_process";
import { once } from "node:events";
import { launcherPath, updateApp } from "./apps.ts";
import type { WebApp } from "./apps.ts";
import { discoverPwa } from "./pwa.ts";
import { findNativePwa, hideNativePwa, releaseNativePwa } from "./pwa-native.ts";
import { browserCommand, flatpakAccessProblem, legacyBrowser } from "./browsers.ts";

export type InstallResult = { app: WebApp; status: "installed" | "pending" | "fallback"; message: string };

export function syncInstalledPwa(app: WebApp, directory?: string): WebApp {
  if (app.frameless || !app.preferPwa || !app.pwa) return app;
  const native = findNativePwa(app, directory);
  if (!native) {
    return app.pwaDesktopId ? updateApp(app, app.name, app.url, app.profile, { ...app, pwaDesktopId: undefined }, directory) : app;
  }
  hideNativePwa(app, native, directory);
  if (app.pwaDesktopId === native.desktopId) return app;
  try {
    return updateApp(app, app.name, app.url, app.profile, { ...app, pwaDesktopId: native.desktopId }, directory);
  } catch (error) {
    if (!native.owner) releaseNativePwa({ ...app, pwaDesktopId: native.desktopId }, directory);
    throw error;
  }
}

export async function tryInstallPwa(app: WebApp): Promise<InstallResult> {
  if (app.frameless) return { app, status: "fallback", message: "PWA installation uses browser mode and its selected profile." };
  if (!app.runtime?.python) return { app, status: "fallback", message: "PWA detection needs Python 3 with PyGObject. Install it, then reopen Web Apps. App mode remains available." };
  const browser = app.browser || legacyBrowser();
  let info;
  try {
    info = app.pwa ?? await discoverPwa(app.url, app.runtime.python);
  } catch {
    return { app, status: "fallback", message: "Could not check PWA availability. The app-mode launcher is ready." };
  }
  if (!info) return { app, status: "fallback", message: "No installable manifest found. The app-mode launcher is ready." };
  let saved = app;
  try {
    saved = updateApp(app, app.name, app.url, app.profile, { ...app, preferPwa: true, pwa: info });
    saved = syncInstalledPwa(saved);
  } catch {
    return { app: saved, status: "fallback", message: "Could not adopt the browser's PWA registration. Your launcher is saved; app mode remains available." };
  }
  if (saved.pwaDesktopId) return { app: saved, status: "installed", message: "Using the PWA installed in this browser profile." };
  const problem = flatpakAccessProblem(browser);
  if (problem) return { app: saved, status: "fallback", message: problem };
  try {
    const watcher = spawn(app.runtime.node, [app.runtime.worker, "watch", launcherPath(saved)], { detached: true, stdio: "ignore" });
    await once(watcher, "spawn");
    watcher.unref();
    const [program, args] = browserCommand(browser, saved.profile, "--new-window");
    const chrome = spawn(program, [...args, saved.url], { detached: true, stdio: "ignore" });
    await once(chrome, "spawn");
    chrome.unref();
  } catch {
    return { app: saved, status: "fallback", message: "Could not open the browser's installer page. Check that the selected browser is installed. The app-mode launcher is ready." };
  }
  return { app: saved, status: "pending", message: `In ${browser.name}, choose Install in the address bar or browser menu, then confirm. If already installed, re-create its shortcut from the browser's apps page. App mode stays available until installation finishes.` };
}
