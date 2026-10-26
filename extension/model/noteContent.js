// Report whether a legacy title still needs migration into the body.
export function hasLegacyTitle(note) {
    return typeof note.title === 'string' && note.title.length > 0;
}
