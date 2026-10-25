// GNOME Shell 50's Clutter.Event does not provide get_click_count().
// Track the time and position of primary button presses on empty canvas.
// This module is GJS-independent so it can be unit-tested with Node.
export class DoubleClickTracker {
    constructor(maxDelayMs = 400, maxDistancePx = 12) {
        this._delay = maxDelayMs;
        this._distance2 = maxDistancePx * maxDistancePx;
        this._last = null;
    }

    register(time, x, y, mode = 'text') {
        if (![time, x, y].every(Number.isFinite)) {
            this.reset();
            return false;
        }

        const previous = this._last;
        this._last = {time, x, y, mode};
        if (!previous)
            return false;

        const elapsed = time - previous.time;
        const dx = x - previous.x;
        const dy = y - previous.y;
        if (previous.mode === mode && elapsed >= 0 && elapsed <= this._delay &&
            dx * dx + dy * dy <= this._distance2) {
            // Consuming the gesture ensures a third press cannot add a
            // duplicate note.
            this.reset();
            return true;
        }
        return false;
    }

    reset() {
        this._last = null;
    }
}
