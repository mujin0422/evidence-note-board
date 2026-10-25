import test from 'node:test';
import assert from 'node:assert/strict';
import {bodyTextForNote, hasLegacyTitle} from '../extension/noteContent.js';

test('new body-only note has empty content', () => {
    const note = {title: '', content: ''};
    assert.equal(bodyTextForNote(note), '');
    assert.equal(hasLegacyTitle(note), false);
});

test('legacy edited title is preserved in the multiline body', () => {
    const note = {title: 'Văn bản cũ', content: ''};
    assert.equal(bodyTextForNote(note), 'Văn bản cũ');
    assert.equal(hasLegacyTitle(note), true);
});

test('legacy title and body remain in original reading order', () => {
    assert.equal(bodyTextForNote({title: 'Tiêu đề', content: 'dòng 1\ndòng 2'}),
        'Tiêu đề\ndòng 1\ndòng 2');
});

test('legacy automatic title does not pollute body', () => {
    assert.equal(bodyTextForNote({title: 'Ghi chú mới', content: 'abc\nxyz'}),
        'abc\nxyz');
    assert.equal(hasLegacyTitle({title: 'Ghi chú mới'}), true);
});

test('all Unicode and existing newlines survive', () => {
    const original = 'Tiếng Việt\n日本語\n📝';
    assert.equal(bodyTextForNote({title: '', content: original}), original);
});
