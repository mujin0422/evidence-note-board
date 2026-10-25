import test from 'node:test';
import assert from 'node:assert/strict';
import {resizedTextWidth, resizedImage, requiredPaperHeight, rotateBy} from '../extension/geometry.js';

test('text width is manual, zoom-independent, and clamped', () => {
    assert.equal(resizedTextWidth(270, 100, 0.5), 470);
    assert.equal(resizedTextWidth(270, -900, 1), 200);
    assert.equal(resizedTextWidth(900, 2000, 1), 1200);
});
test('image resize preserves width-to-height ratio', () => {
    const r = resizedImage(300, 200, 100, 0.5);
    assert.equal(r.width, 500);
    assert.equal(r.height, 333);
    const low = resizedImage(300, 200, -900, 1);
    assert.ok(low.width >= 180);
});
test('text height grows with content but has a minimum', () => {
    assert.equal(requiredPaperHeight(50), 185);
    assert.equal(requiredPaperHeight(400), 485);
    assert.equal(requiredPaperHeight(10000), 6000);
});
test('rotate cycles cleanly through signed angles', () => {
    assert.equal(rotateBy(0), 15);
    assert.equal(rotateBy(175, 15), -170);
    assert.equal(rotateBy(-175, -15), 170);
});
