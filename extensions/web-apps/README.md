# Web Apps

Create website applications from Vicinae, with their own launcher and icon. Use an existing Chromium browser profile to keep your sign-ins, or an optional borderless GTK/WebKit window with a separate session.

Linux only. GNOME/Wayland integration is tested locally; other Linux sessions and desktops can use the generated desktop entries, but their grouping and window controls may differ.

## Setup

The extension discovers native and Flatpak installations of Google Chrome, Chromium, Brave and Microsoft Edge. Open a browser once and create a profile before using it here. Both installation types are listed separately. Firefox and Snap packages are not supported.

For another native Chromium-based browser or a nonstandard profile location, set **Custom Browser Executable** and **Custom Browser User-data Directory** in this extension's preferences. The directory must contain `Local State` and the profile folders. Browser settings are saved per launcher; changing the preferences affects new launchers.

Optional features need these system packages:

| Feature | Requirements |
| --- | --- |
| Browser app mode | A supported browser with an existing profile |
| Icon decoding and PWA discovery | Python 3, PyGObject, GLib and GdkPixbuf; SVG decoding also needs librsvg |
| PWA launcher and background watcher | Vicinae's Node runtime, reused automatically |
| Borderless window | Python 3, PyGObject, GTK 4.10+ and WebKitGTK 6.0 |

Python is discovered from `PATH`. If several installations exist, the extension looks for one with PyGObject. **Python 3 Interpreter** in preferences can select a specific interpreter. Missing icon dependencies fall back to the system browser icon; invalid custom images show an error before changing the launcher.

For example, Fedora provides these packages through `python3-gobject`, `gdk-pixbuf2`, `librsvg2`, `gtk4` and `webkitgtk6.0`. Debian/Ubuntu releases with sufficiently recent GTK/WebKit provide `python3-gi`, `gir1.2-gdkpixbuf-2.0`, `librsvg2-common`, `gir1.2-gtk-4.0` and `gir1.2-webkit-6.0`. Package names and availability vary by distribution.

### Flatpak PWA permissions

Flatpak browsers need permission to write the host's applications and icons folders before they can register or uninstall PWAs. In Flatseal, allow `~/.local/share/applications` and `~/.local/share/icons` for your selected browser, then **exit the browser and all its web-app windows** and reopen it. A running sandbox retains its old permissions even if a newly launched Flatpak process has access.

For the standard XDG folders, the equivalent command is:

```sh
flatpak override --user --filesystem=~/.local/share/applications --filesystem=~/.local/share/icons <browser-flatpak-id>
```

Use the browser's actual application ID, such as `com.google.Chrome`, `org.chromium.Chromium`, `com.brave.Browser` or `com.microsoft.Edge`. With a custom `XDG_DATA_HOME`, grant the corresponding absolute folders instead. Explicit paths avoid a conflict between `xdg-data` permissions and the browser's Flextop directory links.

The extension checks running Flatpak sandboxes before opening a PWA installation page and explains missing access. It does not grant permissions, restart browsers or change their profiles automatically.

## Create and manage apps

1. Search for **Create Web App** in Vicinae.
2. Enter the app name and HTTP/HTTPS URL.
3. Choose the detected browser and one of its profiles.
4. Optionally choose an icon, PWA preference or borderless window.
5. Create the launcher. Search its name in Vicinae or your desktop's application menu, and pin it to the dock if desired.

Search for **Web Apps** to manage launchers. **Ctrl+E** edits the selected app; **Ctrl+N** creates another; **Ctrl+R** refreshes the list. Editing keeps the launcher ID and pins. Close and reopen the app to apply changes. To use a different browser, create another launcher so its desktop identity can match the browser's sandbox.

A borderless launcher with a native identity also needs a new launcher when switching to a Flatpak browser; its existing ID cannot acquire a different sandbox's prefix while keeping the same pin identity.

Removing a launcher keeps website sessions and data. For a managed PWA it also restores the browser's original shortcut. Uninstall the PWA itself through the browser's app settings. Remove launchers before uninstalling this extension if you no longer want them.

### PWA installation

**Prefer a PWA when available** is enabled for new browser apps. The extension reads the public page's web-app manifest and looks for a matching installed PWA in the chosen browser and profile. If necessary, it opens that browser profile and asks you to use its **Install** action and confirm installation. This is a guided flow: the extension cannot silently install into a running browser profile.

