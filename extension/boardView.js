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
import {PIN_SIZE, pinPosition} from './pinMath.js';
import {pinCenter, menuNearPin, stringControlPoints, nearestTargetPin}
    from './stringMath.js';
import {resizedTextWidth, resizedImage, requiredPaperHeight, gestureAt, pointerAngle, angleDelta, normalizeAngle} from './geometry.js';

const INITIAL_VIEW = Object.freeze({zoom: 1, panX: 0, panY: 0});

export class BoardView {
    constructor() {
        this._root = null;
        this._world = null;
        this._hud = null;
        this._createButton = null;
        this._imageButton = null;
        this._imagePicker = null;
        this._resizeSession = null;
        this._pinMenu = null;
        this._stringsLayer = null;
        this._connections = new Map();
        this._stringDraft = null;
        this._deletingNotes = new Set();
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
        // A single non-reactive Cairo surface BELOW the notes and pins.
        // Avoid Clutter.Canvas (removed in modern Mutter).
        this._stringsLayer = new St.DrawingArea({reactive: false});
        this._stringsLayer.set_size(4000, 3000);
        this._stringsLayer.connect('repaint', area => this._paintStrings(area));
        this._world.add_child(this._stringsLayer);

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
        // Capturing at the Stage sees button release BEFORE a pin can consume
        // it. Fixes the cursor-stuck-to-pin regression at source.
        this._stageSignals.push(global.stage.connect('captured-event',
            (_actor, event) => this._capturedPointer(event)));

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
        const [notes, view, connections] = await Promise.all([
            service.listNotes(), service.getView(), service.listConnections(),
        ]);
        // A backend restart or extension disable invalidates in-flight RPCs.
        if (!this._alive || revision !== this._connectionRevision)
            return;
        this._service = service;
        this._connections = new Map(connections.map(c => [c.id, c]));
        this._queueStrings();
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
        this._positionPinMenu();
    }

