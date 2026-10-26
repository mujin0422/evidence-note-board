import test from 'node:test';
import assert from 'node:assert/strict';
import {hasLegacyTitle} from '../extension/model/noteContent.js';

test('only notes with a legacy title need migration', () => {
    assert.equal(hasLegacyTitle({title: '',content:''}), false);
    assert.equal(hasLegacyTitle({title: 'Văn bản cũ',content:''}), true);
    assert.equal(hasLegacyTitle({title: 'Ghi chú mới'}), true);
});

test('missing and non-string titles do not trigger migration', () => {
    assert.equal(hasLegacyTitle({content:'Tiếng Việt\n日本語\n📝'}),false);
    assert.equal(hasLegacyTitle({title:42,content:''}),false);
});
