// World-space note geometry and invisible local-coordinate border gestures.
// Tests run with Node; GNOME Shell event handling is checked on Fedora.
export const MIN_TEXT_WIDTH = 200;
export const MIN_IMAGE_WIDTH = 220;
export const MAX_NOTE_WIDTH = 1200;
export const MIN_IMAGE_HEIGHT = 110;
export const MAX_NOTE_HEIGHT = 6000;
export const MIN_TEXT_HEIGHT = 185;
export const TEXT_VERTICAL_CHROME = 85;
export const BORDER_HIT = 16;
export const CORNER_HIT = 24;
export const PHOTO_H_MARGIN = 24;
export const PHOTO_V_MARGIN = 48;

export function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

export function resizedTextWidth(startWidth, deltaScreenX, zoom) {
    if (!Number.isFinite(zoom) || zoom <= 0)
        return startWidth;
    return clamp(Math.round(startWidth + deltaScreenX / zoom),
        MIN_TEXT_WIDTH, MAX_NOTE_WIDTH);
}

// Lock the underlying *photo* aspect ratio, not the paper frame ratio.
// White Polaroid margins (24px horizontal, 48px vertical) are excluded.
export function resizedImage(startWidth, startHeight, deltaScreenX, zoom) {
    if (!Number.isFinite(zoom) || zoom <= 0)
        return {width: startWidth, height: startHeight};
    const ratio = Math.max(1, startHeight - PHOTO_V_MARGIN) /
        Math.max(1, startWidth - PHOTO_H_MARGIN);
    const minWidth = Math.max(MIN_IMAGE_WIDTH,
        PHOTO_H_MARGIN + (MIN_IMAGE_HEIGHT - PHOTO_V_MARGIN) / ratio);
    const maxWidth = Math.min(MAX_NOTE_WIDTH,
        PHOTO_H_MARGIN + (MAX_NOTE_HEIGHT - PHOTO_V_MARGIN) / ratio);
    const width = clamp(startWidth + deltaScreenX / zoom, minWidth, maxWidth);
    return {
        width: Math.round(width),
        height: Math.round(PHOTO_V_MARGIN + (width - PHOTO_H_MARGIN) * ratio),
    };
}

export function requiredPaperHeight(textPixelHeight) {
    if (!Number.isFinite(textPixelHeight))
        return MIN_TEXT_HEIGHT;
    return clamp(Math.ceil(textPixelHeight + TEXT_VERTICAL_CHROME),
        MIN_TEXT_HEIGHT, MAX_NOTE_HEIGHT);
}

export function normalizeAngle(degrees) {
    return ((degrees + 180) % 360 + 360) % 360 - 180;
}

export function angleDelta(from, to) {
    return normalizeAngle(to - from);
}

// Stage coordinates of the unrotated paper center; rotation is about
// this same pivot and neither zoom nor pan changes the pointer delta.
export function pointerAngle(screenX, screenY, note, view) {
    const cx = view.panX + (note.x + note.width / 2) * view.zoom;
    const cy = view.panY + (note.y + note.height / 2) * view.zoom;
    return Math.atan2(screenY - cy, screenX - cx) * 180 / Math.PI;
}

// Hit testing uses actor.transform_stage_point to account for zoom/rotation.
// Top-left corner = rotate, right edge/bottom-right = resize,
// paper border = drag, interior of text paper = edit.
export function gestureAt(x, y, width, height, type) {
    if (![x, y, width, height].every(Number.isFinite) ||
        width <= 0 || height <= 0 ||
        x < 0 || y < 0 || x > width || y > height)
        return 'edit';
    if (x <= CORNER_HIT && y <= CORNER_HIT)
        return 'rotate';
    if (type === 'image' &&
        x >= width - CORNER_HIT && y >= height - CORNER_HIT)
        return 'resize';
    if (x >= width - BORDER_HIT)
        return 'resize';
    if (y <= BORDER_HIT || x <= BORDER_HIT || y >= height - BORDER_HIT)
        return 'drag';
    return type === 'image' ? 'drag' : 'edit';
}
