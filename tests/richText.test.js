import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeRichText,encodeRichText,richTextForNote,normalizeBoldSpans,
    toggleBoldSpans,rebaseBoldSpans,byteOffsetForCharacter,selectionIsBold}
    from '../extension/model/richText.js';

test('plain notes, malformed documents and reserved-prefix text are safe',()=>{
    assert.deepEqual(decodeRichText('Nội dung cũ'),{text:'Nội dung cũ',bold:[]});
    assert.deepEqual(decodeRichText('\u001eENB_RICH_TEXT_V1\n{broken'),
        {text:'\u001eENB_RICH_TEXT_V1\n{broken',bold:[]});
    assert.equal(encodeRichText('Nội dung cũ',[]),'Nội dung cũ');
    const prefix='\u001eENB_RICH_TEXT_V1\nliteral';
    assert.deepEqual(decodeRichText(encodeRichText(prefix,[])),{text:prefix,bold:[]});
});

test('Ctrl+B toggles only selection while retaining other spans',()=>{
    assert.deepEqual(toggleBoldSpans([],3,8,10),[[3,8]]);
    assert.deepEqual(toggleBoldSpans([[3,8]],4,6,10),[[3,4],[6,8]]);
    assert.deepEqual(toggleBoldSpans([[1,3]],2,6,10),[[1,6]]);
    assert.equal(selectionIsBold([[1,6]],2,5),true);
});

test('Pango byte offsets account for Vietnamese and 4-byte emoji',()=>{
    assert.equal(byteOffsetForCharacter('á🌻Hà',0),0);
    assert.equal(byteOffsetForCharacter('á🌻Hà',1),2);
    assert.equal(byteOffsetForCharacter('á🌻Hà',2),6);
    assert.equal(byteOffsetForCharacter('á🌻Hà',4),9);
});

test('encoded bold survives relaunch and old-title migration',()=>{
    const text='Xin chào 🌻 thế giới';
    const saved=encodeRichText(text,[[0,3],[9,12]]);
    assert.deepEqual(decodeRichText(saved),{text,bold:[[0,3],[9,12]]});
    const doc=richTextForNote({title:'Tiêu đề cũ',content:saved});
    assert.equal(doc.text,'Tiêu đề cũ\n'+text);
    assert.deepEqual(doc.bold,[[11,14],[20,23]]);
});

test('typing, backspace, pasting and replacement rebase formatting',()=>{
    assert.deepEqual(rebaseBoldSpans('á🌻bc','á🌻Xbc',[[1,4]]),[[1,5]]);
    assert.deepEqual(rebaseBoldSpans('hello WORLD','hello big WORLD',[[6,11]]),[[10,15]]);
    assert.deepEqual(rebaseBoldSpans('ABCD','ACD',[[0,4]]),[[0,3]]);
    assert.deepEqual(rebaseBoldSpans('Hello bold','Hello new',[[6,10]]),[[6,9]]);
});

test('invalid range normalizes without deleting text',()=>{
    assert.deepEqual(normalizeBoldSpans([[0,7],[-1,1],[4,20],[7,7]],10),[[0,10]]);
});
