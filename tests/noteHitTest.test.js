import test from 'node:test';
import assert from 'node:assert/strict';
import {isEmptyBoardPoint, insideRect} from '../extension/input/noteHitTest.js';

const note = {x: 300, y: 400, width: 270, height: 185};

test('click on empty board accepts double-click', () => {
    assert.equal(isEmptyBoardPoint(
        {zoom: 1, panX: 0, panY: 0}, {x: 700, y: 500}, [note]), true);
});

test('click inside note cannot create another note', () => {
    assert.equal(isEmptyBoardPoint(
        {zoom: 1, panX: 0, panY: 0}, {x: 320, y: 450}, [note]), false);
});

test('hit testing respects 25 percent zoom and pan', () => {
    const view = {zoom: 0.25, panX: 100, panY: -50};
    // world (300,400) -> screen (175,50)
    assert.equal(isEmptyBoardPoint(view, {x: 175, y: 50}, [note]), false);
    assert.equal(isEmptyBoardPoint(view, {x: 500, y: 500}, [note]), true);
});

test('toolbar zone prevents accidental new notes', () => {
    const overlays = [{x: 0, y: 0, width: 510, height: 145}];
    assert.equal(isEmptyBoardPoint(
        {zoom: 1, panX: 0, panY: 0}, {x: 22, y: 98}, [], overlays), false);
    assert.equal(isEmptyBoardPoint(
        {zoom: 1, panX: 0, panY: 0}, {x: 400, y: 190}, [], overlays), true);
});

test('rectangle edges count as occupied and invalid coords are rejected', () => {
    assert.equal(insideRect({x: 300, y: 400}, note), true);
    assert.equal(isEmptyBoardPoint(
        {zoom: 1, panX: 0, panY: 0}, {x: NaN, y: 400}, [note]), false);
});
