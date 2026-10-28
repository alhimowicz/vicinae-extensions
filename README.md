# Vicinae Extensions

Personal extensions for [Vicinae](https://vicinae.com).

| Extension | Description |
| --- | --- |
| [Web Apps](extensions/web-apps) | Create and manage website apps with browser profiles, custom icons, guided PWA installation and optional borderless WebKit windows. |
| [Calendar](extensions/calendar) | Preview your next GNOME calendar event, browse your agenda, and press Enter to join meetings. |
| [Chrome Profiles](extensions/chrome-profiles) | Switch Chrome profiles, open tabs, and browse profile bookmarks. |
| [DNF Packages](extensions/dnf-packages) | Search packages, view their details, and install them with DNF. |

## Repository layout

All four extensions are maintained here, each as an independent Node.js project under `extensions/<name>/`. Run installation and development commands from that extension's directory; dependency versions remain specific to each extension.

The Chrome Profiles and DNF Packages histories are preserved on the `history/chrome-profiles` and `history/dnf-packages` branches.

## Install Chrome Profiles or DNF Packages locally

```sh
cd extensions/chrome-profiles # or extensions/dnf-packages
npm ci
npm run build
```

Chrome Profiles supports native Google Chrome and its Flatpak installation. DNF Packages requires a DNF-based distribution and uses `pkexec` to authorize package installation. To validate either extension, run `npx vici lint` and `npx tsc --noEmit`.

## Install Calendar locally

See the [Calendar setup](extensions/calendar/README.md#setup) for system dependencies. From `extensions/calendar`, run `npm ci` followed by `npm run build`. The [native companion patch](extensions/calendar/native/README.md) adds actual upcoming events above Favorites when the launcher opens.

## Install Web Apps locally

See the [Web Apps requirements and setup](extensions/web-apps/README.md#setup) first. Development requires Node.js 22.18+.

```sh
git clone https://github.com/alhimowicz/vicinae-extensions.git
cd vicinae-extensions/extensions/web-apps
npm ci
npm run build
```

The build installs the extension into Vicinae. To validate changes, run `npm run check` from the extension directory.

Web Apps is not yet published in the official Vicinae store. Develop its source here and use the [publishing instructions](extensions/web-apps/PUBLISHING.md) to copy a release into the [store submission fork](https://github.com/alhimowicz/extensions/tree/feat/web-apps/extensions/web-apps).
