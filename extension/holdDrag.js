// Pure hold-to-move thresholds shared between GNOME input handling and tests.
// Quick mouse drags select text; a stationary long press moves the paper.
export const TEXT_HOLD_MS = 330;
export const TEXT_SLOP_PX = 7;

export function keepTextHold(start, current, leftButtonDown) {
    if (!leftButtonDown || !start || !current)
        return false;
    if (![start.x,start.y,current.x,current.y].every(Number.isFinite))
        return false;
    return Math.hypot(current.x-start.x,current.y-start.y) <= TEXT_SLOP_PX;
}
