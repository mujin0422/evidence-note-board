// Pure world/screen transformations. GNOME Shell independent; tested by Node.
export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 3;

export function clampZoom(value) {
    if (!Number.isFinite(value))
        throw new RangeError('Zoom must be finite');
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

// Large finite WORLD-SPACE board independent of the monitor viewport.
// Even at 25% zoom the board spans a full single-monitor screen.
export const BASE_BOARD_WIDTH = 8000;
export const BASE_BOARD_HEIGHT = 6000;

export function boardDimensions(stageWidth,stageHeight,previous={width:0,height:0}) {
    const width=Number.isFinite(stageWidth)&&stageWidth>0?stageWidth:1920;
    const height=Number.isFinite(stageHeight)&&stageHeight>0?stageHeight:1080;
    return {
        width:Math.ceil(Math.max(BASE_BOARD_WIDTH,width/MIN_ZOOM,previous.width||0)),
        height:Math.ceil(Math.max(BASE_BOARD_HEIGHT,height/MIN_ZOOM,previous.height||0)),
    };
}

// Restrict the *camera* to the finite board, not the cards to the viewport.
// A sheet may be invisible until the user zooms out or into that region.
export function clampBoardCamera(view,viewport,board) {
    const zoom=clampZoom(view.zoom);
    const minX=Math.min(0,viewport.width-board.width*zoom);
    const minY=Math.min(0,viewport.height-board.height*zoom);
    const px=Number.isFinite(view.panX)?view.panX:0;
    const py=Number.isFinite(view.panY)?view.panY:0;
    return {zoom,
        panX:Math.max(minX,Math.min(0,px)),
        panY:Math.max(minY,Math.min(0,py))};
}

export function zoomBoardAt(view,cursor,requestedZoom,viewport,board) {
    return clampBoardCamera(zoomAt(view,cursor,requestedZoom),viewport,board);
}

// Empty-board left-drag moves the VIEWPORT; note world-space geometry is unchanged.
export const BOARD_DRAG_THRESHOLD_PX = 6;

export function boardDragHasStarted(start,current) {
    if (!start || !current ||
        ![start.x,start.y,current.x,current.y].every(Number.isFinite))
        return false;
    return Math.hypot(current.x-start.x,current.y-start.y) >= BOARD_DRAG_THRESHOLD_PX;
}

export function dragBoardView(view,dx,dy,viewport,board) {
    if (!Number.isFinite(dx) || !Number.isFinite(dy))
        return view;
    return clampBoardCamera(panBy(view,dx,dy),viewport,board);
}
