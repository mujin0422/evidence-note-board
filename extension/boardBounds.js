import {pinPosition, PIN_SIZE} from './pinMath.js';

// Bounding box includes the rotated sheet AND its independent pushpin.
// Coordinates are world-space so zoom can be handled without any camera pan.
export function noteBounds(note) {
    const radians = (note.rotation || 0) * Math.PI / 180;
    const c = Math.abs(Math.cos(radians));
    const s = Math.abs(Math.sin(radians));
    const halfX = (note.width * c + note.height * s) / 2;
    const halfY = (note.height * c + note.width * s) / 2;
    const centerX = note.x + note.width / 2;
    const centerY = note.y + note.height / 2;
    const pin = pinPosition(note);
    return {
        left: Math.min(centerX - halfX, pin.x),
        top: Math.min(centerY - halfY, pin.y),
        right: Math.max(centerX + halfX, pin.x + PIN_SIZE),
        bottom: Math.max(centerY + halfY, pin.y + PIN_SIZE),
    };
}

// Reposition, and shrink oversized legacy cards if absolutely needed.
// Text data is NEVER shortened; this only restricts visual paper height.
// Small GNOME windows should not cause invalid negative coordinates.
export function confineNote(note, viewportWidth, viewportHeight, zoom = 1, margin = 6) {
    if (!(viewportWidth > 0 && viewportHeight > 0 && zoom > 0))
        return {...note};
    const maxW = viewportWidth / zoom - 2 * margin / zoom;
    const maxH = viewportHeight / zoom - 2 * margin / zoom;
    let fixed = {...note};
    for (let i = 0; i < 30; i++) {
        const bounds = noteBounds({...fixed, x: 0, y: 0});
        const w = bounds.right - bounds.left;
        const h = bounds.bottom - bounds.top;
        if (w <= maxW + 0.01 && h <= maxH + 0.01)
            break;
        const ratio = Math.min(maxW / Math.max(w, 1), maxH / Math.max(h, 1), 0.98);
        const minWidth = fixed.type === 'image' ? 180 : 200;
        const minHeight = fixed.type === 'image' ? 110 : 185;
        // Keep Polaroid photo aspect stable while shrinking the frame:
        // horizontal and vertical paper padding are not photo pixels.
        let width = Math.max(minWidth, Math.floor(fixed.width * ratio));
        let height;
        if (fixed.type === 'image') {
            const photoRatio = Math.max(1, fixed.height - 48) /
                Math.max(1, fixed.width - 24);
            height = Math.max(minHeight, Math.round(48 + (width - 24) * photoRatio));
        } else {
            height = Math.max(minHeight, Math.floor(fixed.height * ratio));
        }
        if (width === fixed.width && height === fixed.height)
            break;
        fixed = {...fixed, width, height};
    }
    const relative = noteBounds({...fixed, x: 0, y: 0});
    const xMin = margin / zoom - relative.left;
    const xMax = viewportWidth / zoom - margin / zoom - relative.right;
    const yMin = margin / zoom - relative.top;
    const yMax = viewportHeight / zoom - margin / zoom - relative.bottom;
    fixed.x = xMin <= xMax ? Math.max(xMin, Math.min(xMax, fixed.x)) : xMin;
    fixed.y = yMin <= yMax ? Math.max(yMin, Math.min(yMax, fixed.y)) : yMin;
    return fixed;
}

export function maxZoomThatFits(notes, stageWidth, stageHeight, margin = 6) {
    if (!(stageWidth > 0 && stageHeight > 0))
        return 1;
    let right = 0, bottom = 0;
    for (const note of notes) {
        const bound = noteBounds(note);
        right = Math.max(right, bound.right);
        bottom = Math.max(bottom, bound.bottom);
    }
    return Math.max(0.25, Math.min(3,
        (stageWidth - margin) / Math.max(1, right),
        (stageHeight - margin) / Math.max(1, bottom)));
}

export function validBoardPoint(point, stageWidth, stageHeight) {
    return Number.isFinite(point.x) && Number.isFinite(point.y) &&
        point.x >= 0 && point.y >= 0 &&
        point.x < stageWidth && point.y < stageHeight;
}
