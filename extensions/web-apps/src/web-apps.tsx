import { Action, ActionPanel, closeMainWindow, Icon, List, open, sendDesktopNotification, showToast, Toast } from "@vicinae/api";
import { useEffect, useState } from "react";
import CreateWebApp from "./create-web-app";
import { listApps, removeApp, updateApp } from "./apps";
import type { WebApp } from "./apps";
import { syncInstalledPwa, tryInstallPwa } from "./pwa-install";
import { legacyBrowser } from "./browsers";
import { getRuntime } from "./vicinae-runtime";

export default function WebApps() {
  const [apps, setApps] = useState<WebApp[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  function reload() {
    try {
      const runtime = getRuntime();
      const errors: string[] = [];
      setApps(listApps(undefined, (error) => errors.push(error)).map((app) => {
        try {
          if ((!app.frameless && !app.browser) || JSON.stringify(app.runtime) !== JSON.stringify(runtime)) app = updateApp(app, app.name, app.url, app.profile, { ...app, runtime, browser: app.browser || (!app.frameless ? legacyBrowser() : undefined) });
          return syncInstalledPwa(app);
        } catch (error) { errors.push(`${app.name}: ${String(error)}`); return app; }
      }));
      if (errors.length) void showToast({ title: "Some launchers need attention", message: errors.join("\n"), style: Toast.Style.Failure });
    } catch (error) {
      void showToast({ title: "Could not load web apps", message: String(error), style: Toast.Style.Failure });
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(reload, []);

  async function openApp(app: WebApp) {
    try {
      await open(app.url, app.id);
      await closeMainWindow();
    } catch (error) {
      await showToast({ title: "Could not open web app", message: String(error), style: Toast.Style.Failure });
    }
  }

  async function remove(app: WebApp) {
    try {
      removeApp(app);
      reload();
      await showToast({ title: `${app.name} launcher removed`, message: app.pwaDesktopId ? "The browser's own shortcut is restored. Uninstall the PWA from the browser's app settings. Website data is kept." : "Website sign-ins and data are kept.", style: Toast.Style.Success });
    } catch (error) {
      await showToast({ title: "Could not remove web app", message: String(error), style: Toast.Style.Failure });
    }
  }

  async function installPwa(app: WebApp) {
    const toast = await showToast({ title: "Checking PWA availability…", style: Toast.Style.Animated });
    try {
      const result = await tryInstallPwa(app);
      reload();
      toast.style = Toast.Style.Success;
      toast.title = result.status === "installed" ? "PWA ready" : result.status === "pending" ? "Finish installation in your browser" : "Using app mode";
      toast.message = result.message;
      if (result.status === "pending") {
        await sendDesktopNotification({ title: "Finish Web App Installation", body: result.message });
        await closeMainWindow();
      }
    } catch (error) {
      toast.style = Toast.Style.Failure;
      toast.title = "Could not install PWA";
      toast.message = String(error);
    }
  }

  const create = <Action.Push title="Create Web App" icon={Icon.Plus} target={<CreateWebApp onSaved={reload} />} shortcut={{ modifiers: ["ctrl"], key: "n" }} />;

  return (
    <List isLoading={isLoading} navigationTitle="Web Apps" searchBarPlaceholder="Search your web apps...">
      <List.EmptyView title="No web apps yet" description="Create a launcher from a website URL." icon={Icon.Globe01} actions={<ActionPanel>{create}</ActionPanel>} />
      {apps.map((app) => (
        <List.Item
          key={app.id}
          title={app.name}
          subtitle={app.url}
          icon={app.icon || Icon.Globe01}
          accessories={[{ text: app.frameless ? "Borderless" : `${app.browser?.name || "Browser"} · ${app.profile} · ${app.pwaDesktopId ? "PWA" : "App mode"}` }]}
          actions={
            <ActionPanel>
              <Action title="Open Web App" icon={Icon.Globe01} onAction={() => void openApp(app)} />
              <Action.Push title="Edit Web App" icon={Icon.Pencil} target={<CreateWebApp app={app} onSaved={reload} />} shortcut={{ modifiers: ["ctrl"], key: "e" }} />
              {!app.frameless && <Action title={app.pwaDesktopId ? "Check PWA Installation" : "Install as PWA"} icon={Icon.Globe01} onAction={() => void installPwa(app)} />}
              {create}
              <Action.CopyToClipboard title="Copy URL" content={app.url} />
              <Action title="Refresh" icon={Icon.ArrowClockwise} onAction={reload} shortcut={{ modifiers: ["ctrl"], key: "r" }} />
              <Action title="Remove Launcher" icon={Icon.Trash} style="destructive" onAction={() => void remove(app)} />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
