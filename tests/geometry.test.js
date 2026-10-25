import test from 'node:test';
import assert from 'node:assert/strict';
import {resizedTextWidth, resizedImage, requiredPaperHeight, gestureAt,
    normalizeAngle, angleDelta, pointerAngle} from '../extension/geometry.js';

test('text width resize is zoom-independent and clamped', () => {
    assert.equal(resizedTextWidth(270, 100, 0.5), 470);
    assert.equal(resizedTextWidth(270, -900, 1), 200);
    assert.equal(resizedTextWidth(900, 2000, 1), 1200);
});

test('landscape and portrait photos keep source aspect inside frame', () => {
    const landscape = resizedImage(424, 248, 100, 1);
    assert.equal(landscape.width, 524);
    assert.equal(landscape.height, 298);
    assert.ok(Math.abs((landscape.width - 24) / (landscape.height - 48) - 2) < 1e-6);
    const portrait = resizedImage(224, 448, 50, 1);
    assert.equal(portrait.width, 274);
    assert.equal(portrait.height, 548);
    assert.ok(Math.abs((portrait.height - 48) / (portrait.width - 24) - 2) < 1e-6);
});

test('image never shrinks below minimum or grows unbounded', () => {
    const low = resizedImage(424, 248, -2000, 1);
    assert.ok(low.width >= 220);
    const high = resizedImage(424, 248, 8000, 1);
    assert.ok(high.width <= 1200);
});

test('text height grows with content but has minimum', () => {
    assert.equal(requiredPaperHeight(50), 185);
    assert.equal(requiredPaperHeight(400), 485);
    assert.equal(requiredPaperHeight(10000), 6000);
});

test('invisible border gestures distinguish edit/drag/resize/rotation', () => {
    assert.equal(gestureAt(10, 10, 300, 200, 'text'), 'rotate');
    assert.equal(gestureAt(290, 110, 300, 200, 'text'), 'resize');
    assert.equal(gestureAt(130, 10, 300, 200, 'text'), 'drag');
    assert.equal(gestureAt(120, 80, 300, 200, 'text'), 'edit');
    assert.equal(gestureAt(290, 190, 300, 200, 'image'), 'resize');
    assert.equal(gestureAt(120, 80, 300, 200, 'image'), 'drag');
    assert.equal(gestureAt(-20, 100, 300, 200, 'image'), 'edit');
    assert.equal(gestureAt(270, 110, 300, 200, 'text', 0.25), 'resize');
    assert.equal(gestureAt(8, 70, 300, 200, 'text', 0.25), 'drag');
});

test('angle wrap avoids discontinuities at +/-180°', () => {
    assert.equal(normalizeAngle(190), -170);
    assert.equal(angleDelta(175, -175), 10);
    assert.equal(angleDelta(-175, 175), -10);
    const note = {x: 10, y: 20, width: 100, height: 100};
    const view = {zoom: 2, panX: 30, panY: -10};
    assert.equal(pointerAngle(150, 130, note, view), 0);
});
