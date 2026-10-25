// Pure monitor, redraw visibility and retry math; safe to test with Node.
export const DEFAULT_PREFERENCES = Object.freeze({
    show_hud: true, show_strings: true, zoom_step: 1.1,
});
export function primaryMonitor(monitors, index, stageWidth, stageHeight) {
    const good = m => m && [m.x,m.y,m.width,m.height].every(Number.isFinite) &&
        m.width > 0 && m.height > 0;
    let monitor = monitors?.[index];
    if (!good(monitor))
        monitor = (Array.isArray(monitors) ? monitors : []).find(good);
    if (!monitor)
        return {x:0,y:0,width:Math.max(1,stageWidth || 1),height:Math.max(1,stageHeight || 1)};
    return {x:monitor.x,y:monitor.y,width:monitor.width,height:monitor.height};
}
export function toolbarLayout(m) {
    return {hud:{x:m.x+22,y:m.y+55},text:{x:m.x+22,y:m.y+98},
        image:{x:m.x+150,y:m.y+98},settings:{x:m.x+242,y:m.y+98},
        center:{x:m.x+m.width/2,y:m.y+m.height/2}};
}
export function curveVisible(a,b,viewport,margin=85) {
    if (!a || !b || !viewport ||
        ![a.x,a.y,b.x,b.y,viewport.width,viewport.height].every(Number.isFinite))
        return false;
    return Math.max(a.x,b.x)+margin >= 0 &&
        Math.max(a.y,b.y)+margin >= 0 &&
        Math.min(a.x,b.x)-margin <= viewport.width &&
        Math.min(a.y,b.y)-margin <= viewport.height;
}
export function reconnectDelay(attempt) {
    return Math.min(15000,600*2**Math.min(Math.max(0,attempt),5));
}
