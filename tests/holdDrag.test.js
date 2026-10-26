import test from 'node:test';
import assert from 'node:assert/strict';
import {TEXT_HOLD_MS,TEXT_SLOP_PX,keepTextHold} from '../extension/holdDrag.js';

test('held left mouse with little movement keeps pending paper drag',()=>{
    assert.equal(TEXT_HOLD_MS,330);
    assert.equal(TEXT_SLOP_PX,7);
    assert.ok(keepTextHold({x:100,y:100},{x:103,y:105},true));
    assert.ok(keepTextHold({x:100,y:100},{x:107,y:100},true));
});
test('quick move beyond slop cancels long press to allow text selection',()=>{
    assert.ok(!keepTextHold({x:100,y:100},{x:109,y:102},true));
});
test('mouse release or invalid coordinates cannot activate a stale drag',()=>{
    assert.ok(!keepTextHold({x:100,y:100},{x:100,y:100},false));
    assert.ok(!keepTextHold({x:NaN,y:100},{x:100,y:100},true));
});
