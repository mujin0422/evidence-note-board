import Clutter from 'gi://Clutter';
import Cogl from 'gi://Cogl';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {panBy, screenToWorld, zoomAt} from './canvasMath.js';
import {NoteService} from './noteService.js';
import {DoubleClickTracker} from './doubleClickTracker.js';
import {isEmptyBoardPoint} from './noteHitTest.js';
import {bodyTextForNote, hasLegacyTitle} from './noteContent.js';
import {resizedTextWidth, resizedImage, requiredPaperHeight, rotateBy} from './geometry.js';

const INITIAL_VIEW = Object.freeze({zoom: 1, panX: 0, panY: 0});

export class BoardView {
    constructor() {
        this._root = null;
        this._world = null;
        this._hud = null;
        this._createButton = null;
        this._imageButton = null;
        this._imagePicker = null;
        this._dropButton = null;
        this._dropProcess = null;
        this._resizeSession = null;
        this._doubleClick = new DoubleClickTracker();
        this._backgroundGroup = null;
        this._backgroundSignal = 0;
        this._monitorSignal = 0;
        this._stageSignals = [];
        this._grab = null;
        this._dragPoint = null;
        this._dragNote = null;
        this._view = {...INITIAL_VIEW};
        this._notes = new Map();
        this._timers = new Map();
        this._viewTimer = 0;
        this._service = null;
        this._backendWatchId = 0;
        this._connectionRevision = 0;
        this._alive = false;
        this._saving = false;
    }

    mount() {
        const group = Main.layoutManager?._backgroundGroup;
        if (!group || typeof group.add_child !== 'function' ||
            typeof group.set_child_above_sibling !== 'function') {
            throw new Error('GNOME Shell background group is unsupported');
        }
        this._backgroundGroup = group;
        this._alive = true;

        this._root = new St.Widget({
            name: 'evidence-note-board',
            reactive: true,
            clip_to_allocation: true,
            layout_manager: new Clutter.FixedLayout(),
            style_class: 'evidence-board-root',
        });
        this._world = new St.Widget({
            reactive: false,
            layout_manager: new Clutter.FixedLayout(),
        });
        this._world.set_size(4000, 3000);
        this._world.set_pivot_point(0, 0);
        this._root.add_child(this._world);

        this._hud = new St.Label({reactive: false, style_class: 'evidence-board-hud'});
        this._hud.set_position(22, 55);
        this._root.add_child(this._hud);

        // Visible fallback while desktop double-click behavior is validated.
        this._createButton = new St.Button({
            label: '+ GHI CHÚ',
            reactive: true,
            can_focus: true,
            style_class: 'evidence-create-button',
        });
        this._createButton.set_position(22, 98);
        this._createButton.connect('clicked', () => {
            const x = this._root?.width / 2;
            const y = this._root?.height / 2;
            if (Number.isFinite(x) && Number.isFinite(y))
                this._createNoteAtScreen(x, y);
        });
        this._root.add_child(this._createButton);

        this._imageButton = new St.Button({
            label: '+ ẢNH',
            reactive: true,
            can_focus: true,
            style_class: 'evidence-create-button evidence-image-button',
        });
        this._imageButton.set_position(150, 98);
        this._imageButton.connect('clicked', () => this._chooseImage());
        this._root.add_child(this._imageButton);

        this._dropButton = new St.Button({
            label: '⇩ THẢ ẢNH',
            reactive: true,
            can_focus: true,
            style_class: 'evidence-create-button evidence-image-button',
        });
        this._dropButton.set_position(244, 98);
        this._dropButton.connect('clicked', () => this._openDropWindow());
        this._root.add_child(this._dropButton);
        this._resize();
        this._setStatus('Đang kết nối backend…');

        this._root.connect('scroll-event', (_actor, event) => this._scroll(event));
        this._root.connect('button-press-event', (_actor, event) => this._press(event));
        this._root.connect('motion-event', (_actor, event) => this._motion(event));
        this._root.connect('button-release-event', (_actor, event) => this._release(event));

        group.add_child(this._root);
        this._raiseAboveWallpaper();
        this._backgroundSignal = group.connect('child-added', (_g, child) => {
            if (child !== this._root)
                this._raiseAboveWallpaper();
        });
        this._monitorSignal = Main.layoutManager.connect('monitors-changed', () => this._resize());
        for (const name of ['notify::width', 'notify::height'])
            this._stageSignals.push(global.stage.connect(name, () => this._resize()));

        // AUTO_START uses the per-user D-Bus activation entry if the
        // backend has not started yet. Name-owner changes make reconnection
        // automatic when systemd restarts it after a crash.
        this._backendWatchId = Gio.bus_watch_name(
            Gio.BusType.SESSION,
            'io.github.mujin0422.EvidenceNoteBoard',
            Gio.BusNameWatcherFlags.AUTO_START,
            () => {
                if (!this._alive)
                    return;
                this._setStatus('Đang kết nối backend…');
                this._connectBackend().catch(error => {
                    if (this._alive) {
                        console.warn('Evidence Note Board: backend connection failed', error.message);
                        this._setStatus('BACKEND OFFLINE · kiểm tra systemd --user');
                    }
                });
            },
            () => {
                if (!this._alive)
                    return;
                this._connectionRevision++;
                this._service = null;
                // Preserve existing note actors and unsaved text on screen.
                this._setStatus('BACKEND OFFLINE · đang chờ tự kết nối lại');
            }
        );
    }