    _applyView() {
        if (!this._world)
            return;
        this._world.set_scale(this._view.zoom, this._view.zoom);
        this._world.set_position(this._view.panX, this._view.panY);
        if (this._service)
            this._setStatus('Ctrl+Wheel: zoom · chuột giữa: pan');
        this._positionPinMenu();
        this._queueStrings();
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

    _applyGeometry(note) {
        const item = this._notes.get(note.id);
        if (!item)
            return;
        item.actor.set_size(note.width, note.height);
        if (item.pin) {
            const point = pinPosition(note);
            item.pin.set_position(point.x, point.y);
        }
        if (this._pinMenu?.noteId === note.id)
            this._positionPinMenu();
        this._queueStrings();
        item.actor.set_pivot_point(0.5, 0.5);
        item.actor.set_rotation_angle(Clutter.RotateAxis.Z_AXIS, note.rotation);
        if (note.type === 'image') {
            item.photo?.set_size(Math.max(60, note.width - 24),
                Math.max(60, note.height - 48));
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

    _installPin(note) {
        const item = this._notes.get(note.id);
        if (!item)
            return;
        // A separate world actor prevents paper resize/edit handlers from
        // intercepting pin drag or its right-click context menu.
        const pin = new St.Widget({
            reactive: true, can_focus: true,
            layout_manager: new Clutter.FixedLayout(),
            style_class: 'evidence-pin-hit-area',
        });
        pin.set_size(PIN_SIZE, PIN_SIZE);
        for (const [style, x, y, width, height] of [
            ['evidence-pin-stem', 18, 25, 4, 13],
            ['evidence-pin-shadow', 5, 4, 31, 30],
            ['evidence-pin-metal', 6, 3, 28, 28],
            ['evidence-pin-head', 9, 6, 22, 22],
            ['evidence-pin-glint', 13, 9, 7, 5],
        ]) {
            const layer = new St.Widget({reactive: false, style_class: style});
            layer.set_size(width, height);
            layer.set_position(x, y);
            pin.add_child(layer);
        }
        pin.connect('button-press-event', (_actor, event) => {
            this._doubleClick.reset();
            if (event.get_button() === 1) {
                this._closePinMenu();
                // Shift+drag from pin A onto pin B OR Shift+click A then
                // click B adds a red string. Both modes are supported.
                if (this._stringDraft) {
                    if (note.id !== this._stringDraft.sourceId)
                        this._completeString(note.id);
                    else
                        this._cancelString();
                    return Clutter.EVENT_STOP;
                }
                if (event.get_state() & Clutter.ModifierType.SHIFT_MASK) {
                    this._startString(note, event);
                    return Clutter.EVENT_STOP;
                }
                return this._startNoteDrag(event, note);
            }
            if (event.get_button() === 3) {
                this._togglePinMenu(note);
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_STOP;
        });
        pin.connect('button-release-event', () => Clutter.EVENT_STOP);
        item.pin = pin;
        this._world.add_child(pin);
        const point = pinPosition(note);
        pin.set_position(point.x, point.y);
    }

    _closePinMenu() {
        if (!this._pinMenu)
            return;
        this._pinMenu.actor.destroy();
        this._pinMenu = null;
    }

    _positionPinMenu() {
        if (!this._pinMenu || !this._root)
            return;
        const {actor, noteId} = this._pinMenu;
        const note = this._notes.get(noteId)?.note;
        if (!note)
            return;
        const point = menuNearPin(note, this._view,
            {width: this._root.width, height: this._root.height},
            actor.width, actor.height);
        actor.set_position(point.x, point.y);
    }

    _togglePinMenu(note) {
        if (this._pinMenu?.noteId === note.id) {
            this._closePinMenu();
            return;
        }
        this._closePinMenu();
        this._cancelString();
        // IMPORTANT: menu is a SCREEN-SPACE overlay. It is not scaled or
        // translated by _world, so the pin-to-menu gap is always 5 px.
        const menu = new St.BoxLayout({
            reactive: true,
            orientation: Clutter.Orientation.VERTICAL,
            style_class: 'evidence-pin-menu',
        });
        const related = [...this._connections.values()].filter(c =>
            c.source_note_id === note.id || c.target_note_id === note.id);
        menu.add_child(new St.Label({
            text: note.type === 'image' ? 'ẢNH ĐÃ GHIM' : 'GHI CHÚ ĐÃ GHIM',
            reactive: false, style_class: 'evidence-pin-menu-title',
        }));
        // Removing a STRING does not delete either endpoint.
        for (let i = 0; i < Math.min(related.length, 6); i++) {
            const connection = related[i];
            const detach = new St.Button({
                label: `Tháo dây đỏ #${i + 1}`,
                can_focus: true, style_class: 'evidence-pin-cancel',
            });
            detach.connect('clicked', () => this._removeString(connection.id));
            menu.add_child(detach);
        }
        const remove = new St.Button({
            label: note.type === 'image' ? 'Xóa ảnh' : 'Xóa ghi chú',
            can_focus: true, style_class: 'evidence-pin-delete',
        });
        let armed = false;
        remove.connect('clicked', () => {
            if (!armed) {
                armed = true;
                remove.set_label('Xác nhận xóa');
                remove.add_style_pseudo_class('confirm');
                return;
            }
            this._deletePinnedNote(note);
        });
        menu.add_child(remove);
        const cancel = new St.Button({
            label: 'Hủy', can_focus: true, style_class: 'evidence-pin-cancel',
        });
        cancel.connect('clicked', () => this._closePinMenu());
        menu.add_child(cancel);
        menu.set_size(198, 118 + 34 * Math.min(related.length, 6));
        this._root.add_child(menu);
        this._pinMenu = {noteId: note.id, actor: menu};
        this._positionPinMenu();
    }

    _startString(note, event) {
        const [x, y] = event.get_coords();
        this._stringDraft = {sourceId: note.id,
            target: {x: (x - this._view.panX) / this._view.zoom,
                y: (y - this._view.panY) / this._view.zoom}};
        this._setStatus('DÂY ĐỎ · kéo sang pin khác hoặc nhấp pin đích · Esc hủy');
        this._queueStrings();
    }

    _cancelString() {
        if (!this._stringDraft)
            return;
        this._stringDraft = null;
        this._queueStrings();
    }

    _completeString(targetId) {
        const draft = this._stringDraft;
        if (!draft || draft.sourceId === targetId || !this._service)
            return;
        this._cancelString();
        this._service.createConnection(draft.sourceId, targetId)
            .then(edge => {
                if (!this._alive) return;
                this._connections.set(edge.id, edge);
                this._queueStrings();
                this._setStatus('PHASE 4 · ĐÃ NỐI DÂY ĐỎ');
            }).catch(error => {
                console.warn('Evidence Board: could not save string', error.message);
                if (this._alive)
                    this._setStatus('LỖI NỐI DÂY · xem journalctl');
            });
    }

    _removeString(id) {
        if (!this._service)
            return;
        this._service.deleteConnection(id).then(() => {
            if (!this._alive) return;
            this._connections.delete(id);
            this._closePinMenu();
            this._queueStrings();
            this._setStatus('PHASE 4 · ĐÃ THÁO DÂY ĐỎ');
        }).catch(() => this._saveError());
    }

    _queueStrings() {
        this._stringsLayer?.queue_repaint();
    }

    _paintStrings(area) {
        const cr = area.get_context();
        try {
            const draw = (a, b, isDraft = false) => {
                const g = stringControlPoints(a, b);
                cr.moveTo(g.a.x, g.a.y);
                cr.curveTo(g.c1.x, g.c1.y, g.c2.x, g.c2.y, g.b.x, g.b.y);
                cr.setSourceRGBA(0.12, 0.015, 0.015, 0.8);
                cr.setLineWidth(isDraft ? 4.6 : 5.2);
                cr.strokePreserve();
                cr.setSourceRGBA(0.72, 0.08, 0.09, isDraft ? 0.68 : 0.96);
                cr.setLineWidth(isDraft ? 2.2 : 2.8);
                cr.stroke();
            };
            for (const edge of this._connections.values()) {
                const a = this._notes.get(edge.source_note_id)?.note;
                const b = this._notes.get(edge.target_note_id)?.note;
                if (a && b)
                    draw(pinCenter(a), pinCenter(b));
            }
            if (this._stringDraft) {
                const start = this._notes.get(this._stringDraft.sourceId)?.note;
                if (start)
                    draw(pinCenter(start), this._stringDraft.target, true);
            }
        } finally {
            cr.$dispose();
        }
    }

    _deletePinnedNote(note) {
        if (!this._service || !this._alive || this._deletingNotes.has(note.id))
            return;
        const id = note.id;
        this._deletingNotes.add(id);
        // NoteService serializes queued UpdateNote/UpdateGeometry/DeleteNote.
        this._flushNote(id);
        this._service.deleteNote(id).then(() => {
            if (!this._alive)
                return;
            this._closePinMenu();
            this._cancelNoteTimer(id);
            for (const [edgeId, edge] of this._connections) {
                if (edge.source_note_id === id || edge.target_note_id === id)
                    this._connections.delete(edgeId);
            }
            if (this._stringDraft?.sourceId === id)
                this._cancelString();
            this._queueStrings();
            const item = this._notes.get(id);
            if (item) {
                item.pin?.destroy();
                item.actor.destroy();
                this._notes.delete(id);
            }
            this._setStatus('PHASE 4 · đã xóa qua pin');
        }).catch(error => {
            console.warn('Evidence Note Board: pin deletion failed', error.message);
            if (this._alive)
                this._setStatus('LỖI XÓA QUA D-BUS · xem journalctl');
        }).finally(() => this._deletingNotes.delete(id));
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
        // Icons are square by design. Use an image texture and aspect
        // gravity instead so wide/tall photographs retain their shape.
        const texture = St.TextureCache.get_default();
        const file = Gio.File.new_for_path(note.asset_path);
        const paintScale = St.ThemeContext.get_for_stage(global.stage).scaleFactor;
        const photo = texture.load_file_async(file, -1, -1, paintScale, 1.0);
        photo.set_content_gravity(Clutter.ContentGravity.RESIZE_ASPECT);
        photo.set_reactive(false);
        photo.set_size(Math.max(60, note.width - 24),
            Math.max(60, note.height - 48));
        paper.add_child(photo);

        this._notes.set(note.id, {note, actor: paper, photo});
        this._world.add_child(paper);
        this._connectPaperGestures(paper, note);
        this._installPin(note);
        this._applyGeometry(note);
    }

    _press(event) {
        if (!this._service)
            return Clutter.EVENT_PROPAGATE;

        if (event.get_button() === 1) {
            const [x, y] = event.get_coords();
            if (this._pinMenu) {
                const {actor} = this._pinMenu;
                const inside = x >= actor.x && y >= actor.y &&
                    x <= actor.x + actor.width && y <= actor.y + actor.height;
                if (inside) {
                    this._doubleClick.reset();
                    return Clutter.EVENT_PROPAGATE;
                }
                this._closePinMenu();
            }
            // The event source can differ from the root even for a blank
            // background click on GNOME Classic. Decide from screen/world
            // geometry instead; don't intercept clicks inside note editors.
            const uiRects = [
                {x: 0, y: 0, width: 420, height: 145},
            ];
            for (const actor of [this._hud, this._createButton, this._imageButton]) {
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
        // Stage event capture sees mouse-up even when pin's own release
        // signal returns STOP. Do NOT grab the root for pin dragging:
        // the old grab swallowed the release and left notes stuck.
        if (event.get_button() !== 1 || !this._service || this._dragPoint)
            return Clutter.EVENT_PROPAGATE;
        const [x, y] = event.get_coords();
        this._dragPoint = {x, y};
        this._dragNote = note;
        return Clutter.EVENT_STOP;
    }

    _startPaperGesture(event, note, paper) {
        if (event.get_button() !== 1 || !this._service)
            return Clutter.EVENT_PROPAGATE;
        const [x, y] = event.get_coords();
        // The local point respects canvas zoom/pan and actor rotation.
        const [ok, lx, ly] = paper.transform_stage_point(x, y);
        if (!ok)
            return Clutter.EVENT_PROPAGATE;
        const kind = gestureAt(lx, ly, note.width, note.height, note.type, this._view.zoom);
        if (kind === 'edit')
            return Clutter.EVENT_PROPAGATE;
        if (kind === 'drag')
            return Clutter.EVENT_STOP; // Phase 4: move by pin only.
        if (!this._beginGrab())
            return Clutter.EVENT_PROPAGATE;
        this._dragPoint = {x, y};
        this._resizeSession = {
            kind, note, startX: x, startWidth: note.width,
            startHeight: note.height, startRotation: note.rotation,
            startAngle: pointerAngle(x, y, note, this._view),
        };
        return Clutter.EVENT_STOP;
    }

    _connectPaperGestures(paper, note) {
        paper.connect('button-press-event', (_actor, event) => {
            const result = this._startPaperGesture(event, note, paper);
            if (result === Clutter.EVENT_STOP)
                return result;
            // Clicking blank inner paper should still focus the editor.
            if (event.get_button() === 1 && event.get_source() === paper &&
                note.type === 'text') {
                const body = this._notes.get(note.id)?.body;
                if (body) {
                    global.stage.set_key_focus(body);
                    body.set_cursor_position(-1);
                }
            }
            // Child Clutter.Text handles its own cursor. Do not let
            // note clicks reach the blank-board double-click recognizer.
            return event.get_button() === 1
                ? Clutter.EVENT_STOP : Clutter.EVENT_PROPAGATE;
        });
    }

    _capturedPointer(event) {
        if (!this._alive)
            return Clutter.EVENT_PROPAGATE;
        const type = event.type();
        if (type === Clutter.EventType.KEY_PRESS && this._stringDraft &&
            event.get_key_symbol() === Clutter.KEY_Escape) {
            this._cancelString();
            return Clutter.EVENT_STOP;
        }
        if (type === Clutter.EventType.MOTION) {
            const [x, y] = event.get_coords();
            if (this._dragPoint) {
                // Recover if release occurred outside the desktop actor.
                const button = this._dragNote || this._resizeSession
                    ? Clutter.ModifierType.BUTTON1_MASK
                    : Clutter.ModifierType.BUTTON2_MASK;
                if (!(event.get_state() & button)) {
                    const changed = this._releaseAsAborted();
                    return changed ? Clutter.EVENT_STOP : Clutter.EVENT_PROPAGATE;
                }
                return this._motion(event);
            }
            if (this._stringDraft) {
                this._stringDraft.target = {
                    x: (x - this._view.panX) / this._view.zoom,
                    y: (y - this._view.panY) / this._view.zoom,
                };
                this._queueStrings();
            }
        }
        if (type === Clutter.EventType.BUTTON_RELEASE) {
            if (this._dragPoint) {
                const result = this._release(event);
                if (result === Clutter.EVENT_STOP)
                    return result;
            }
            if (this._stringDraft && event.get_button() === 1) {
                const [x, y] = event.get_coords();
                const targetId = nearestTargetPin(
                    [...this._notes.values()].map(item => item.note),
                    this._view, {x, y}, this._stringDraft.sourceId);
                if (targetId) {
                    this._completeString(targetId);
                    return Clutter.EVENT_STOP;
                }
            }
        }
        return Clutter.EVENT_PROPAGATE;
    }

    _releaseAsAborted() {
        if (!this._dragPoint)
            return false;
        // Persist at the last valid position instead of leaving grab active.
        const note = this._dragNote;
        const resize = this._resizeSession?.note;
        this._endDrag();
        if (note)
            this._service?.moveNote(note.id, note.x, note.y)
                .catch(() => this._saveError());
        else if (resize)
            this._service?.updateGeometry(resize.id, resize.width,
                resize.height, resize.rotation).catch(() => this._saveError());
        return true;
    }

    _motion(event) {
        if (!this._dragPoint)
            return Clutter.EVENT_PROPAGATE;
        const [x, y] = event.get_coords();
        if (this._resizeSession) {
            const session = this._resizeSession;
            const {note, kind, startX, startWidth, startHeight} = session;
            if (kind === 'rotate') {
                const nextAngle = pointerAngle(x, y, note, this._view);
                note.rotation = normalizeAngle(session.startRotation +
                    angleDelta(session.startAngle, nextAngle));
            } else if (note.type === 'image') {
                const size = resizedImage(startWidth, startHeight,
                    x - startX, this._view.zoom);
                note.width = size.width;
                note.height = size.height;
            } else {
                note.width = resizedTextWidth(startWidth,
                    x - startX, this._view.zoom);
            }
            this._applyGeometry(note);
            if (note.type === 'text' && kind !== 'rotate')
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
            this._applyGeometry(this._dragNote);
            this._queueStrings();
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

        // The paper is entirely an editor; pin and context menu live
        // above it in separate world actors.

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
        // Border gestures do not interfere with the multiline editor.
        this._connectPaperGestures(paper, note);

        body.connect('notify::text', () => {
            this._syncTextHeight(note);
            this._scheduleNote(note.id);
        });
        this._notes.set(note.id, {note, actor: paper, body});
        this._world.add_child(paper);
        this._installPin(note);
        this._applyGeometry(note);
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
        this._cancelString();
        this._closePinMenu();
        this._deletingNotes.clear();
        this._connections.clear();
        this._stringsLayer = null;
        this._alive = false;
        this._connectionRevision++;
        if (this._backendWatchId) {
            Gio.bus_unwatch_name(this._backendWatchId);
            this._backendWatchId = 0;
        }
        this._imagePicker?.force_exit();
        this._imagePicker = null;
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
        for (const item of this._notes.values())
            item.pin?.destroy();
        this._notes.clear();
        this._root?.destroy();
        this._root = null;
        this._world = null;
        this._hud = null;
        this._createButton = null;
        this._imageButton = null;
        this._service = null;
        this._backgroundGroup = null;
    }
}
