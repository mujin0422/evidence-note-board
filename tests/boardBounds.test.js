import test from 'node:test';
import assert from 'node:assert/strict';
import {noteBounds,confineNote,maxZoomThatFits,validBoardPoint} from '../extension/boardBounds.js';

const photo = {id:'photo',type:'image',x:10,y:20,width:300,height:200,rotation:0};
function within(note,width,height,zoom=1) {
    const bound=noteBounds(note);
    const error=0.05;
    assert.ok(bound.left*zoom>=-error,JSON.stringify(bound));
    assert.ok(bound.top*zoom>=-error,JSON.stringify(bound));
    assert.ok(bound.right*zoom<=width+error,JSON.stringify(bound));
    assert.ok(bound.bottom*zoom<=height+error,JSON.stringify(bound));
}

test('moving notes to each edge never hides the paper or pin',()=>{
    for (const [x,y] of [[-500,-400],[9000,3000],[100,7000],[400,100]]) {
        const note=confineNote({...photo,x,y},1280,720);
        within(note,1280,720);
    }
});
test('rotated images, not just their unrotated rectangles, stay inside',()=>{
    for (const rotation of [0,45,90,135,180,-120]) {
        const note=confineNote({...photo,x:900,y:-50,rotation},1024,768);
        within(note,1024,768);
    }
});
test('photo duplication and saved notes past screen are recovered',()=>{
    const huge=confineNote({...photo,x:-3000,y:8000,width:1250,height:2100},1280,800);
    within(huge,1280,800);
    assert.equal(huge.id,'photo');
});
test('paper height is bounded but text content untouched',()=>{
    const text={id:'t',type:'text',x:0,y:50,width:300,height:3000,
        content:'Tiếng Việt\n'.repeat(1000),rotation:0};
    const next=confineNote(text,1366,768);
    within(next,1366,768);
    assert.equal(next.content,text.content);
});
test('quarter zoom allows movement inside the screen while zoom-in is capped',()=>{
    const moved=confineNote({...photo,x:4000,y:2600},1920,1080,.25);
    within(moved,1920,1080,.25);
    const max=maxZoomThatFits([moved],1920,1080);
    assert.ok(max>=.25&&max<=1);
});
test('safe clickable region rejects points beyond desktop',()=>{
    assert.ok(validBoardPoint({x:500,y:200},1920,1080));
    assert.ok(!validBoardPoint({x:1920,y:20},1920,1080));
    assert.ok(!validBoardPoint({x:-1,y:20},1920,1080));
});

test('oversized photos preserve the underlying image aspect when fitted',()=>{
    const huge={...photo,width:1180,height:850,x:800,y:700};
    const small=confineNote(huge,900,650);
    within(small,900,650);
    const oldRatio=(huge.height-48)/(huge.width-24);
    const newRatio=(small.height-48)/(small.width-24);
    assert.ok(Math.abs(newRatio-oldRatio)<0.02,
        'photo content ratio must survive shrinking');
});
