// GNOME Shell lifecycle entry point. Keep this file deliberately small:
// BoardView owns actors, signals and cleanup; this class only mounts/unmounts it.
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import {BoardView} from './ui/boardView.js';

export default class EvidenceNoteBoardExtension extends Extension {
    // Create the board for the active user session.
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

    // Release every actor, timer, signal and D-Bus watcher on disable.
    disable() {
        this._board?.destroy();
        this._board = null;
    }
}
