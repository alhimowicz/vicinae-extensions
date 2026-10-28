#!/usr/bin/env python3
"""Borderless GNOME web windows with a persistent session for each app."""
import base64
import json
from pathlib import Path
import re
import sys
from urllib.parse import urlsplit

import gi

gi.require_version("Gtk", "4.0")
gi.require_version("Gdk", "4.0")
gi.require_version("WebKit", "6.0")
from gi.repository import Gdk, Gio, GLib, Gtk, WebKit


def read_app(filename):
    entry = GLib.KeyFile()
    entry.load_from_file(filename, GLib.KeyFileFlags.NONE)
    app = json.loads(base64.b64decode(entry.get_string("Desktop Entry", "X-Vicinae-WebApp")))
    if not re.fullmatch(r"(?:vicinae-webapp-|io\.vicinae\.webapp\.a|(?:[A-Za-z0-9_-]+\.)+[A-Za-z0-9_-]+\.vicinae\.a)[a-f0-9]{24}", app["id"]):
        raise ValueError("Invalid web app ID")
    if urlsplit(app["url"]).scheme not in ("http", "https"):
        raise ValueError("Invalid website URL")
    return app


class WebApp(Gtk.Application):
    def __init__(self, config):
        app_id = config["id"] if "." in config["id"] else "io.vicinae.webapp.a" + config["id"].removeprefix("vicinae-webapp-")
        super().__init__(application_id=app_id)
        self.config = config
        self.window = None

    def do_activate(self):
        if self.window:
            self.window.present()
            return
        data = Path(GLib.get_user_data_dir()) / "vicinae-webapps" / self.config["id"]
        cache = Path(GLib.get_user_cache_dir()) / "vicinae-webapps" / self.config["id"]
        self.session = WebKit.NetworkSession.new(str(data), str(cache))
        self.session.connect("download-started", self.download_started)
        self.view = WebKit.WebView(network_session=self.session)
        self.window = self.create_window(self.view)
        self.window.connect("close-request", self.closed)
        self.view.load_uri(self.config["url"])
        self.window.present()

    def closed(self, window):
        self.window = None
        return False

    def create_window(self, view):
        window = Gtk.ApplicationWindow(application=self, decorated=False, default_width=1100, default_height=800, title=self.config["name"])
        window.set_child(view)
        view.connect("create", self.create_popup)
        view.connect("close", lambda _view: window.close())
        view.connect("permission-request", lambda _view, request: self.permission_request(window, view, request))
        view.connect("decide-policy", self.decide_policy)
        view.connect("load-failed", lambda _view, _event, _uri, error: self.load_failed(window, error))
        controller = Gtk.EventControllerKey.new()
        controller.set_propagation_phase(Gtk.PropagationPhase.CAPTURE)
        controller.connect("key-pressed", lambda _controller, key, _code, state: self.key_pressed(window, view, key, state))
        window.add_controller(controller)
        return window

    def create_popup(self, view, navigation):
        popup = WebKit.WebView(related_view=view)
        window = self.create_window(popup)
        popup.connect("ready-to-show", lambda _view: window.present())
        return popup

    def decide_policy(self, view, decision, kind):
        if kind != WebKit.PolicyDecisionType.NAVIGATION_ACTION:
            return False
        uri = decision.get_navigation_action().get_request().get_uri()
        if urlsplit(uri).scheme in ("http", "https", "about", "blob", "data"):
            return False
        decision.ignore()
        try:
            Gio.AppInfo.launch_default_for_uri(uri, None)
        except GLib.Error as error:
            Gtk.AlertDialog(message=str(error)).show(self.window)
        return True

    def permission_request(self, window, view, request):
        if not isinstance(request, WebKit.UserMediaPermissionRequest):
            return False
        devices = []
        if request.props.is_for_audio_device:
            devices.append("microphone")
        if request.props.is_for_video_device:
            devices.append("camera")
        host = urlsplit(view.get_uri()).hostname or self.config["name"]
        dialog = Gtk.AlertDialog(message=f"Allow {host} to access your " + " and ".join(devices or ["media devices"]) + "?", buttons=["Cancel", "Allow"], cancel_button=0, default_button=0)
        def answered(dialog, result):
            try:
                allowed = dialog.choose_finish(result) == 1
            except GLib.Error:
                allowed = False
            request.allow() if allowed else request.deny()
        dialog.choose(window, None, answered)
        return True

    def download_started(self, session, download):
        def decide_destination(download, suggested):
            dialog = Gtk.FileDialog(title="Save Download", initial_name=Path(suggested).name)
            def selected(dialog, result):
                try:
                    destination = dialog.save_finish(result)
                    download.set_allow_overwrite(True)
                    download.set_destination(destination.get_uri())
                except GLib.Error:
                    download.cancel()
            dialog.save(self.window, None, selected)
            return True
        download.connect("decide-destination", decide_destination)

    def load_failed(self, window, error):
        if not error.matches(WebKit.NetworkError.quark(), WebKit.NetworkError.CANCELLED):
            Gtk.AlertDialog(message="Could not load the page: " + str(error)).show(window)
        return False

    def key_pressed(self, window, view, key, state):
        if state & Gdk.ModifierType.CONTROL_MASK:
            if key in (Gdk.KEY_r, Gdk.KEY_R):
                view.reload()
            elif key in (Gdk.KEY_w, Gdk.KEY_W):
                window.close()
            elif key in (Gdk.KEY_plus, Gdk.KEY_equal, Gdk.KEY_KP_Add):
                view.set_zoom_level(min(3.0, view.get_zoom_level() + 0.1))
            elif key in (Gdk.KEY_minus, Gdk.KEY_KP_Subtract):
                view.set_zoom_level(max(0.3, view.get_zoom_level() - 0.1))
            elif key in (Gdk.KEY_0, Gdk.KEY_KP_0):
                view.set_zoom_level(1.0)
            else:
                return False
            return True
        if state & Gdk.ModifierType.ALT_MASK and key == Gdk.KEY_Left:
            view.go_back()
            return True
        return False


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Usage: webapp.py <launcher.desktop>")
    try:
        application = WebApp(read_app(sys.argv[1]))
        raise SystemExit(application.run([sys.argv[0]]))
    except (OSError, ValueError, KeyError, GLib.Error) as error:
        print("Could not open web app:", error, file=sys.stderr)
        raise SystemExit(1)
