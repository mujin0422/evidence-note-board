import test from 'node:test';
import assert from 'node:assert/strict';
import {clampZoom, panBy, screenToWorld, worldToScreen, zoomAt}
    from '../extension/canvasMath.js';

test('coordinate conversion is reversible', () => {
    const view = {zoom: 1.75, panX: -200, panY: 135};
    const world = {x: 450.4, y: -12.3};
    const screen = worldToScreen(view, world);
    const restored = screenToWorld(view, screen);
    assert.ok(Math.abs(restored.x - world.x) < 1e-9);
    assert.ok(Math.abs(restored.y - world.y) < 1e-9);
});

test('cursor remains anchored when zooming', () => {
    const original = {zoom: 1, panX: 20, panY: 35};
    const cursor = {x: 200, y: 280};
    const world = screenToWorld(original, cursor);
    const next = zoomAt(original, cursor, 2);
    const screen = worldToScreen(next, world);
    assert.ok(Math.abs(screen.x - cursor.x) < 1e-9);
    assert.ok(Math.abs(screen.y - cursor.y) < 1e-9);
});

test('zoom is clamped to 25–300%', () => {
    assert.equal(clampZoom(0.01), 0.25);
    assert.equal(clampZoom(100), 3);
    assert.equal(clampZoom(1.5), 1.5);
});

test('pan changes only offsets', () => {
    const view = {zoom: 0.8, panX: 10, panY: -5};
    assert.deepEqual(panBy(view, -20, 30),
        {zoom: 0.8, panX: -10, panY: 25});
});
