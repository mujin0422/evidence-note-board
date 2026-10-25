import Clutter from 'gi://Clutter';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {panBy, zoomAt} from './canvasMath.js';

const INITIAL_VIEW = Object.freeze({zoom: 1, panX: 0, panY: 0});

// Technical PoC only. No notes are persisted and no GNOME APIs are monkey-patched.
// LayoutManager._backgroundGroup is private GNOME Shell implementation detail.
// Guard its presence and fail closed rather than placing an always-on-top window.
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
        this._view = {...INITIAL_VIEW};
    }

    mount() {
        const group = Main.layoutManager?._backgroundGroup;
        if (!group || typeof group.add_child !== 'function' ||
            typeof group.set_child_above_sibling !== 'function') {
            throw new Error('Unsupported GNOME Shell: no background actor group');
        }
        this._backgroundGroup = group;

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
        this._world.set_size(3000, 2200);
        this._world.set_pivot_point(0, 0);
        this._root.add_child(this._world);
        this._addIllustrations();

        this._hud = new St.Label({
            reactive: false,
            style_class: 'evidence-board-hud',
        });
        this._hud.set_position(24, 58);
        this._root.add_child(this._hud);
        this._resize();
        this._applyView();

        this._root.connect('scroll-event', (_actor, event) => this._scroll(event));
        this._root.connect('button-press-event', (_actor, event) => this._press(event));
        this._root.connect('motion-event', (_actor, event) => this._motion(event));
        this._root.connect('button-release-event', (_actor, event) => this._release(event));

        // Background actors are below ordinary windows in GNOME Shell 50's
        // global.window_group. Above wallpaper actors, NOT above app windows.
        group.add_child(this._root);
        this._raiseAboveWallpaper();

        // GNOME may recreate wallpaper actors after a monitor change.
        this._backgroundSignal = group.connect('child-added', (_group, child) => {
            if (child !== this._root)
                this._raiseAboveWallpaper();
        });
        this._monitorSignal = Main.layoutManager.connect('monitors-changed',
            () => this._resize());
        for (const signal of ['notify::width', 'notify::height']) {
            const id = global.stage.connect(signal, () => this._resize());
            this._stageSignals.push(id);
        }
    }

    _addIllustrations() {
        const samples = [
            {x: 140, y: 155, color: 'aged',
                title: 'CASE FILE 001',
                text: 'Evidence Note Board\nGhi chú minh hoạ · chưa lưu'},
            {x: 540, y: 305, color: 'ivory',
                title: 'DESKTOP LAYER',
                text: 'Ctrl + Wheel  ·  Zoom\nMiddle Drag  ·  Pan'},
        ];

        for (const sample of samples) {
            const paper = new St.BoxLayout({
                reactive: false,
                orientation: Clutter.Orientation.VERTICAL,
                style_class: `evidence-paper evidence-paper-${sample.color}`,
            });
            paper.set_size(270, 164);
            paper.set_position(sample.x, sample.y);
            paper.add_child(new St.Label({
                text: '●', style_class: 'evidence-pin', reactive: false,
            }));
            paper.add_child(new St.Label({
                text: sample.title, style_class: 'evidence-paper-title', reactive: false,
            }));
            paper.add_child(new St.Label({
                text: sample.text, style_class: 'evidence-paper-body', reactive: false,
            }));
            this._world.add_child(paper);
        }
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
        if (!this._world || !this._hud)
            return;
        this._world.set_scale(this._view.zoom, this._view.zoom);
        this._world.set_position(this._view.panX, this._view.panY);
        this._hud.set_text(
            `EVIDENCE BOARD  /  DEMO  ·  ${Math.round(this._view.zoom * 100)}%  ·  Ctrl+Wheel zoom  ·  Middle-drag pan`
        );
    }

    _scroll(event) {
        if (!(event.get_state() & Clutter.ModifierType.CONTROL_MASK))
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

        // event coords are stage coords. The root starts at (0, 0).
        const [x, y] = event.get_coords();
        this._view = zoomAt(this._view, {x, y}, this._view.zoom * factor);
        this._applyView();
        return Clutter.EVENT_STOP;
    }

    _press(event) {
        if (event.get_button() !== 2 || this._grab)
            return Clutter.EVENT_PROPAGATE;

        const [x, y] = event.get_coords();
        // Keep receiving motion/release even if the pointer leaves the board.
        // This grab lasts only until release or disable; no global hook.
        try {
            this._grab = global.stage.grab(this._root);
            if (!this._grab)
                return Clutter.EVENT_PROPAGATE;
        } catch (error) {
            console.warn('Evidence Note Board: middle-drag grab unavailable', error);
            this._grab = null;
            return Clutter.EVENT_PROPAGATE;
        }
        this._dragPoint = {x, y};
        return Clutter.EVENT_STOP;
    }

    _motion(event) {
        if (!this._dragPoint)
            return Clutter.EVENT_PROPAGATE;

        const [x, y] = event.get_coords();
        this._view = panBy(this._view,
            x - this._dragPoint.x, y - this._dragPoint.y);
        this._dragPoint = {x, y};
        this._applyView();
        return Clutter.EVENT_STOP;
    }

    _release(event) {
        if (event.get_button() !== 2 || !this._dragPoint)
            return Clutter.EVENT_PROPAGATE;
        this._endPan();
        return Clutter.EVENT_STOP;
    }

    _endPan() {
        this._dragPoint = null;
        this._grab?.dismiss();
        this._grab = null;
    }

    destroy() {
        this._endPan();
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
        this._root?.destroy();
        this._root = null;
        this._world = null;
        this._hud = null;
        this._backgroundGroup = null;
    }
}
