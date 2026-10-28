# Publishing preparation

The official store accepts extensions through pull requests to [vicinaehq/extensions](https://github.com/vicinaehq/extensions). Maintainers review the change; merging publishes the built extension.

## Validate a clean source tree

```sh
npm ci --legacy-peer-deps
npm run check
npx vici build --out dist/web-apps
```

These match the store's dependency-install and direct-build steps. The `prepare` lifecycle generates `assets/pwa-worker.cjs` before the direct build copies assets. Verify that the output contains both command bundles, `package.json`, `assets/pwa-worker.cjs`, `assets/webapp.py`, the icon and Dashboard Icons license/index. Use Node.js 22.18+ for the tests.

The source includes only public test fixtures. Exclude `node_modules`, `dist`, `__pycache__`, generated `vicinae-env.d.ts`, generated `assets/pwa-worker.cjs`, local desktop entries, user profiles and screenshots containing personal data from the submission.

## Prepare the store branch

1. Fork or locally clone the official repository.
2. Add this source under `extensions/web-apps/`, preserving its lockfile, license, README, changelog, scripts, tests and assets. The standalone project's `.github` workflow need not be copied into the extension subdirectory.
3. Follow the store's [review rules](https://github.com/vicinaehq/extensions/blob/main/skills/extension-reviewer/SKILL.md).
4. From the store repository root, run `bun scripts/validate-extension.ts web-apps`. From the extension directory, run the clean install, checks and direct build above.
5. Review the diff and the proposed pull-request text below. Push and submit only when ready.

## Proposed pull request

Title: `Add Web Apps extension`

Body:

> Adds website launchers with detected Chromium browser installations, per-app profile selection, inferred or custom icons, and an optional borderless GTK/WebKit mode.
>
> PWA installation uses browser confirmation and switches to the installed app only after a matching browser/profile shortcut exists. App mode remains available throughout. Flatpak setup checks report stale or missing permissions without changing them. Existing local launchers retain their IDs and pins.
>
> Validation: manifest lint, TypeScript, automated profile/desktop-entry/icon/PWA-helper tests, clean `npm ci` followed by direct `vici build`, and the live GTK/WebKit check on GNOME. Native browser variants are covered by fixtures; additional live distribution/browser testing is welcome.
>
> Developed with assistance from Codex.

The store maintains its own review and CI results. Local validation does not claim maintainer approval or a published store listing.
