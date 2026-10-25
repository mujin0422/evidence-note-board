import test from 'node:test';
import assert from 'node:assert/strict';
import {primaryMonitor,toolbarLayout,curveVisible,reconnectDelay}
    from '../extension/productionMath.js';
test('toolbar follows primary monitor, not first monitor',()=>{
    const ms=[{x:0,y:0,width:1280,height:1024},{x:1280,y:0,width:1920,height:1080}];
    assert.deepEqual(toolbarLayout(primaryMonitor(ms,1,3200,1080)).center,{x:2240,y:540});
});
test('monitor hot unplug has valid fallback',()=>{
    assert.deepEqual(primaryMonitor([],1,1920,1080),{x:0,y:0,width:1920,height:1080});
    assert.equal(primaryMonitor([{x:0,y:0,width:1440,height:900}],4,0,0).width,1440);
});
test('culls strings offscreen with curve sag margin',()=>{
    const v={width:1920,height:1080};
    assert.ok(curveVisible({x:-10,y:50},{x:400,y:80},v));
    assert.ok(!curveVisible({x:3000,y:100},{x:4000,y:200},v));
});
test('bounded recovery delays',()=>{
    assert.deepEqual([0,1,2,6].map(reconnectDelay),[600,1200,2400,15000]);
});
