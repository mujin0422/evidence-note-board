// One graphical pushpin anchored to each card's top-center.
// Its position follows card geometry/rotation, with a fixed-size pin head.
export const PIN_SIZE = 40;

export function pinPosition(note, size = PIN_SIZE) {
    const radians = (note.rotation || 0) * Math.PI / 180;
    const centerX = note.x + note.width / 2;
    const centerY = note.y + note.height / 2;
    return {
        x: centerX + Math.sin(radians) * note.height / 2 - size / 2,
        y: centerY - Math.cos(radians) * note.height / 2 - size / 2,
    };
}

export function pinMenuPosition(note) {
    const pin = pinPosition(note);
    return {x: Math.max(0, pin.x - 45), y: Math.max(0, pin.y + PIN_SIZE)};
}
