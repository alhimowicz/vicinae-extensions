"""Run with python3 tests/native_test.py in an active GNOME session."""
import base64
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import traceback
from threading import Thread
from http.server import BaseHTTPRequestHandler, HTTPServer


with tempfile.TemporaryDirectory(prefix="vicinae-native-test-") as temporary:
    os.environ["XDG_DATA_HOME"] = str(Path(temporary) / "data")
    os.environ["XDG_CACHE_HOME"] = str(Path(temporary) / "cache")
    spec = importlib.util.spec_from_file_location("webapp", Path(__file__).parents[1] / "assets/webapp.py")
    webapp = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(webapp)

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write(b"<!doctype html><title>Native integration test</title><p>Loaded</p>")

        def log_message(self, *args):
            pass

    server = HTTPServer(("127.0.0.1", 0), Handler)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    config = {"id": "io.vicinae.webapp.a" + "f" * 24, "name": "Native Integration Test", "url": f"http://127.0.0.1:{server.server_port}", "profile": "Default", "frameless": True}
    launcher = Path(temporary) / (config["id"] + ".desktop")
    launcher.write_text("[Desktop Entry]\nX-Vicinae-WebApp=" + base64.b64encode(json.dumps(config).encode()).decode() + "\n")
    assert webapp.read_app(str(launcher)) == config
    assert webapp.Gio.Application.id_is_valid(config["id"])
    application = webapp.WebApp(config)
    errors = []
    finished = []

    def loaded(view, event):
        if event != webapp.WebKit.LoadEvent.FINISHED:
            return
        try:
            assert not application.window.get_decorated(), "Window still has decorations"
            assert application.get_application_id() == config["id"], "Window ID does not match launcher"
            assert view.get_uri() == config["url"] + "/", "Test page did not load"
            window = application.window
            application.activate()
            assert application.window is window
            assert application.key_pressed(window, view, webapp.Gdk.KEY_plus, webapp.Gdk.ModifierType.CONTROL_MASK)
            assert abs(view.get_zoom_level() - 1.1) < 0.001
            assert not application.key_pressed(window, view, webapp.Gdk.KEY_a, 0)
            popup = application.create_popup(view, None)
            assert popup.get_network_session() == view.get_network_session()
            assert not popup.get_root().get_decorated()
            popup.get_root().close()
            finished.append(True)
        except Exception as error:
            traceback.print_exc()
            errors.append(error)
        application.quit()

    def activated(app):
        application.view.connect("load-changed", loaded)

    application.connect_after("activate", activated)
    webapp.GLib.timeout_add_seconds(15, lambda: application.quit() or False)
    try:
        application.run(["native-test"])
    finally:
        server.shutdown()
        server.server_close()
    assert not errors, errors
    assert finished, "Native window did not load the test page"
    print("PASS: borderless native window, distinct app ID, local page load, focus, zoom and shared popup session")
