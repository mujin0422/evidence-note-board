// Backward-compatible display data for notes created before body-only UI.
// Never drop user-entered legacy titles: migrate them into the body verbatim.
export function bodyTextForNote(note) {
    const title = typeof note.title === 'string' ? note.title : '';
    const content = typeof note.content === 'string' ? note.content : '';
    if (!title || title === 'Ghi chú mới')
        return content;
    return content ? `${title}\n${content}` : title;
}

export function hasLegacyTitle(note) {
    return typeof note.title === 'string' && note.title.length > 0;
}