    async _connectBackend() {
        const revision = ++this._connectionRevision;
        const service = await NoteService.connect();
        const [notes, view] = await Promise.all([service.listNotes(), service.getView()]);
        // A backend restart or extension disable invalidates in-flight RPCs.
        if (!this._alive || revision !== this._connectionRevision)
            return;
        this._service = service;
        if (Number.isFinite(view.zoom) && view.zoom >= 0.25 && view.zoom <= 3 &&
            Number.isFinite(view.pan_x) && Number.isFinite(view.pan_y)) {
            this._view = {zoom: view.zoom, panX: view.pan_x, panY: view.pan_y};
        }
        this._applyView();
        let restored = 0;
        let failed = 0;
        for (const note of notes) {
            try {
                this._renderNote(note);
                restored++;
            } catch (error) {
                failed++;
                console.error(error, 'Evidence Note Board: failed to render saved note');
            }
        }
        if (failed)
            this._setStatus(`LỖI HIỂN THỊ ${failed} GHI CHÚ · xem journalctl`);
        else
            this._setStatus(`P2.4 · SẴN SÀNG · ${restored} ghi chú · double-click hoặc + GHI CHÚ`);
    }

    _setStatus(message) {
        this._hud?.set_text(`EVIDENCE BOARD · ${message} · ${Math.round(this._view.zoom * 100)}%`);
    }

    _raiseAboveWallpaper() {
        if (this._root?.get_parent() === this._backgroundGroup)
            this._backgroundGroup.set_child_above_sibling(this._root, null);
    }

    _resize() {
        if (this._root)
            this._root.set_size(global.stage.width, global.stage.height);
    }

    _applyView() {
        if (!this._world)
            return;
        this._world.set_scale(this._view.zoom, this._view.zoom);
        this._world.set_position(this._view.panX, this._view.panY);
        if (this._service)
            this._setStatus('Ctrl+Wheel: zoom · chuột giữa: pan');
    }

