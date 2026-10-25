import test from 'node:test';
import assert from 'node:assert/strict';
import {singleScreenLayout,curveVisible,reconnectDelay}
    from '../extension/productionMath.js';

test('one screen places controls at constant stage coordinates',()=>{
    const a=singleScreenLayout(1920,1080);
    const b=singleScreenLayout(1280,720);
    assert.deepEqual(a.hud,{x:22,y:55});
    assert.deepEqual(a.text,{x:22,y:98});
    assert.deepEqual(a.image,{x:150,y:98});
    assert.deepEqual(a.settings,{x:242,y:98});
    assert.deepEqual(a.center,{x:960,y:540});
    assert.deepEqual(b.center,{x:640,y:360});
});

test('single screen layout uses safe stage dimensions if not allocated',()=>{
    assert.deepEqual(singleScreenLayout(0,NaN).center,{x:0.5,y:0.5});
});

test('culls strings offscreen with curve sag margin',()=>{
    const v={width:1920,height:1080};
    assert.ok(curveVisible({x:-10,y:50},{x:400,y:80},v));
    assert.ok(!curveVisible({x:3000,y:100},{x:4000,y:200},v));
});
test('bounded recovery delays remain supported',()=>{
    assert.deepEqual([0,1,2,6].map(reconnectDelay),[600,1200,2400,15000]);
});
