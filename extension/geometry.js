// Pure geometry utilities for image resize, paper width, and rotation.
// All dimensions are in board/world coordinates, independent of zoom.
export const MIN_TEXT_WIDTH = 200;
export const MIN_IMAGE_WIDTH = 180;
export const MAX_NOTE_WIDTH = 1200;
export const MIN_IMAGE_HEIGHT = 110;
export const MAX_NOTE_HEIGHT = 6000;
export const MIN_TEXT_HEIGHT = 185;
export const TEXT_VERTICAL_CHROME = 85;

export function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

export function resizedTextWidth(startWidth, deltaScreenX, zoom) {
    if (!Number.isFinite(zoom) || zoom <= 0)
        return startWidth;
    return clamp(Math.round(startWidth + deltaScreenX / zoom),
        MIN_TEXT_WIDTH, MAX_NOTE_WIDTH);
}

// Lock image aspect ratio across interactive resize, including frame padding.
// The original width and height always remain the ratio source for the gesture.
export function resizedImage(startWidth, startHeight, deltaScreenX, zoom) {
    if (!Number.isFinite(zoom) || zoom <= 0)
        return {width: startWidth, height: startHeight};
    const ratio = startHeight / startWidth;
    const minWidth = Math.max(MIN_IMAGE_WIDTH, MIN_IMAGE_HEIGHT / ratio);
    const maxWidth = Math.min(MAX_NOTE_WIDTH, MAX_NOTE_HEIGHT / ratio);
    const width = clamp(startWidth + deltaScreenX / zoom, minWidth, maxWidth);
    return {width: Math.round(width), height: Math.round(width * ratio)};
}

export function requiredPaperHeight(textPixelHeight) {
    if (!Number.isFinite(textPixelHeight))
        return MIN_TEXT_HEIGHT;
    return clamp(Math.ceil(textPixelHeight + TEXT_VERTICAL_CHROME),
        MIN_TEXT_HEIGHT, MAX_NOTE_HEIGHT);
}

export function rotateBy(angle, increment = 15) {
    // Store a normalized signed angle within the backend's [-180, 180] range.
    const degrees = angle + increment;
    return ((degrees + 180) % 360 + 360) % 360 - 180;
}