    _scheduleView() {
        if (!this._service || !this._alive)
            return;
        if (this._viewTimer)
            GLib.Source.remove(this._viewTimer);
        this._viewTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 550, () => {
            this._viewTimer = 0;
            this._persistView();
            return GLib.SOURCE_REMOVE;
        });
    }

    _persistView() {
        if (!this._service)
            return;
        const {zoom, panX, panY} = this._view;
        this._service.saveView(zoom, panX, panY).catch(() => this._saveError());
    }

    _saveError() {
        if (this._alive)
            this._setStatus('LỖI LƯU · kiểm tra user service');
    }

    _scroll(event) {
        if (!this._service || !(event.get_state() & Clutter.ModifierType.CONTROL_MASK))
            return Clutter.EVENT_PROPAGATE;
        const direction = event.get_scroll_direction();
        let factor;
        if (direction === Clutter.ScrollDirection.UP)
            factor = 1.1;
        else if (direction === Clutter.ScrollDirection.DOWN)
            factor = 1 / 1.1;
        else if (direction === Clutter.ScrollDirection.SMOOTH) {
            const [, dy] = event.get_scroll_delta();
            factor = Math.exp(-dy * 0.13);
        } else {
            return Clutter.EVENT_PROPAGATE;
        }
        if (!Number.isFinite(factor) || factor <= 0)
            return Clutter.EVENT_PROPAGATE;
        const [x, y] = event.get_coords();
        this._view = zoomAt(this._view, {x, y}, this._view.zoom * factor);
        this._applyView();
        this._scheduleView();
        return Clutter.EVENT_STOP;
    }

    _createNoteAtScreen(x, y) {
        if (!this._alive || !this._service) {
            this._setStatus('BACKEND OFFLINE · kiểm tra user service');
            return;
        }
        const at = screenToWorld(this._view, {x, y});
        this._setStatus('Đang tạo ghi chú…');
        this._service.createNote('', '', at.x, at.y)
            .then(note => {
                if (!this._alive)
                    return;
                // Persistence is already committed. A render error must never
                // be reported as a failed save (otherwise users create
                // multiple invisible records by retrying).
                try {
                    this._renderNote(note, true);
                    this._setStatus('P2.4 · ĐÃ TẠO GHI CHÚ · nhập trực tiếp trên giấy');
                } catch (error) {
                    console.error(error, 'Evidence Note Board: saved note but rendering failed');
                    this._setStatus('ĐÃ LƯU NHƯNG LỖI HIỂN THỊ · xem journalctl');
                }
            })
            .catch(error => {
                console.warn('Evidence Note Board: create note D-Bus failed', error.message);
                this._setStatus('LỖI TẠO GHI CHÚ QUA D-BUS · xem journalctl');
            });
    }

    async _chooseImage() {
        if (!this._service || !this._alive) {
            this._setStatus('BACKEND OFFLINE · không thể nhập ảnh');
            return;
        }
        if (this._imagePicker)
            return;
        if (!GLib.find_program_in_path('zenity')) {
            this._setStatus('Cần cài Zenity · sudo dnf install zenity');
            return;
        }

        try {
            // Native GTK file-picker process, NOT an overlay or GNOME Shell
            // synchronous file chooser. It does not block compositor input.
            const process = Gio.Subprocess.new([
                'zenity', '--file-selection',
                '--title=Nhập ảnh vào Evidence Note Board',
                '--file-filter=Images | *.png *.PNG *.jpg *.jpeg *.JPG *.JPEG *.webp *.WEBP',
            ], Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE);
            this._imagePicker = process;
            const [ok, stdout] = await new Promise((resolve, reject) => {
                process.communicate_utf8_async(null, null, (proc, result) => {
                    try {
                        resolve(proc.communicate_utf8_finish(result));
                    } catch (error) {
                        reject(error);
                    }
                });
            });
            if (!this._alive || this._imagePicker !== process)
                return;
            if (!ok || !process.get_successful())
                return; // User cancelled; no error.
            const selected = stdout.trim();
            if (!selected)
                return;
            const at = screenToWorld(this._view, {
                x: this._root.width / 2,
                y: this._root.height / 2,
            });
            this._setStatus('Đang nhập ảnh vào bộ nhớ cục bộ…');
            const note = await this._service.importImage(selected, at.x, at.y);
            if (!this._alive)
                return;
            try {
                this._renderNote(note);
                this._setStatus('PHASE 3 · ĐÃ NHẬP ẢNH VÀO SQLITE');
            } catch (error) {
                console.error(error, 'Evidence Note Board: image saved but render failed');
                this._setStatus('ẢNH ĐÃ LƯU, LỖI HIỂN THỊ · xem journalctl');
            }
        } catch (error) {
            if (this._alive) {
                console.warn('Evidence Note Board: image import failed', error.message);
                this._setStatus('LỖI NHẬP ẢNH · kiểm tra Zenity và backend');
            }
        } finally {
            this._imagePicker = null;
        }
    }

    async _openDropWindow() {
        if (!this._service || !this._alive) {
            this._setStatus('BACKEND OFFLINE · không thể thả ảnh');
            return;
        }
        if (this._dropProcess)
            return;
        const helper = GLib.build_filenamev([
            GLib.get_user_data_dir(), 'gnome-shell', 'extensions',
            'evidence-note-board@mujin0422.github.io', 'image-drop-target.py',
        ]);
        if (!GLib.file_test(helper, GLib.FileTest.IS_REGULAR)) {
            this._setStatus('Thiếu image-drop-target.py · cài lại extension');
            return;
        }
        try {
            const process = Gio.Subprocess.new(
                ['python3', helper],
                Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE,
            );
            this._dropProcess = process;
            this._setStatus('Kéo ảnh từ Files vào cửa sổ THẢ ẢNH');
            const [ok, stdout] = await new Promise((resolve, reject) => {
                process.communicate_utf8_async(null, null, (proc, result) => {
                    try {
                        resolve(proc.communicate_utf8_finish(result));
                    } catch (error) {
                        reject(error);
                    }
                });
            });
            if (!this._alive || this._dropProcess !== process)
                return;
            if (!ok || !process.get_successful() || !stdout.trim())
                return; // Closing GTK drop window without a file is cancel.
            const paths = JSON.parse(stdout);
            if (!Array.isArray(paths) || paths.length === 0)
                return;
            const origin = screenToWorld(this._view, {
                x: this._root.width / 2,
                y: this._root.height / 2,
            });
            let added = 0;
            for (const path of paths.slice(0, 12)) {
                if (typeof path !== 'string' || !GLib.path_is_absolute(path))
                    continue;
                try {
                    const image = await this._service.importImage(path,
                        origin.x + 26 * added, origin.y + 26 * added);
                    if (!this._alive)
                        return;
                    this._renderNote(image);
                    added++;
                } catch (error) {
                    console.warn('Evidence Note Board: dropped image import failed', error.message);
                }
            }
            this._setStatus(`PHASE 3 · đã nhập ${added}/${Math.min(paths.length, 12)} ảnh`);
        } catch (error) {
            console.warn('Evidence Note Board: GTK drop window failed', error.message);
            if (this._alive)
                this._setStatus('LỖI CỬA SỔ THẢ ẢNH · cài python3-gobject gtk4');
        } finally {
            this._dropProcess = null;
        }
    }

    _duplicatePhoto(note) {
        if (!this._service || !this._alive)
            return;
        const offset = 30;
        this._service.duplicateImage(note.id, note.x + offset, note.y + offset)
            .then(copy => {
                if (this._alive) {
                    this._renderNote(copy);
                    this._setStatus('PHASE 3 · đã nhân bản ảnh');
                }
            }).catch(error => {
                console.warn('Evidence Note Board: duplicate failed', error.message);
                this._setStatus('LỖI NHÂN BẢN ẢNH · xem journalctl');
            });
    }

    _rotatePhoto(note, by) {
        if (!this._service || !this._alive)
            return;
        const before = note.rotation;
        note.rotation = rotateBy(note.rotation, by);
        this._applyGeometry(note);
        this._service.updateGeometry(note.id, note.width, note.height, note.rotation)
            .catch(error => {
                note.rotation = before;
                this._applyGeometry(note);
                console.warn('Evidence Note Board: rotate failed', error.message);
                this._saveError();
            });
    }

    _startResize(event, note) {
        if (event.get_button() !== 1 || !this._service || !this._beginGrab())
            return Clutter.EVENT_PROPAGATE;
        const [x, y] = event.get_coords();
        this._resizeSession = {note, startX: x, startWidth: note.width, startHeight: note.height};
        this._dragPoint = {x, y};
        return Clutter.EVENT_STOP;
    }

    _applyGeometry(note) {
        const item = this._notes.get(note.id);
        if (!item)
            return;
        item.actor.set_size(note.width, note.height);
        if (note.type === 'image') {
            item.actor.set_pivot_point(0.5, 0.5);
            item.actor.set_rotation_angle(Clutter.RotateAxis.Z_AXIS, note.rotation);
            item.photo?.set_size(Math.max(60, note.width - 24), Math.max(60, note.height - 48));
            if (item.photo)
                item.photo.icon_size = Math.round(Math.max(64, note.width - 24));
        } else if (item.body) {
            item.body.set_size(Math.max(120, note.width - 32),
                Math.max(90, note.height - 85));
        }
    }

    _syncTextHeight(note) {
        const item = this._notes.get(note.id);
        if (!item?.body || !this._alive)
            return;
        // The Pango layout reflects wrapped lines at the allocated body width.
        const layout = item.body.get_layout();
        if (!layout)
            return;
        const [, pixels] = layout.get_pixel_size();
        const required = requiredPaperHeight(pixels);
        if (note.height !== required) {
            note.height = required;
            this._applyGeometry(note);
            this._scheduleNote(note.id);
        }
    }

    _renderImageNote(note) {
        if (!this._alive || this._notes.has(note.id))
            return;
        if (!note.asset_path)
            throw new Error('Image note has no local asset path');
        const paper = new St.BoxLayout({
            reactive: true,
            orientation: Clutter.Orientation.VERTICAL,
            style_class: 'evidence-photo',
        });
        paper.set_size(note.width, note.height);
        paper.set_position(note.x, note.y);
        const header = new St.BoxLayout({reactive: true, style_class: 'evidence-photo-header'});
        const handle = new St.Label({
            text: '● ẢNH',
            reactive: true,
            style_class: 'evidence-note-handle',
        });
        handle.connect('button-press-event', (_actor, event) => this._startNoteDrag(event, note));
        header.add_child(handle);
        const remove = new St.Button({label: '×', style_class: 'evidence-delete'});
        remove.connect('clicked', () => {
            if (remove.label !== 'Xóa?') {
                remove.set_label('Xóa?');
                return;
            }
            this._service?.deleteNote(note.id).then(() => {
                if (this._alive) {
                    this._notes.get(note.id)?.actor.destroy();
                    this._notes.delete(note.id);
                }
            }).catch(() => this._saveError());
        });
        header.add_child(remove);
        const rotateLeft = new St.Button({label: '↶', style_class: 'evidence-photo-action'});
        rotateLeft.connect('clicked', () => this._rotatePhoto(note, -15));
        header.add_child(rotateLeft);
        const rotateRight = new St.Button({label: '↷', style_class: 'evidence-photo-action'});
        rotateRight.connect('clicked', () => this._rotatePhoto(note, 15));
        header.add_child(rotateRight);
        const duplicate = new St.Button({label: '⧉', style_class: 'evidence-photo-action'});
        duplicate.connect('clicked', () => this._duplicatePhoto(note));
        header.add_child(duplicate);
        const resize = new St.Label({text: '↘', reactive: true, style_class: 'evidence-resize-handle'});
        resize.connect('button-press-event', (_actor, event) => this._startResize(event, note));
        header.add_child(resize);
        paper.add_child(header);
        const photo = new St.Icon({
            gicon: new Gio.FileIcon({file: Gio.File.new_for_path(note.asset_path)}),
            icon_size: Math.max(64, Math.round(note.width - 24)),
            style_class: 'evidence-photo-image',
            reactive: false,
        });
        photo.set_size(note.width - 24, note.height - 48);
        paper.add_child(photo);
        this._notes.set(note.id, {note, actor: paper, photo});
        this._world.add_child(paper);
        this._applyGeometry(note);
    }

    _press(event) {
        if (!this._service)
            return Clutter.EVENT_PROPAGATE;

        if (event.get_button() === 1) {
            const [x, y] = event.get_coords();
            // The event source can differ from the root even for a blank
            // background click on GNOME Classic. Decide from screen/world
            // geometry instead; don't intercept clicks inside note editors.
            const uiRects = [
                {x: 0, y: 0, width: 600, height: 145},
            ];
            for (const actor of [this._hud, this._createButton, this._imageButton, this._dropButton]) {
                if (!actor)
                    continue;
                const [ax, ay] = actor.get_position();
                const [width, height] = actor.get_size();
                uiRects.push({x: ax, y: ay, width, height});
            }
            const notes = Array.from(this._notes.values(), item => item.note);
            if (!isEmptyBoardPoint(this._view, {x, y}, notes, uiRects)) {
                this._doubleClick.reset();
                return Clutter.EVENT_PROPAGATE;
            }
            // GNOME Shell 50 exposes get_time()/get_coords(), not a
            // click-count method. Treat two nearby presses as a gesture.
            if (this._doubleClick.register(event.get_time(), x, y)) {
                this._createNoteAtScreen(x, y);
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        }

        this._doubleClick.reset();
        if (event.get_button() !== 2 || !this._beginGrab())
            return Clutter.EVENT_PROPAGATE;
        const [x, y] = event.get_coords();
        this._dragPoint = {x, y};
        return Clutter.EVENT_STOP;
    }

    _beginGrab() {
        if (this._grab)
            return false;
        try {
            this._grab = global.stage.grab(this._root);
            return !!this._grab;
        } catch (error) {
            console.warn('Evidence Note Board: pointer grab unavailable', error.message);
            this._grab = null;
            return false;
        }
    }

    _startNoteDrag(event, note) {
        if (event.get_button() !== 1 || !this._service || !this._beginGrab())
            return Clutter.EVENT_PROPAGATE;
        const [x, y] = event.get_coords();
        this._dragPoint = {x, y};
        this._dragNote = note;
        return Clutter.EVENT_STOP;
    }

    _motion(event) {
        if (!this._dragPoint)
            return Clutter.EVENT_PROPAGATE;
        const [x, y] = event.get_coords();
        if (this._resizeSession) {
            const {note, startX, startWidth, startHeight} = this._resizeSession;
            if (note.type === 'image') {
                const size = resizedImage(startWidth, startHeight,
                    x - startX, this._view.zoom);
                note.width = size.width;
                note.height = size.height;
            } else {
                note.width = resizedTextWidth(startWidth,
                    x - startX, this._view.zoom);
            }
            this._applyGeometry(note);
            if (note.type === 'text')
                this._syncTextHeight(note);
            return Clutter.EVENT_STOP;
        }
        const dx = x - this._dragPoint.x;
        const dy = y - this._dragPoint.y;
        if (this._dragNote) {
            this._dragNote.x += dx / this._view.zoom;
            this._dragNote.y += dy / this._view.zoom;
            this._notes.get(this._dragNote.id)?.actor.set_position(
                this._dragNote.x, this._dragNote.y);
        } else {
            this._view = panBy(this._view, dx, dy);
            this._applyView();
            this._scheduleView();
        }
        this._dragPoint = {x, y};
        return Clutter.EVENT_STOP;
    }

    _release(event) {
        if (!this._dragPoint)
            return Clutter.EVENT_PROPAGATE;
        if (this._resizeSession && event.get_button() === 1) {
            const {note} = this._resizeSession;
            this._endDrag();
            this._service?.updateGeometry(note.id, note.width, note.height, note.rotation)
                .catch(() => this._saveError());
            return Clutter.EVENT_STOP;
        }
        if (this._dragNote && event.get_button() === 1) {
            const note = this._dragNote;
            this._endDrag();
            this._service?.moveNote(note.id, note.x, note.y).catch(() => this._saveError());
            return Clutter.EVENT_STOP;
        }
        if (!this._dragNote && event.get_button() === 2) {
            this._endDrag();
            return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
    }

    _endDrag() {
        this._resizeSession = null;
        this._dragPoint = null;
        this._dragNote = null;
        this._grab?.dismiss();
        this._grab = null;
    }

    _renderNote(note, focus = false) {
        if (note.type === 'image')
            return this._renderImageNote(note);
        if (!this._alive || this._notes.has(note.id))
            return;

        const paper = new St.BoxLayout({
            reactive: true,
            orientation: Clutter.Orientation.VERTICAL,
            style_class: 'evidence-paper evidence-paper-aged',
        });
        paper.set_size(note.width, note.height);
        paper.set_position(note.x, note.y);

        // The pin/drag handle remains separate from the editable paper area.
        const bar = new St.BoxLayout({
            reactive: true,
            style_class: 'evidence-note-header',
        });
        const handle = new St.Label({
            text: '●  KÉO ĐỂ DI CHUYỂN',
            reactive: true,
            style_class: 'evidence-note-handle',
        });
        handle.connect('button-press-event',
            (_actor, event) => this._startNoteDrag(event, note));
        bar.add_child(handle);

        const remove = new St.Button({
            label: '×',
            style_class: 'evidence-delete',
        });
        remove.connect('clicked', () => {
            if (remove.label !== 'Xóa?') {
                remove.set_label('Xóa?');
                return;
            }
            this._flushNote(note.id);
            this._service?.deleteNote(note.id).then(() => {
                if (this._alive) {
                    this._notes.get(note.id)?.actor.destroy();
                    this._notes.delete(note.id);
                }
            }).catch(() => this._saveError());
        });
        bar.add_child(remove);
        const resize = new St.Label({
            text: '↔', reactive: true, style_class: 'evidence-resize-handle',
        });
        resize.connect('button-press-event', (_actor, event) => this._startResize(event, note));
        bar.add_child(resize);
        paper.add_child(bar);

        // One editable multiline field directly on the paper: no St.Entry,
        // CSS textbox, title row or visually separate editor background.
        // Previously saved titles are shown as body text until migrated.
        const ink = new Cogl.Color();
        ink.init_from_4f(81 / 255, 72 / 255, 55 / 255, 1.0);
        const body = new Clutter.Text({
            text: bodyTextForNote(note),
            reactive: true,
            editable: true,
            selectable: true,
            cursor_visible: true,
            single_line_mode: false,
            activatable: false,
            line_wrap: true,
            line_wrap_mode: Pango.WrapMode.WORD_CHAR,
            color: ink,
        });
        // Fill the paper below the handle, including when initially empty.
        body.set_size(
            Math.max(120, note.width - 32),
            Math.max(90, note.height - 85)
        );
        body.connect('button-press-event', () => {
            global.stage.set_key_focus(body);
            return Clutter.EVENT_PROPAGATE;
        });
        paper.add_child(body);
        // Clicking unoccupied paper padding should also focus the editor.
        paper.connect('button-press-event', (_actor, event) => {
            if (event.get_button() === 1 && event.get_source() === paper) {
                global.stage.set_key_focus(body);
                body.set_cursor_position(-1);
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });

        body.connect('notify::text', () => {
            this._syncTextHeight(note);
            this._scheduleNote(note.id);
        });
        this._notes.set(note.id, {note, actor: paper, body});
        this._world.add_child(paper);
        // Measure after allocation; Pango may not know the final width
        // immediately when an actor is first placed on the board.
        GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            if (this._alive && this._notes.has(note.id))
                this._syncTextHeight(note);
            return GLib.SOURCE_REMOVE;
        });

        if (focus) {
            global.stage.set_key_focus(body);
            body.set_cursor_position(-1);
        }

        // Compat with the previously deployed two-column SQLite model.
        // Never discard a user's old title. Debounce saves it to content,
        // clears title and keeps the same note ID without a DB migration.
        if (hasLegacyTitle(note))
            this._scheduleNote(note.id);
    }

    _scheduleNote(id) {
        if (!this._service || !this._alive)
            return;
        this._cancelNoteTimer(id);
        const source = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
            this._timers.delete(id);
            this._flushNote(id);
            return GLib.SOURCE_REMOVE;
        });
        this._timers.set(id, source);
    }

    _flushNote(id) {
        this._cancelNoteTimer(id);
        const item = this._notes.get(id);
        if (!item || !this._service)
            return;
        if (!item.body) // Image notes contain no editable text.
            return;
        const content = item.body.get_text();
        // Persist geometry alongside content, preserving edit ordering.
        this._service.updateGeometry(id, item.note.width, item.note.height, item.note.rotation)
            .catch(() => this._saveError());
        // Leave the existing DB schema and D-Bus signature intact while
        // using an empty legacy title for body-only notes.
        this._service.updateNote(id, '', content).catch(() => this._saveError());
    }

    _cancelNoteTimer(id) {
        const source = this._timers.get(id);
        if (source)
            GLib.Source.remove(source);
        this._timers.delete(id);
    }

    destroy() {
        this._alive = false;
        this._connectionRevision++;
        if (this._backendWatchId) {
            Gio.bus_unwatch_name(this._backendWatchId);
            this._backendWatchId = 0;
        }
        this._imagePicker?.force_exit();
        this._imagePicker = null;
        this._dropProcess?.force_exit();
        this._dropProcess = null;
        this._doubleClick.reset();
        this._endDrag();
        for (const id of [...this._timers.keys()])
            this._flushNote(id);
        if (this._viewTimer) {
            GLib.Source.remove(this._viewTimer);
            this._viewTimer = 0;
            this._persistView();
        }
        if (this._monitorSignal) {
            Main.layoutManager.disconnect(this._monitorSignal);
            this._monitorSignal = 0;
        }
        if (this._backgroundSignal && this._backgroundGroup) {
            this._backgroundGroup.disconnect(this._backgroundSignal);
            this._backgroundSignal = 0;
        }
        for (const id of this._stageSignals)
            global.stage.disconnect(id);
        this._stageSignals = [];
        this._notes.clear();
        this._root?.destroy();
        this._root = null;
        this._world = null;
        this._hud = null;
        this._createButton = null;
        this._service = null;
        this._backgroundGroup = null;
    }
}
