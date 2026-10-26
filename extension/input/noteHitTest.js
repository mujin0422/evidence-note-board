import {screenToWorld} from '../geometry/canvasMath.js';
import {gestureAt} from '../geometry/noteGeometry.js';

// A rectangle contains a point, including its edges. The same geometry is
// used for notes in world space and for toolbar zones in screen space.
export function insideRect(point, rect) {
    return point.x >= rect.x && point.y >= rect.y &&
        point.x <= rect.x + rect.width &&
        point.y <= rect.y + rect.height;
}

// Check whether a click on the board is safe to interpret as a new-note
// gesture. Avoid actor-source identity assumptions on GNOME Classic/Wayland.
// Existing notes must keep receiving clicks for text editing and dragging.
export function isEmptyBoardPoint(view, screenPoint, notes, uiRects = []) {
    if (![screenPoint.x, screenPoint.y, view.zoom,
        view.panX, view.panY].every(Number.isFinite) || view.zoom <= 0)
        return false;

    if (uiRects.some(rect => insideRect(screenPoint, rect)))
        return false;
    const worldPoint = screenToWorld(view, screenPoint);
    return !notes.some(note => insideRect(worldPoint, note));
}

// All text actors need the same geometrical edit-region hit test for
// blur-on-outside-click. It respects note zoom, rotation and edit handles.
export function isTextEditorHit(note,x,y,zoom=1) {
    return note?.type==='text' &&
        [x,y,note.width,note.height].every(Number.isFinite) &&
        x>=0 && y>=0 && x<=note.width && y<=note.height &&
        gestureAt(x,y,note.width,note.height,'text',zoom)==='edit';
}

// An empty text actor can have no glyphs to pick. Its full editable
// interior must still accept focus, including after a session reload.
// The caller supplies rotated/zoomed paper-local pointer coordinates.
export function isEmptyTextEditorHit(note,text,x,y,zoom=1) {
    return text==='' && isTextEditorHit(note,x,y,zoom);
}
