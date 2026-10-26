// Runtime defaults, single-screen layout and lightweight recovery policy.
// The board deliberately does not implement multi-monitor positioning.
export const DEFAULT_PREFERENCES = Object.freeze({
    show_hud: true, show_strings: true, zoom_step: 1.1,
});

// Derive fixed single-display toolbar anchors and the viewport center.
export function singleScreenLayout(stageWidth, stageHeight) {
    // Stage coordinates start at (0,0). This is the supported single-
    // display mode; never consult GNOME's primaryIndex or monitor list.
    const width = Number.isFinite(stageWidth) && stageWidth > 0 ? stageWidth : 1;
    const height = Number.isFinite(stageHeight) && stageHeight > 0 ? stageHeight : 1;
    return {
        hud: {x: 22, y: 55},
        text: {x: 22, y: 98},
        image: {x: 150, y: 98},
        settings: {x: 242, y: 98},
        center: {x: width / 2, y: height / 2},
    };
}

// Cheaply reject curves whose endpoints are both outside an expanded viewport.
export function curveVisible(a,b,viewport,margin=85) {
    if (!a || !b || !viewport ||
        ![a.x,a.y,b.x,b.y,viewport.width,viewport.height].every(Number.isFinite))
        return false;
    return Math.max(a.x,b.x)+margin >= 0 &&
        Math.max(a.y,b.y)+margin >= 0 &&
        Math.min(a.x,b.x)-margin <= viewport.width &&
        Math.min(a.y,b.y)-margin <= viewport.height;
}

// Exponential reconnect backoff capped at 15 seconds.
export function reconnectDelay(attempt) {
    return Math.min(15000,600*2**Math.min(Math.max(0,attempt),5));
}
