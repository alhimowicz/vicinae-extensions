# Vicinae Extensions

Personal extensions for [Vicinae](https://vicinae.com).

| Extension | Description |
| --- | --- |
| [Web Apps](extensions/web-apps) | Create and manage website apps with browser profiles, custom icons, guided PWA installation and optional borderless WebKit windows. |

## Install Web Apps locally

See the [Web Apps requirements and setup](extensions/web-apps/README.md#setup) first. Development requires Node.js 22.18+.

```sh
git clone https://github.com/alhimowicz/vicinae-extensions.git
cd vicinae-extensions/extensions/web-apps
npm ci
npm run build
```

The build installs the extension into Vicinae. To validate changes, run `npm run check` from the extension directory.

The extension is not yet published in the official Vicinae store. Store submissions are maintained separately in the [extensions fork](https://github.com/alhimowicz/extensions/tree/feat/web-apps/extensions/web-apps).
