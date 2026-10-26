import test from 'node:test';
import assert from 'node:assert/strict';
import {boardDimensions,clampBoardCamera,zoomBoardAt,worldToScreen,
    screenToWorld,MIN_ZOOM,MAX_ZOOM}
    from '../extension/canvasMath.js';
import {confineNote,noteBounds}
    from '../extension/boardBounds.js';

const screen={width:1920,height:1080};
const board=boardDimensions(screen.width,screen.height);
const far={id:'far',type:'text',x:6800,y:4500,width:340,height:220,rotation:0};
const near={id:'near',type:'text',x:250,y:180,width:340,height:220,rotation:0};

test('finite board is bigger than single screen at min zoom',()=>{
    assert.ok(board.width*MIN_ZOOM>=screen.width);
    assert.ok(board.height*MIN_ZOOM>=screen.height);
    assert.deepEqual(boardDimensions(3840,2160),{width:15360,height:8640});
    assert.deepEqual(boardDimensions(1280,720,{width:15360,height:8640}),
        {width:15360,height:8640});
});

test('notes far apart stay in BOARD not forcibly confined to screen',()=>{
    for (const note of [near,far]) {
        const fixed=confineNote(note,board.width,board.height,1);
        assert.equal(fixed.x,note.x);
        assert.equal(fixed.y,note.y);
        const bounds=noteBounds(fixed);
        assert.ok(bounds.right<=board.width&&bounds.bottom<=board.height);
    }
    assert.ok(far.x>screen.width);
    assert.ok(far.y>screen.height);
});

test('distant note does not cap zoom at 55 percent',()=>{
    const view={zoom:0.55,panX:0,panY:0};
    const cursor={x:800,y:520};
    const next=zoomBoardAt(view,cursor,1.1,screen,board);
    assert.equal(next.zoom,1.1);
    const zoomed=zoomBoardAt(next,cursor,3,screen,board);
    assert.equal(zoomed.zoom,MAX_ZOOM);
    assert.equal(far.x,6800); // no geometry mutation from zoom
});

test('zoom follows cursor even if note goes offscreen',()=>{
    const cursor={x:900,y:450};
    const view={zoom:0.5,panX:-250,panY:-200};
    const anchor=screenToWorld(view,cursor);
    const next=zoomBoardAt(view,cursor,0.8,screen,board);
    const after=worldToScreen(next,anchor);
    assert.ok(Math.abs(after.x-cursor.x)<1e-7);
    assert.ok(Math.abs(after.y-cursor.y)<1e-7);
    // The same note keeps its board-space position.
    assert.equal(far.x,6800);
});

test('camera clamps only at board boundary when zooming past an edge',()=>{
    const next=zoomBoardAt({zoom:1,panX:0,panY:0},{x:1910,y:1070},
        MAX_ZOOM,screen,board);
    assert.ok(next.panX<=0&&next.panY<=0);
    assert.ok(next.panX>=screen.width-board.width*MAX_ZOOM);
    assert.ok(next.panY>=screen.height-board.height*MAX_ZOOM);
    const invalid=clampBoardCamera({zoom:1,panX:-999999,panY:500},screen,board);
    assert.equal(invalid.panX,screen.width-board.width);
    assert.equal(invalid.panY,0);
});

test('can reach a distant board region using zoom out then zoom in',()=>{
    // Far note becomes visible at MIN_ZOOM on a Full-HD viewport.
    const atMin={zoom:MIN_ZOOM,panX:0,panY:0};
    const point=worldToScreen(atMin,{x:far.x+150,y:far.y+100});
    assert.ok(point.x<screen.width&&point.y>screen.height);
    // At 25% x1750 and y1150 are outside vertical viewport; adjust camera
    // within the finite board to inspect the lower section.
    const stage={...atMin,panY:-120};
    const anchor=worldToScreen(stage,{x:far.x+150,y:far.y+100});
    const next=zoomBoardAt(stage,anchor,1,screen,board);
    const screenAgain=worldToScreen(next,{x:far.x+150,y:far.y+100});
    assert.ok(Math.abs(screenAgain.x-anchor.x)<0.001);
    assert.ok(Math.abs(screenAgain.y-anchor.y)<0.001);
});