For existing apps, choose **Install as PWA** from the **Web Apps** action panel. A watcher checks for the browser's new shortcut for up to two minutes. Launching the app or refreshing the list checks again. Only a matching browser registration enables PWA launching; otherwise the app-mode launcher stays usable, including after cancelling installation or removing the PWA.

If the browser installed the PWA before Flatpak permissions were fixed, re-create its shortcut from the browser's apps page after restarting. A browser installation without its registered desktop shortcut remains in app-mode fallback here.

Your name, padded icon, launcher ID and pins are retained. The duplicate browser shortcut is hidden while managed, and its previous visibility is restored when the launcher is removed. Website sign-ins are shared with the selected browser profile; no cookies or profile databases are copied.

Public manifest discovery does not use your cookies. Sites that expose manifests only after sign-in, inject them dynamically, lack a suitable manifest, or cannot be reached keep using app mode. PWA installation does not guarantee offline use or removal of the browser's title bar.

### Icons

Leave **Icon** empty to infer artwork from the title and website using the bundled [Dashboard Icons](https://github.com/homarr-labs/dashboard-icons) name and alias index. Matching happens locally; a matching image is downloaded from that project's GitHub repository. An unavailable image falls back to the system browser icon.

You can instead enter an HTTP/HTTPS image URL or an absolute local path, including `~/`. PNG, SVG, JPEG and ICO files up to 4 MB are decoded to local PNGs. Artwork preserves its proportions inside a transparent margin so it fits the dock. Original image files are not modified.

### Borderless windows

**Borderless GNOME window** uses GTK 4 and WebKitGTK. It has no title bar or window buttons, is movable and resizable, and has its own application identity. Each app has its own persistent session, separate from Chromium browsers. Browser profiles and PWAs do not apply in this mode.

Move with **Super+drag**, close with **Alt+F4** or **Ctrl+W**, reload with **Ctrl+R**, go back with **Alt+Left**, and zoom with **Ctrl+plus/minus/0**. Popups share the app's session. Camera and microphone requests ask for permission; downloads show a Save dialog.

## Data and compatibility

Launchers and cached icons use `$XDG_DATA_HOME/applications` and `$XDG_DATA_HOME/icons/hicolor/256x256/apps`, with the usual `~/.local/share` fallback. Browser executables and user-data locations are discovered rather than assuming a particular user, package manager or distribution. Custom profile names are supported.

Flatpak launchers use the selected browser's application-ID prefix for GNOME matching; native and WebKit launchers use `io.vicinae.webapp.a…`. Launchers from the earlier local version remain readable and keep their IDs. Opening **Web Apps** refreshes their runtime paths without changing their website, profile, icon or pin identity. A malformed launcher is reported without preventing other apps from loading.

Helpers are copied from Vicinae's assets directory into its extension support directory. Launchers reference those stable helper paths and the discovered interpreters. The PWA watcher ends after installation, launcher changes/removal, or its two-minute deadline. Browser and WebKit windows intentionally remain independent of Vicinae's window.

PWA-helper launch failures use `notify-send` when it is available; otherwise the error is written to standard error. No notification utility is required for normal operation.

Borderless data and cache live in the user's XDG data/cache directories under `vicinae-webapps/<app-id>`. The extension does not read browser cookies, passwords or browsing history. Network requests are limited to the website/manifest being checked, the chosen icon URL, and matching Dashboard Icons artwork. There is no telemetry.

App-mode windows sharing a hostname, URL path and browser profile can share a desktop group, even if their query strings differ. Installed PWAs use their manifest identity and profile. Native browser variants have automated discovery/argument tests; the live desktop checks were performed with Flatpak Chrome on GNOME.

## Development

Use Node.js 22.18+; development tests use Node's built-in TypeScript support. Install the Python icon dependencies above and `desktop-file-validate` (usually the `desktop-file-utils` package).

```sh
npm ci
npm run check
npm run build
```

The build installs locally through `vici build`. `npm ci` also generates the readable PWA helper from `src/pwa-worker.ts` using the declared esbuild dependency, because the store invokes `vici build` directly. Generated helpers are not committed. To build without updating the local installation:

```sh
npx vici build --out dist/web-apps
```

In a GNOME session with the borderless dependencies installed, run `python3 tests/native_test.py` for the live WebKit check. See [PUBLISHING.md](PUBLISHING.md) for submission preparation. The extension is MIT licensed; the bundled Dashboard Icons index retains its upstream Apache-2.0 license in `assets/dashboard-icons.LICENSE`.
