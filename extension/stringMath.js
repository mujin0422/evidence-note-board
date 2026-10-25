// Pure world-to-stage math for precise menu placement and string endpoints.
import {PIN_SIZE, pinPosition} from './pinMath.js';

export function pinCenter(note) {
    const at = pinPosition(note);
    return {x: at.x + PIN_SIZE / 2, y: at.y + PIN_SIZE / 2};
}

export function worldToScreen(view, point) {
    return {x: view.panX + point.x * view.zoom,
        y: view.panY + point.y * view.zoom};
}

// Menu is in SCREEN coordinates, not inside the world zoom actor. A fixed
// 5px gap is visible at both 25% and 300% zoom.
export function menuNearPin(note, view, viewport, width = 198, height = 136) {
    const pin = pinPosition(note);
    const anchor = worldToScreen(view, {
        x: pin.x + PIN_SIZE / 2,
        y: pin.y + PIN_SIZE,
    });
    const x = Math.max(4, Math.min(viewport.width - width - 4,
        anchor.x - width / 2));
    let y = anchor.y + 5;
    if (y + height > viewport.height - 4)
        y = anchor.y - PIN_SIZE * view.zoom - height - 5;
    // Pin may itself be outside the visible viewport after pan.
    // Keep the popover fully accessible on screen in all cases.
    y = Math.max(4, Math.min(viewport.height - height - 4, y));
    return {x, y};
}

export function stringControlPoints(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const sag = Math.min(72, Math.hypot(dx, dy) * .12);
    return {a, b, c1: {x: a.x + dx * .32, y: a.y + dy * .32 + sag},
        c2: {x: a.x + dx * .68, y: a.y + dy * .68 + sag}};
}

export function stringGeometry(first, second) {
    return stringControlPoints(pinCenter(first), pinCenter(second));
}

export function nearestTargetPin(notes, view, screen, excludedId,
    maxScreenDistance = 26) {
    let target = null, closest = maxScreenDistance ** 2;
    for (const note of notes) {
        if (note.id === excludedId)
            continue;
        const point = worldToScreen(view, pinCenter(note));
        const d2 = (screen.x - point.x) ** 2 + (screen.y - point.y) ** 2;
        if (d2 <= closest) {
            closest = d2;
            target = note.id;
        }
    }
    return target;
}
