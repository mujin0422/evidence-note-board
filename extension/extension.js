import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import {BoardView} from './boardView.js';

export default class EvidenceNoteBoardExtension extends Extension {
    enable() {
        // A failed mount must not leave actors or signal handlers behind.
        this._board = new BoardView();
        try {
            this._board.mount();
        } catch (error) {
            this._board.destroy();
            this._board = null;
            console.error(error, 'Evidence Note Board: cannot mount background board');
        }
    }

    disable() {
        this._board?.destroy();
        this._board = null;
    }
}
