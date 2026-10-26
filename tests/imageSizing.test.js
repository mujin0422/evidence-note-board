import test from 'node:test';
import assert from 'node:assert/strict';
import {boundedImageDecodeSize,MAX_DECODED_IMAGE_PIXELS}
    from '../extension/geometry/imageSizing.js';

test('small displayed images keep their requested logical dimensions',()=>{
    assert.deepEqual(boundedImageDecodeSize(296,192,2),{width:296,height:192});
});

test('large HiDPI image textures stay inside the pixel budget',()=>{
    const size=boundedImageDecodeSize(1200,2200,2);
    assert.ok(size.width*size.height*4<=MAX_DECODED_IMAGE_PIXELS);
    assert.ok(Math.abs(size.width/size.height-1200/2200)<0.01);
});

test('invalid dimensions cannot request an unbounded texture',()=>{
    assert.deepEqual(boundedImageDecodeSize(Infinity,-2,NaN),{width:1,height:1});
});
