import test from 'node:test';
import assert from 'node:assert/strict';
import {clampZoom, panBy, screenToWorld, worldToScreen, zoomAt}
    from '../extension/canvasMath.js';

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} !== ${b}`);

test('world/screen conversion survives negative positions', () => {
    const view = {zoom: 1.75, panX: -200, panY: 135};
    const original = {x: 450.4, y: -12.3};
    const restored = screenToWorld(view, worldToScreen(view, original));
    close(original.x, restored.x);
    close(original.y, restored.y);
});

test('zoom at pointer keeps the same world point under the cursor', () => {
    const original = {zoom: 1, panX: 20, panY: 35};
    const cursor = {x: 200, y: 280};
    const world = screenToWorld(original, cursor);
    const next = zoomAt(original, cursor, 2);
    const screen = worldToScreen(next, world);
    close(screen.x, cursor.x);
    close(screen.y, cursor.y);
});

test('repeated zoom and inverse zoom do not drift', () => {
    let view = {zoom: 1, panX: 45, panY: -123};
    const cursor = {x: 617, y: 223};
    for (let n = 0; n < 40; n++) {
        view = zoomAt(view, cursor, view.zoom * 1.1);
        view = zoomAt(view, cursor, view.zoom / 1.1);
    }
    close(view.zoom, 1);
    close(view.panX, 45);
    close(view.panY, -123);
});

test('zoom clamps to 25–300 percent and rejects invalid values', () => {
    assert.equal(clampZoom(0.01), 0.25);
    assert.equal(clampZoom(100), 3);
    assert.equal(clampZoom(1.5), 1.5);
    assert.throws(() => clampZoom(Number.NaN), RangeError);
});

test('panning changes only the camera offsets', () => {
    const view = {zoom: 0.8, panX: 10, panY: -5};
    assert.deepEqual(panBy(view, -20, 30),
        {zoom: 0.8, panX: -10, panY: 25});
});
