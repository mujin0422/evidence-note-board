#!/usr/bin/env python3
"""Small native GTK4 receiver for drag-and-drop from Nautilus.

Wayland file offers belong to GTK windows, not to Clutter desktop actors.
This helper prints a JSON array of local file paths once, then closes.
Image validation and SQLite writes happen in the Rust backend.
"""
import json
import sys

try:
    import gi
    gi.require_version("Gtk", "4.0")
    gi.require_version("Gdk", "4.0")
    from gi.repository import Gdk, GLib, Gtk
except (ImportError, ValueError) as error:
    print(f"GTK4/PyGObject unavailable: {error}", file=sys.stderr)
    raise SystemExit(2)


class DropApp(Gtk.Application):
    def do_activate(self):
        window = Gtk.ApplicationWindow(application=self)
        window.set_title("Evidence Board — thả ảnh")
        window.set_default_size(430, 220)

        zone = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=12)
        zone.set_margin_top(30)
        zone.set_margin_bottom(30)
        zone.set_margin_start(25)
        zone.set_margin_end(25)
        zone.append(Gtk.Label(label="Kéo ảnh PNG / JPG / WebP từ Files vào đây"))
        zone.append(Gtk.Label(label="Thả ảnh để ghim lên Evidence Board"))
        zone.append(Gtk.Label(label="Đóng cửa sổ để hủy"))

        target = Gtk.DropTarget.new(Gdk.FileList, Gdk.DragAction.COPY)
        target.connect("drop", self.on_drop)
        zone.add_controller(target)
        window.set_child(zone)
        window.present()

    def on_drop(self, _target, value, _x, _y):
        files = value.get_files()
        paths = [item.get_path() for item in files]
        paths = [p for p in paths if p and p.lower().endswith(
            (".png", ".jpg", ".jpeg", ".webp"))][:12]
        if not paths:
            return False
        print(json.dumps(paths, ensure_ascii=False), flush=True)
        GLib.idle_add(self.quit)
        return True


if __name__ == "__main__":
    raise SystemExit(DropApp(application_id="io.github.mujin0422.EvidenceDrop").run(sys.argv))
