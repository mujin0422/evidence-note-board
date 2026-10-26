import test from 'node:test';
import assert from 'node:assert/strict';
import {pinCenter, worldToScreen, menuNearPin, stringControlPoints, nearestTargetPin}
    from '../extension/geometry/stringMath.js';

const first = {id:'a',x:100,y:200,width:270,height:185,rotation:0};
const second = {id:'b',x:620,y:300,width:200,height:100,rotation:0};

test('menu is only 5 screen pixels below pin at 25 and 100 zoom', () => {
    for (const zoom of [.25,1,3]) {
        const view = {zoom,panX:0,panY:0};
        const menu = menuNearPin(first,view,{width:2200,height:1600},198,136);
        const pin = worldToScreen(view,{x:235,y:220});
        assert.equal(menu.y - pin.y,5);
    }
});

test('menu stays in viewport near right and bottom edge', () => {
    const near = {...first,x:1800,y:1400};
    const at = menuNearPin(near,{zoom:1,panX:0,panY:0},
        {width:1920,height:1080},198,160);
    assert.ok(at.x >= 4 && at.x <= 1718);
    assert.ok(at.y >= 4 && at.y <= 916);
});

test('string anchor sticks to pin and updates under move / rotation', () => {
    const original = stringControlPoints(pinCenter(first),pinCenter(second));
    assert.deepEqual(original.a,pinCenter(first));
    assert.deepEqual(original.b,pinCenter(second));
    const moved = stringControlPoints(pinCenter(first),
        pinCenter({...second,x:second.x+30,rotation:30}));
    assert.notDeepEqual(moved.b,original.b);
    assert.ok(moved.c1.y > original.a.y);
});

test('pin hit-test respects zoom and rejects the source itself', () => {
    const view = {zoom:.25,panX:100,panY:40};
    const screen = worldToScreen(view,pinCenter(second));
    assert.equal(nearestTargetPin([first,second],view,screen,'a'),'b');
    assert.equal(nearestTargetPin([first,second],view,screen,'b'),null);
});

test('red string ends project correctly at zoom 25/100/300 with pan', () => {
    for (const zoom of [.25, 1, 3]) {
        const view={zoom,panX:-170,panY:85};
        const a=worldToScreen(view, pinCenter(first));
        const b=worldToScreen(view, pinCenter(second));
        assert.equal(a.x, -170 + pinCenter(first).x * zoom);
        assert.equal(a.y, 85 + pinCenter(first).y * zoom);
        assert.deepEqual(stringControlPoints(a,b).a,a);
        assert.deepEqual(stringControlPoints(a,b).b,b);
    }
});

test('string control points work for exact world-space cursor positions', () => {
    const a={x:120,y:200}, b={x:650,y:300};
    const g=stringControlPoints(a,b);
    assert.deepEqual(g.a,a);
    assert.deepEqual(g.b,b);
    assert.ok(g.c1.y>200 && g.c2.y>200);
});
