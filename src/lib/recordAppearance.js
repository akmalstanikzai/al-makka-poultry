// A visual accent only; no color or identity metadata is stored on records.
export const recordTone = key => {
    let hash = 0;
    for (const character of String(key || '')) hash = (hash * 31 + character.codePointAt(0)) >>> 0;
    return hash % 5;
};
