# Native home-screen integration

The companion patch adds an **Upcoming** section at the top of Vicinae's main launcher. It displays up to three ongoing timed events or events starting within 24 hours, including their actual titles, start times, calendar names, and countdowns. All-day and ended events are omitted from this section; the agenda still includes all-day events.

Enter activates that specific event through the Calendar extension, which opens its meeting link, offers a picker for multiple links, or displays its details. A deleted event cannot accidentally open a different meeting.

The section refreshes when the launcher opens, when the agenda cache changes, and every 30 seconds while the launcher is visible. It is shown when the main search field is empty. The extension refreshes calendar data in the background every minute.

## Build

The patch targets Vicinae **v0.29.2**. Install the development dependencies described in [Vicinae's documentation](https://docs.vicinae.com), then:

```sh
git clone --branch v0.29.2 https://github.com/vicinaehq/vicinae.git
cd vicinae
git apply /path/to/calendar/native/vicinae-upcoming.patch
cmake -S . -B build -G Ninja -DCMAKE_BUILD_TYPE=Release -DCMAKE_INSTALL_PREFIX="$HOME/.local"
cmake --build build --parallel
cmake --install build
```

Install the Calendar extension as described in its README. Start the patched Vicinae server to use the home-screen integration. A system package upgrade will not add this feature to the stock binary; keep using the patched server until the feature is available upstream.

For the local development installation, the source is `/home/alhimowicz/work/pets/vicinae-calendar`. A user service override selects the patched binary while retaining the existing Node runtime configuration. Removing only `~/.config/systemd/user/vicinae.service.d/calendar-home.conf`, then running `systemctl --user daemon-reload` and `systemctl --user restart vicinae`, returns to the system binary.

The patch follows Vicinae's license, included in `native/LICENSE`.
