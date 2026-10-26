import test from 'node:test';
import assert from 'node:assert/strict';
import {BOARD_DRAG_THRESHOLD_PX,boardDragHasStarted,dragBoardView,
    boardDimensions,zoomBoardAt,worldToScreen}
    from '../extension/geometry/canvasMath.js';

const viewport={width:1920,height:1080};
const board=boardDimensions(viewport.width,viewport.height);

test('single click and very small pointer movement do not pan',()=>{
    assert.equal(BOARD_DRAG_THRESHOLD_PX,6);
    assert.equal(boardDragHasStarted({x:100,y:200},{x:100,y:200}),false);
    assert.equal(boardDragHasStarted({x:100,y:200},{x:104,y:203}),false);
    assert.equal(boardDragHasStarted({x:100,y:200},{x:106,y:200}),true);
    assert.equal(boardDragHasStarted({x:100,y:200},{x:109,y:200}),true);
    assert.equal(boardDragHasStarted({x:NaN,y:200},{x:109,y:200}),false);
});

test('held blank board drag translates camera while note geometry stays fixed',()=>{
    const note={x:6200,y:4500,width:270,height:180,rotation:0};
    const old={zoom:1,panX:0,panY:0};
    const move=dragBoardView(old,-5200,-3900,viewport,board);
    assert.deepEqual(move,{zoom:1,panX:-5200,panY:-3900});
    const onScreen=worldToScreen(move,{x:note.x,y:note.y});
    assert.deepEqual(onScreen,{x:1000,y:600});
    assert.deepEqual(note,{x:6200,y:4500,width:270,height:180,rotation:0});
});

test('repeated drag can reach edges but never show beyond board',()=>{
    const view={zoom:1,panX:-100,panY:-100};
    const leftTop=dragBoardView(view,5000,5000,viewport,board);
    assert.deepEqual(leftTop,{zoom:1,panX:0,panY:0});
    const rightBottom=dragBoardView(leftTop,-100000,-100000,viewport,board);
    assert.equal(rightBottom.panX,viewport.width-board.width);
    assert.equal(rightBottom.panY,viewport.height-board.height);
    assert.deepEqual(dragBoardView(rightBottom,-800,-800,viewport,board),rightBottom);
});

test('board drag is measured in screen pixels, not divided by zoom',()=>{
    const at25={zoom:0.25,panX:-40,panY:-100};
    const next=dragBoardView(at25,-20,-30,viewport,board);
    assert.equal(next.panX,-60);
    assert.equal(next.panY,-130);
    assert.equal(next.zoom,0.25);
});

test('Ctrl+Wheel still zooms at pointer after dragging viewport',()=>{
    const moved={zoom:0.6,panX:-240,panY:-180};
    const cursor={x:900,y:600};
    const world={x:(cursor.x-moved.panX)/moved.zoom,
        y:(cursor.y-moved.panY)/moved.zoom};
    const next=zoomBoardAt(moved,cursor,1.2,viewport,board);
    const projection=worldToScreen(next,world);
    assert.ok(Math.abs(projection.x-cursor.x)<1e-7);
    assert.ok(Math.abs(projection.y-cursor.y)<1e-7);
    assert.equal(next.zoom,1.2);
});

test('invalid screen-pointer deltas cannot corrupt camera',()=>{
    const before={zoom:1.5,panX:-800,panY:-600};
    assert.deepEqual(dragBoardView(before,NaN,15,viewport,board),before);
    assert.deepEqual(dragBoardView(before,12,Infinity,viewport,board),before);
});
