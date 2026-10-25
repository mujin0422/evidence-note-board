import test from 'node:test';
import assert from 'node:assert/strict';
import {pinPosition, pinMenuPosition} from '../extension/pinMath.js';

test('pin is centered on the top of a note or photo', () => {
    assert.deepEqual(pinPosition({x: 100, y: 200, width: 270, height: 185, rotation: 0}),
        {x: 215, y: 180});
});
test('changing width and text height keeps pin at the top center', () => {
    assert.deepEqual(pinPosition({x: 100, y: 200, width: 460, height: 480, rotation: 0}),
        {x: 310, y: 180});
});
test('image rotation moves the top-edge anchor', () => {
    const rotated = pinPosition({x: 100, y: 200, width: 200, height: 100, rotation: 90});
    assert.ok(Math.abs(rotated.x - 230) < 0.0001);
    assert.ok(Math.abs(rotated.y - 230) < 0.0001);
});
test('pin menu is below the head and not at negative coordinates', () => {
    const note = {x: 0, y: 0, width: 200, height: 185, rotation: 0};
    assert.deepEqual(pinMenuPosition(note), {x: 35, y: 20});
});
