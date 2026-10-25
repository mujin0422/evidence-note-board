import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {panBy, screenToWorld, zoomAt} from './canvasMath.js';
import {NoteService} from './noteService.js';

const INITIAL_VIEW = Object.freeze({zoom: 1, panX: 0, panY: 0});

export class BoardView {
    constructor() {
        this._root = null;
        this._world = null;
        this._hud = null;
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

        // Keep the shell responsive even when the user service is missing.
        this._connectBackend().catch(error => {
            if (this._alive) {
                console.warn('Evidence Note Board: backend connection failed', error.message);
                this._setStatus('BACKEND OFFLINE · chạy scripts/install-backend-dev.sh');
            }
        });
    }

    async _connectBackend() {
        const service = await NoteService.connect();
        const [notes, view] = await Promise.all([service.listNotes(), service.getView()]);
        if (!this._alive)
            return;
        this._service = service;
        if (Number.isFinite(view.zoom) && view.zoom >= 0.25 && view.zoom <= 3 &&
            Number.isFinite(view.pan_x) && Number.isFinite(view.pan_y)) {
            this._view = {zoom: view.zoom, panX: view.pan_x, panY: view.pan_y};
        }
        this._applyView();
        for (const note of notes)
            this._renderNote(note);
        this._setStatus('SẴN SÀNG · double-click: thêm note · kéo tiêu đề: di chuyển');
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

    _press(event) {
        if (!this._service)
            return Clutter.EVENT_PROPAGATE;

        if (event.get_button() === 1 &&
            event.get_click_count() === 2 &&
            event.get_source() === this._root) {
            const [x, y] = event.get_coords();
            const at = screenToWorld(this._view, {x, y});
            this._service.createNote('Ghi chú mới', '', at.x, at.y)
                .then(note => { if (this._alive) this._renderNote(note); })
                .catch(() => this._saveError());
            return Clutter.EVENT_STOP;
        }

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
        this._dragPoint = null;
        this._dragNote = null;
        this._grab?.dismiss();
        this._grab = null;
    }

    _renderNote(note) {
        if (!this._alive || this._notes.has(note.id))
            return;
        const paper = new St.BoxLayout({
            reactive: true,
            orientation: Clutter.Orientation.VERTICAL,
            style_class: 'evidence-paper evidence-paper-aged',
        });
        paper.set_size(note.width, note.height);
        paper.set_position(note.x, note.y);

        const bar = new St.BoxLayout({reactive: true, style_class: 'evidence-note-header'});
        const handle = new St.Label({
            text: '●  KÉO ĐỂ DI CHUYỂN', reactive: true, style_class: 'evidence-note-handle',
        });
        handle.connect('button-press-event', (_actor, event) => this._startNoteDrag(event, note));
        bar.add_child(handle);
        const remove = new St.Button({label: '×', style_class: 'evidence-delete'});
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
        paper.add_child(bar);

        const title = new St.Entry({
            text: note.title, can_focus: true, style_class: 'evidence-edit-title',
        });
        paper.add_child(title);

        // Clutter.Text supports multiline Unicode editing in GNOME Shell.
        const body = new Clutter.Text({
            text: note.content,
            editable: true,
            selectable: true,
            single_line_mode: false,
            line_wrap: true,
            line_wrap_mode: Pango.WrapMode.WORD_CHAR,
            color: new Clutter.Color({red: 81, green: 72, blue: 55, alpha: 255}),
        });
        body.set_size(228, 88);
        paper.add_child(body);
        title.clutter_text.connect('notify::text', () => this._scheduleNote(note.id));
        body.connect('notify::text', () => this._scheduleNote(note.id));

        this._notes.set(note.id, {note, actor: paper, title, body});
        this._world.add_child(paper);
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
        const title = item.title.get_text();
        const content = item.body.get_text();
        this._service.updateNote(id, title, content).catch(() => this._saveError());
    }

    _cancelNoteTimer(id) {
        const source = this._timers.get(id);
        if (source)
            GLib.Source.remove(source);
        this._timers.delete(id);
    }

    destroy() {
        this._alive = false;
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
        this._service = null;
        this._backgroundGroup = null;
    }
}
