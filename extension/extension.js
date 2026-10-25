import Clutter from 'gi://Clutter';
import St from 'gi://St';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {panBy, zoomAt} from './canvasMath.js';

const START_VIEW = Object.freeze({zoom: 1, panX: 0, panY: 0});

class BoardView {
    constructor() {
        this._root = null;
        this._world = null;
        this._hud = null;
        this._group = null;
        this._monitorsChangedId = 0;
        this._childAddedId = 0;
        this._view = {...START_VIEW};
        this._dragLast = null;
    }

    mount() {
        // GNOME Shell 50: the internal background group lives at the bottom
        // of global.window_group. It is NOT a stable public extension API.
        const group = Main.layoutManager._backgroundGroup;
        if (!group) {
            throw new Error('GNOME background group unavailable; aborting PoC');
        }

        this._group = group;
        this._root = new St.Widget({
            name: 'evidence-note-board',
            reactive: true,
            clip_to_allocation: true,
            layout_manager: new Clutter.FixedLayout(),
            style_class: 'evidence-board-root',
        });
        this._root.set_size(global.stage.width, global.stage.height);

        this._world = new St.Widget({
            reactive: false,
            layout_manager: new Clutter.FixedLayout(),
        });
        this._world.set_size(3000, 2200);
        this._world.set_pivot_point(0, 0);
        this._root.add_child(this._world);

        this._createExampleCards();

        this._hud = new St.Label({
            style_class: 'evidence-board-hud',
            reactive: false,
        });
        this._hud.set_position(26, 54);
        this._root.add_child(this._hud);
        this._updateView();

        this._root.connect('scroll-event', (_actor, event) => this._onScroll(event));
        this._root.connect('button-press-event', (_actor, event) => this._onPress(event));
        this._root.connect('motion-event', (_actor, event) => this._onMotion(event));
        this._root.connect('button-release-event', (_actor, event) => this._onRelease(event));

        // Insert above GNOME's own wallpaper actors, but below regular windows.
        group.add_child(this._root);
        group.set_child_above_sibling(this._root, null);
        this._childAddedId = group.connect('child-added', (_actor, child) => {
            if (child !== this._root && this._root?.get_parent() === group)
                group.set_child_above_sibling(this._root, null);
        });

        this._monitorsChangedId = Main.layoutManager.connect('monitors-changed',
            () => this._resizeToStage());
    }

    _createExampleCards() {
        const cards = [
            {x: 150, y: 180, color: 'aged', title: 'CASE FILE 001',
                text: 'Evidence Note Board\nTemporary demo card'},
            {x: 560, y: 335, color: 'ivory', title: 'DESKTOP PROOF',
                text: 'Ctrl + Wheel  ·  Zoom\nMiddle Drag  ·  Pan'},
        ];

        for (const card of cards) {
            const paper = new St.BoxLayout({
                reactive: false,
                vertical: true,
                style_class: `evidence-paper evidence-paper-${card.color}`,
            });
            paper.set_size(270, 160);
            paper.set_position(card.x, card.y);

            const pin = new St.Label({text: '●', style_class: 'evidence-pin'});
            const title = new St.Label({text: card.title, style_class: 'evidence-paper-title'});
            const content = new St.Label({text: card.text, style_class: 'evidence-paper-body'});
            paper.add_child(pin);
            paper.add_child(title);
            paper.add_child(content);
            this._world.add_child(paper);
        }
    }

    _resizeToStage() {
        if (this._root)
            this._root.set_size(global.stage.width, global.stage.height);
    }

    _updateView() {
        if (!this._world || !this._hud)
            return;
        this._world.set_scale(this._view.zoom, this._view.zoom);
        this._world.set_position(this._view.panX, this._view.panY);
        this._hud.set_text(
            `EVIDENCE BOARD  /  PoC  ·  ${Math.round(this._view.zoom * 100)}%  |  Ctrl+Wheel: zoom  ·  Middle drag: pan`
        );
    }

    _onScroll(event) {
        if (!(event.get_state() & Clutter.ModifierType.CONTROL_MASK))
            return Clutter.EVENT_PROPAGATE;

        const direction = event.get_scroll_direction();
        let factor = 1;

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

        const [x, y] = event.get_coords();
        this._view = zoomAt(this._view, {x, y}, this._view.zoom * factor);
        this._updateView();
        return Clutter.EVENT_STOP;
    }

    _onPress(event) {
        if (event.get_button() !== 2)
            return Clutter.EVENT_PROPAGATE;

        const [x, y] = event.get_coords();
        this._dragLast = {x, y};
        return Clutter.EVENT_STOP;
    }

    _onMotion(event) {
        if (!this._dragLast)
            return Clutter.EVENT_PROPAGATE;

        const [x, y] = event.get_coords();
        this._view = panBy(this._view,
            x - this._dragLast.x, y - this._dragLast.y);
        this._dragLast = {x, y};
        this._updateView();
        return Clutter.EVENT_STOP;
    }

    _onRelease(event) {
        if (event.get_button() !== 2 || !this._dragLast)
            return Clutter.EVENT_PROPAGATE;

        this._dragLast = null;
        return Clutter.EVENT_STOP;
    }

    destroy() {
        this._dragLast = null;
        if (this._monitorsChangedId) {
            Main.layoutManager.disconnect(this._monitorsChangedId);
            this._monitorsChangedId = 0;
        }
        if (this._childAddedId && this._group) {
            this._group.disconnect(this._childAddedId);
            this._childAddedId = 0;
        }
        this._root?.destroy();
        this._root = null;
        this._world = null;
        this._hud = null;
        this._group = null;
    }
}

export default class EvidenceNoteBoardExtension extends Extension {
    enable() {
        this._board = new BoardView();
        try {
            this._board.mount();
        } catch (error) {
            this._board.destroy();
            this._board = null;
            console.error(error, 'Evidence Note Board: failed to mount');
        }
    }

    disable() {
        this._board?.destroy();
        this._board = null;
    }
}
