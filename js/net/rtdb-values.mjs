/** RTDB removes null/empty containers. Preserve the room API's JSON values explicitly. */
const TYPE = '__room_type', LENGTH = '__room_length';
function validKey(key) {
    if (key.startsWith('__room_') || /[.#$\[\]/\u0000-\u001f\u007f]/.test(key)) throw new Error('Invalid RTDB room field: ' + key);
}
export function encodeRoomValue(value) {
    if (value === null) return { [TYPE]: 'null' };
    if (Array.isArray(value)) {
        const result = { [TYPE]: 'array', [LENGTH]: value.length };
        for (let i = 0; i < value.length; i++) result[i] = encodeRoomValue(value[i]);
        return result;
    }
    if (typeof value === 'object' && value) {
        const keys = Object.keys(value);
        if (!keys.length) return { [TYPE]: 'object' };
        const result = {};
        for (const key of keys) { validKey(key); result[key] = encodeRoomValue(value[key]); }
        return result;
    }
    if (typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) return value;
    throw new Error('Room values must be finite JSON data');
}
export function decodeRoomValue(value) {
    if (value === null || typeof value !== 'object') return value;
    if (value[TYPE] === 'null') return null;
    if (value[TYPE] === 'array') return Array.from({ length: value[LENGTH] }, (_, i) => decodeRoomValue(value[i]));
    // A previous empty-object marker can remain after a child-only update.
    return Object.fromEntries(Object.entries(value).filter(([key]) => key !== TYPE).map(([key, child]) => [key, decodeRoomValue(child)]));
}
export function applyRoomPatch(data, patch) {
    const result = structuredClone(data || {});
    for (const [path, value] of Object.entries(patch)) {
        const parts = path.split('.'); let node = result;
        for (const key of parts.slice(0, -1)) node = node[key] ||= {};
        node[parts.at(-1)] = value;
    }
    return result;
}
export function encodeRoomPatch(patch) {
    return Object.fromEntries(Object.entries(patch).map(([path, value]) => {
        const parts = path.split('.'); parts.forEach(validKey);
        return [parts.join('/'), encodeRoomValue(value)];
    }));
}
