import { Action, ActionPanel, closeMainWindow, Form, getPreferenceValues, sendDesktopNotification, showToast, Toast, useNavigation } from "@vicinae/api";
import { existsSync } from "node:fs";
import { useEffect, useState } from "react";
import { createApp, getProfiles, normalizeApp, updateApp } from "./apps";
import type { Profile, WebApp } from "./apps";
import { inferIcon, installIcon, resolveIcon } from "./icons";
import { tryInstallPwa } from "./pwa-install";
import { discoverBrowsers, legacyBrowser } from "./browsers";
import type { Browser, BrowserPreferences } from "./browsers";
import { getRuntime } from "./vicinae-runtime";
import { execFileSync } from "node:child_process";

export default function WebAppForm({ app, onSaved }: { app?: WebApp; onSaved?: () => void }) {
  const [name, setName] = useState(app?.name ?? "");
  const [url, setUrl] = useState(app?.url ?? "");
  const [iconSource, setIconSource] = useState(app?.iconSource ?? "");
  const [mode, setMode] = useState(app?.frameless ? "borderless" : "chrome");
  const [preferPwa, setPreferPwa] = useState(app?.preferPwa ?? true);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [browsers, setBrowsers] = useState<Browser[]>([]);
  const [browserId, setBrowserId] = useState(app?.browser?.id ?? (app && !app.frameless ? legacyBrowser().id : ""));
  const [setupError, setSetupError] = useState("");
  const [profile, setProfile] = useState(app?.profile ?? "Default");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const { pop } = useNavigation();

  useEffect(() => {
    try {
      const detected = discoverBrowsers(getPreferenceValues<BrowserPreferences>());
      const savedBrowser = app?.browser || (app && !app.frameless ? legacyBrowser() : undefined);
      if (savedBrowser) {
        const index = detected.findIndex((browser) => browser.id === savedBrowser.id);
        if (index === -1) detected.unshift(savedBrowser); else detected[index] = savedBrowser;
      }
      setBrowsers(detected);
      if (!savedBrowser) setBrowserId(detected[0]?.id || "");
      if (!detected.length) setSetupError("Install Google Chrome, Chromium, Brave or Edge, or configure a custom Chromium browser in extension preferences. Borderless mode is also available with WebKitGTK.");
    } catch (error) {
      setSetupError(String(error));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const browser = browsers.find((item) => item.id === browserId);
  useEffect(() => {
    if (!browser) return;
    try {
      const result = getProfiles(browser);
      setProfiles(result.profiles);
      if (!app || !result.profiles.some((item) => item.directory === app.profile)) setProfile(result.selected);
      setSetupError("");
    } catch (error) { setProfiles([]); setSetupError(String(error)); }
  }, [browser]);

  async function submit() {
    if (isSaving) return;
    setIsSaving(true);
    try {
      if (mode === "chrome" && (!browser || !profiles.some((item) => item.directory === profile))) throw new Error(setupError || "Choose an installed browser and an available profile.");
      const runtime = getRuntime();
      if (mode === "borderless") {
        if (!runtime.python) throw new Error("Install Python 3 with PyGObject, GTK 4.10+ and WebKitGTK 6, or choose browser mode.");
        try { execFileSync(runtime.python, ["-c", "import gi; gi.require_version('Gtk','4.0'); gi.require_version('WebKit','6.0'); from gi.repository import Gtk,WebKit; assert hasattr(Gtk,'AlertDialog')"], { timeout: 5000, stdio: "ignore" }); }
        catch { throw new Error("Borderless mode requires Python PyGObject, GTK 4.10+ and WebKitGTK 6. Install those packages or choose browser mode."); }
      }
      const draft = normalizeApp(name, url, profile, { frameless: mode === "borderless", iconSource, preferPwa, browser: mode === "chrome" ? browser : undefined, runtime }, app?.id);
      if (app && app.url === draft.url && app.profile === profile && mode === "chrome" && preferPwa) {
        draft.pwa = app.pwa;
        draft.pwaDesktopId = app.pwaDesktopId;
      }
      let warning: string | undefined;
      let pendingInstall = false;
      if (app?.icon && existsSync(app.icon) && app.iconSource === iconSource.trim() && (iconSource.trim() || (app.name === draft.name && app.url === draft.url))) {
        draft.icon = app.icon;
      } else {
        const result = await resolveIcon(draft.name, draft.url, iconSource, runtime.python);
        warning = result.warning;
        if (result.data) draft.icon = installIcon(draft.id, result.data);
      }
      const saved = app ? updateApp(app, draft.name, draft.url, draft.profile, draft)
        : createApp(draft.name, draft.url, draft.profile, undefined, draft, draft.id);
      if (saved.preferPwa && (!app || !app.preferPwa || app.url !== saved.url || app.profile !== saved.profile)) {
        const result = await tryInstallPwa(saved);
        warning = result.message;
        pendingInstall = result.status === "pending";
      }
      onSaved?.();
      pop();
      await showToast({ title: `${draft.name} ${app ? "updated" : "created"}`, message: warning ?? "Search its name in Vicinae or GNOME to open it.", style: Toast.Style.Success });
      if (pendingInstall) {
        await sendDesktopNotification({ title: "Finish Web App Installation", body: warning || "Confirm installation in your browser." });
        await closeMainWindow();
      }
    } catch (error) {
      await showToast({ title: `Could not ${app ? "update" : "create"} web app`, message: String(error), style: Toast.Style.Failure });
    } finally {
      setIsSaving(false);
    }
  }

  const suggestion = inferIcon(name, url);
  return (
    <Form navigationTitle={app ? "Edit Web App" : "Create Web App"} isLoading={isLoading || isSaving}
      actions={<ActionPanel><Action.SubmitForm title={app ? "Save Changes" : "Create Web App"} onSubmit={submit} /></ActionPanel>}>
      <Form.TextField id="name" title="Name" placeholder="Calendar" value={name} onChange={setName} autoFocus />
      <Form.TextField id="url" title="Website" placeholder="https://calendar.google.com" value={url} onChange={setUrl} />
      <Form.TextField id="iconSource" title="Icon" placeholder="Automatic, or paste an image URL / file path" value={iconSource} onChange={setIconSource} info="Accepts PNG, SVG, JPEG or ICO images. Leave blank to find an icon by app name." />
      {!iconSource && <Form.Description title="Suggested Icon" text={suggestion ? `${suggestion} — Dashboard Icons` : "Type an app name to look for an icon in Dashboard Icons."} />}
      <Form.Dropdown id="mode" title="Window" value={mode} onChange={setMode}>
        <Form.Dropdown.Item value="chrome" title="Browser app (shares browser sign-ins)" />
        <Form.Dropdown.Item value="borderless" title="Borderless GNOME window (separate sign-in)" />
      </Form.Dropdown>
      {mode === "chrome" && !app && <Form.Dropdown id="browser" title="Browser" value={browserId} onChange={setBrowserId}>
        {browsers.map((item) => <Form.Dropdown.Item key={item.id} value={item.id} title={item.name} />)}
      </Form.Dropdown>}
      {mode === "chrome" && app && <Form.Description title="Browser" text={browser?.name || "Loading browser…"} />}
      {mode === "chrome" && setupError && <Form.Description title="Setup" text={setupError} />}
      {mode === "chrome" && <Form.Dropdown id="profile" title="Browser Profile" value={profile} onChange={setProfile}>
        {profiles.map((item) => <Form.Dropdown.Item key={item.directory} value={item.directory} title={item.name} />)}
      </Form.Dropdown>}
      {mode === "chrome" && <Form.Checkbox id="preferPwa" title="Installation" label="Prefer a PWA when available" value={preferPwa} onChange={setPreferPwa}
        info="Confirm the installation in your browser. Until then, or if unavailable, the app opens in app mode with the same profile." />}
      <Form.Description text={mode === "borderless"
        ? "No title bar or window buttons. Uses its own website sign-in. Move with Super+drag; close with Alt+F4."
        : "Reuses this browser profile's existing sign-ins. Window decorations depend on the browser and site."} />
      {app && <Form.Description text="Changes apply when you close and reopen the app. Your launcher and GNOME pins are kept." />}
    </Form>
  );
}
