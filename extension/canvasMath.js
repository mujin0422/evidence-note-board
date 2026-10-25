// Pure coordinate math shared by the GNOME extension and Node tests.
// Canvas positions use world coordinates, never absolute screen pixels.
export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 3.0;

export function clampZoom(value) {
    return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, value));
}

export function worldToScreen(view, point) {
    return {
        x: view.panX + point.x * view.zoom,
        y: view.panY + point.y * view.zoom,
    };
}

export function screenToWorld(view, point) {
    return {
        x: (point.x - view.panX) / view.zoom,
        y: (point.y - view.panY) / view.zoom,
    };
}

export function zoomAt(view, cursor, requestedZoom) {
    const anchor = screenToWorld(view, cursor);
    const zoom = clampZoom(requestedZoom);
    return {
        zoom,
        panX: cursor.x - anchor.x * zoom,
        panY: cursor.y - anchor.y * zoom,
    };
}

export function panBy(view, dx, dy) {
    return {...view, panX: view.panX + dx, panY: view.panY + dy};
}
