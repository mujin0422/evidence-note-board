import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeRichText,encodeRichText,richTextForNote,normalizeBoldSpans,
    toggleBoldSpans,rebaseBoldSpans,rebaseBadges,insertBadge,
    byteOffsetForCharacter,selectionIsBold}
    from '../extension/model/richText.js';

test('plain notes, malformed documents and reserved-prefix text are safe',()=>{
    assert.deepEqual(decodeRichText('Nội dung cũ'),
        {text:'Nội dung cũ',bold:[],red:[],badges:[]});
    assert.deepEqual(decodeRichText('\u001eENB_RICH_TEXT_V1\n{broken'),
        {text:'\u001eENB_RICH_TEXT_V1\n{broken',bold:[],red:[],badges:[]});
    assert.equal(encodeRichText('Nội dung cũ',[]),'Nội dung cũ');
    const prefix='\u001eENB_RICH_TEXT_V1\nliteral';
    assert.deepEqual(decodeRichText(encodeRichText(prefix,[])),
        {text:prefix,bold:[],red:[],badges:[]});
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
    assert.deepEqual(decodeRichText(saved),
        {text,bold:[[0,3],[9,12]],red:[],badges:[]});
    const doc=richTextForNote({title:'Tiêu đề cũ',content:saved});
    assert.equal(doc.text,'Tiêu đề cũ\n'+text);
    assert.deepEqual(doc.bold,[[11,14],[20,23]]);
});

test('dark red selection and CEFR badges survive relaunch',()=>{
    const inserted=insertBadge('Word',[],4,'B2');
    assert.equal(inserted.text,'Word\ufffc');
    assert.deepEqual(inserted.badges,[{at:4,level:'B2'}]);
    const saved=encodeRichText(inserted.text,[[0,4]],[[0,4]],inserted.badges);
    assert.deepEqual(decodeRichText(saved),{
        text:'Word\ufffc',bold:[[0,4]],red:[[0,4]],badges:[{at:4,level:'B2'}],
    });
});

test('badge anchors move with edits and disappear with their placeholder',()=>{
    assert.deepEqual(rebaseBadges('A\ufffcB','xxA\ufffcB',
        [{at:1,level:'A1'}]),[{at:3,level:'A1'}]);
    assert.deepEqual(rebaseBadges('A\ufffcB','AB',
        [{at:1,level:'A1'}]),[]);
});

test('legacy three-character badges compact without shifting formatting',()=>{
    const prefix='\u001eENB_RICH_TEXT_V1\n';
    const legacy=prefix+JSON.stringify({version:1,text:'A\ufffc  BC\ufffc  D',
        bold:[[0,10]],red:[[4,6]],badges:[{at:1,level:'A1'},{at:6,level:'C2'}]});
    assert.deepEqual(decodeRichText(legacy),{
        text:'A\ufffcBC\ufffcD',bold:[[0,6]],red:[[2,4]],
        badges:[{at:1,level:'A1'},{at:4,level:'C2'}],
    });
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
