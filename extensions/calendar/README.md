# Calendar

Read calendars already connected to GNOME Calendar or Evolution, preview your next event in Vicinae, and press Enter to open its meeting link.

## Setup

Requires Vicinae 0.29.2+, Node.js 22.18+, system Python 3, PyGObject, and Evolution Data Server's ECal 2.0 / EDataServer 1.2 introspection bindings.

Fedora:

```sh
sudo dnf install python3-gobject evolution-data-server gnome-calendar
```

Debian / Ubuntu:

```sh
sudo apt install python3-gi gir1.2-ecal-2.0 gir1.2-edataserver-1.2 gnome-calendar
```

Install the extension:

```sh
npm ci
npm run build
```

1. Add your accounts in GNOME Online Accounts or GNOME Calendar. Existing calendars are discovered automatically.
2. Run **Select Calendars** to choose sources. Until you save a selection, the extension follows GNOME's selected calendars.
3. Install the [native home-screen integration](native/README.md) to show actual event titles, start times, and countdowns in an **Upcoming** section above Favorites when you open the launcher. It shows up to three ongoing events or events starting within 24 hours, and removes them after they end.
4. Use **Upcoming Events** for the next seven days, grouped by day, with a calendar filter and search by title, location, or calendar.

## Meeting actions

**Enter** opens the meeting link from either Next Event or the agenda. The extension checks structured conference metadata first, then a recognized meeting URL in the event URL, then links in the location and description. Multiple equally suitable links open a picker. Without a meeting link, Enter opens event details. Browser failures show an error and preserve access to details.

Supports Google Meet, Zoom, Microsoft Teams, Jitsi Meet, Webex, and Whereby in event text. Structured conference metadata can point to other HTTPS meeting services. The extension does not open unrelated links from descriptions or non-HTTPS URLs. **Copy Meeting Link**, **Event Details**, and **Open Calendar** are available in the action menu. Open Calendar uses GNOME Calendar at the event date.

## Calendar behavior

Evolution Data Server handles account credentials, synchronization, recurring event exceptions, and time zones. The extension only reads events, omits cancellations, keeps ongoing events visible, and respects all-day dates with exclusive end dates. Timed events take priority over all-day events in the Next Event preview.

Cached events appear immediately. Successful refreshes remove deleted events; a failed calendar retains its cached events with a visible warning. The private cache is stored in the extension's Vicinae support directory with owner-only file permissions. No calendar data is uploaded by the extension. Calendar accounts continue syncing through EDS as usual.

Opening the agenda, the one-minute background refresh, and **Ctrl+R** request a remote sync through EDS before reading events. Manual refresh shows **Syncing calendars…** followed by a success or failure message. The agenda displays its loading state and last update time. Provider updates may arrive asynchronously; the next refresh picks up changes still in transit.

Thunderbird and KDE calendars are supported only when the same calendar is also configured in EDS. The extension reads the host's EDS session; calendars isolated inside a sandbox may need to be connected on the host.

The native home-screen integration reads the extension's local agenda cache and activates the exact selected event through the extension. Without the companion change, stock Vicinae offers the agenda commands and an optional Next Event command subtitle; it cannot display the Upcoming home-screen section through the extension API alone.

## Development

```sh
npm run check
npm run dev
```

The checks validate the manifest, type-check the extension, and test meeting links, cached failures, date handling, recurrence across daylight saving changes, and calendar serialization. Tests use synthetic events and do not modify your calendars or open meeting links.
