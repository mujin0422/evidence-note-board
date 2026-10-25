import test from 'node:test';
import assert from 'node:assert/strict';
import {DoubleClickTracker} from '../extension/doubleClickTracker.js';

test('two close presses within timeout create one double-click', () => {
    const tracker = new DoubleClickTracker();
    assert.equal(tracker.register(1000, 400, 200), false);
    assert.equal(tracker.register(1220, 407, 202), true);
    assert.equal(tracker.register(1300, 408, 204), false);
});

test('two clicks far apart in time do not trigger', () => {
    const tracker = new DoubleClickTracker();
    assert.equal(tracker.register(1000, 20, 20), false);
    assert.equal(tracker.register(1500, 20, 20), false);
});

test('movement beyond the threshold prevents double-click', () => {
    const tracker = new DoubleClickTracker();
    assert.equal(tracker.register(1000, 20, 20), false);
    assert.equal(tracker.register(1150, 45, 20), false);
});

test('invalid times reset gesture state', () => {
    const tracker = new DoubleClickTracker();
    tracker.register(1000, 20, 20);
    assert.equal(tracker.register(Number.NaN, 20, 20), false);
    assert.equal(tracker.register(1050, 20, 20), false);
});

test('reset clears earlier click and does not create a note', () => {
    const tracker = new DoubleClickTracker();
    tracker.register(1000, 20, 20);
    tracker.reset();
    assert.equal(tracker.register(1100, 20, 20), false);
});

test('Ctrl double click selects only image action, never text action',()=>{
    const tracker=new DoubleClickTracker();
    assert.equal(tracker.register(1000,100,100,'image'),false);
    assert.equal(tracker.register(1100,102,101,'image'),true);
    assert.equal(tracker.register(1200,102,101,'text'),false);
    assert.equal(tracker.register(1300,104,102,'text'),true);
});
test('mixed Ctrl/plain clicks cannot create a note or image accidentally',()=>{
    const tracker=new DoubleClickTracker();
    assert.equal(tracker.register(1000,100,100,'image'),false);
    assert.equal(tracker.register(1100,100,100,'text'),false);
    assert.equal(tracker.register(1200,100,100,'image'),false);
});
