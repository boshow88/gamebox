/** Browser-only Firebase Database mock used by rooms-browser-check.js. */
module.exports = `
const key = '__rooms-browser-db', watchers = new Set(), disconnects = new Map(), pending = new Set();
const readAll = () => JSON.parse(localStorage.getItem(key) || '{}');
function rootKey(path) { return path.split('/').slice(0, 3).join('/'); }
function read(path) {
    if (path === '.info/connected') return true;
    const parts = path.split('/'), all = readAll();
    if (parts.length === 2) return Object.fromEntries(Object.entries(all).filter(([key]) => key.startsWith(path + '/')).map(([key, value]) => [key.split('/').at(-1), value]));
    return parts.slice(3).reduce((node, field) => node && node[field], all[rootKey(path)]) ?? null;
}
function snapshot(path, value = read(path)) {
    return { key: path.split('/').at(-1), val: () => structuredClone(value), exists: () => value !== null,
        forEach: fn => { for (const [key, child] of Object.entries(value || {})) if (fn(snapshot(path + '/' + key, child))) return true; return false; } };
}
function notify() { for (const w of watchers) if (w.path !== '.info/connected') queueMicrotask(() => w.cb(snapshot(w.path))); }
function write(path, value) {
    const all = readAll(), root = rootKey(path), tail = path.split('/').slice(3);
    if (!tail.length) { if (value === null) delete all[root]; else all[root] = value; }
    else { let data = all[root] ||= {}; for (const part of tail.slice(0, -1)) data = data[part] ||= {}; if (value === null) delete data[tail.at(-1)]; else data[tail.at(-1)] = value; }
    localStorage.setItem(key, JSON.stringify(all)); notify();
}
addEventListener('storage', event => { if (event.key === key) notify(); });
addEventListener('pagehide', () => { for (const [path, value] of disconnects) if (read(rootKey(path))) write(path, value); });
export const getDatabase = () => ({}), ref = (_db, path) => ({ path }), serverTimestamp = () => Date.now();
export const get = async target => {
    let value = read(target.path);
    if (target.constraints) { const end = target.constraints.find(c => c.end !== undefined).end, limit = target.constraints.find(c => c.limit).limit;
        value = Object.fromEntries(Object.entries(value || {}).filter(([, room]) => room.lastActionAt <= end).sort((a,b) => a[1].lastActionAt - b[1].lastActionAt).slice(0, limit)); }
    return snapshot(target.path, value);
};
export function onValue(target, cb) { const w = { path: target.path, cb }; watchers.add(w); queueMicrotask(() => cb(snapshot(target.path))); return () => watchers.delete(w); }
export function runTransaction(target, update, options) {
    if (options.applyLocally !== false) throw new Error('Optimistic room transactions must be disabled');
    pending.add(target.path);
    return navigator.locks.request('rooms-browser-db', async () => {
        const current = read(target.path); let next = update(null);
        if (next !== undefined && current !== null) next = update(current);
        if (next === undefined) return { committed: false, snapshot: snapshot(target.path) };
        if (JSON.stringify(next) !== JSON.stringify(current)) write(target.path, next);
        return { committed: true, snapshot: snapshot(target.path) };
    }).finally(() => pending.delete(target.path));
}
export function update(target, patch) {
    if (pending.has(target.path)) throw new Error('Local update cancelled a room transaction');
    return navigator.locks.request('rooms-browser-db', () => { for (const [path, value] of Object.entries(patch)) write(target.path + '/' + path, value); });
}
export const remove = target => navigator.locks.request('rooms-browser-db', () => write(target.path, null));
export const query = (target, ...constraints) => ({ ...target, constraints }), orderByChild = order => ({ order }), endAt = end => ({ end }), limitToFirst = limit => ({ limit });
export const onDisconnect = target => ({ set: async value => disconnects.set(target.path, value), cancel: async () => disconnects.delete(target.path) });
`;
