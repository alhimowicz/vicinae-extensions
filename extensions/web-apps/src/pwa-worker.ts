import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { setTimeout } from "node:timers/promises";
import { basename, dirname, isAbsolute } from "node:path";
import { launcherPath, listApps } from "./apps.ts";
import { syncInstalledPwa } from "./pwa-install.ts";
import { appIdPattern, executablePaths } from "./platform.ts";
import { browserCommand, legacyBrowser } from "./browsers.ts";

async function main() {
  const [mode, target = ""] = process.argv.slice(2);
  const id = isAbsolute(target) ? basename(target, ".desktop") : target;
  const directory = isAbsolute(target) ? dirname(target) : undefined;
  if (!["launch", "watch"].includes(mode) || !appIdPattern.test(id)) throw new Error("Invalid PWA launcher request.");
  if (mode === "launch") {
    const saved = listApps(directory).find((app) => app.id === id);
    if (!saved) throw new Error("Web app launcher no longer exists.");
    let app = saved;
    try { app = syncInstalledPwa(saved, directory); } catch { app = { ...saved, pwaDesktopId: undefined }; }
    if (app.frameless && !app.runtime?.python) throw new Error("Open Web Apps to refresh the borderless launcher and its Python interpreter.");
    const [program, args] = app.frameless
      ? [app.runtime!.python!, [app.runtime!.native, isAbsolute(target) ? target : launcherPath(app)]] as [string, string[]]
      : browserCommand(app.browser || legacyBrowser(), app.profile, app.pwaDesktopId && app.pwa ? `--app-id=${app.pwa.appId}` : `--app=${app.url}`);
    const chrome = spawn(program, args, { stdio: "ignore", detached: true });
    await once(chrome, "spawn");
    chrome.unref();
    return;
  }
  const initial = listApps(directory).find((app) => app.id === id);
  if (!initial?.pwa) return;
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    const app = listApps(directory).find((entry) => entry.id === id);
    if (!app?.preferPwa || app.frameless || app.url !== initial.url || app.profile !== initial.profile || app.pwa?.appId !== initial.pwa.appId) return;
    try { if (syncInstalledPwa(app, directory).pwaDesktopId) return; } catch { /* Retry while the browser is still writing its shortcut. */ }
    await setTimeout(1000);
  }
}

main().catch((error) => {
  console.error(String(error));
  const notifier = process.argv[2] === "launch" && executablePaths("notify-send")[0];
  if (notifier) spawnSync(notifier, ["Web app could not start", String(error)], { timeout: 2000, stdio: "ignore" });
  process.exitCode = 1;
});
