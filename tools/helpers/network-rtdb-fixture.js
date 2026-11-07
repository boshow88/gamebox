/* HTTP-backed test SDK: separate browser storage contexts share only this fake RTDB. */
'use strict';
const sdk = `
const control = window.__cpuNetwork = { online: true, ackDelay: 0, snapshotDelay: 15, repeats: 1, hold: false, rejectAck: false, attempts: 0 };
const watches = new Set(), disconnects = new Map();
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function request(method, path, fields) {
    const r = await fetch('/__fixture?path=' + encodeURIComponent(path), { method, headers: { 'Content-Type': 'application/json' }, body: fields ? JSON.stringify(fields) : undefined });
    if (!r.ok) throw new Error('Fixture HTTP ' + r.status); return r.json();
}
function snapshot(path, value) { return { key: path.split('/').at(-1), val: () => structuredClone(value), exists: () => value !== null,
    forEach: fn => { for (const [key, child] of Object.entries(value || {})) if (fn(snapshot(path + '/' + key, child))) return true; return false; } }; }
export const getDatabase = () => ({}), ref = (_db, path) => ({ path }), serverTimestamp = () => Date.now();
export async function get(target) {
    if (!control.online) throw new Error('Fixture offline');
    let { value } = await request('GET', target.path);
    if (target.constraints) {
        const end = target.constraints.find(c => c.end !== undefined).end, count = target.constraints.find(c => c.limit).limit;
        value = Object.fromEntries(Object.entries(value || {}).filter(([, room]) => room.lastActionAt <= end).slice(0, count));
    }
    return snapshot(target.path, value);
}
export function onValue(target, callback) {
    const watch = { path: target.path, callback, version: -1, active: true, busy: false }; watches.add(watch);
    async function poll() {
        if (!watch.active || watch.busy) return;
        if (target.path === '.info/connected') { if (watch.version === -1) { watch.version = 0; callback(snapshot(target.path, control.online)); } return; }
        if (!control.online) return;
        watch.busy = true;
        try {
            const result = await request('GET', target.path);
            if (result.version !== watch.version) {
                watch.version = result.version;
                setTimeout(() => { if (watch.active) { callback(snapshot(target.path, result.value)); for (let i = 0; i < control.repeats; i++) callback(snapshot(target.path, result.value)); } }, control.snapshotDelay);
            }
        } finally { watch.busy = false; }
    }
    const timer = setInterval(() => poll().catch(error => { window.__fixtureError = String(error); }), 25);
    poll(); return () => { watch.active = false; clearInterval(timer); watches.delete(watch); };
}
control.setOnline = async value => {
    control.online = value;
    for (const watch of watches) if (watch.path === '.info/connected') watch.callback(snapshot(watch.path, value));
    if (!value) for (const [path, entry] of disconnects) await request('PATCH', path, { value: entry });
};
export async function runTransaction(target, updater, options) {
    if (options.applyLocally !== false) throw new Error('Optimistic room transactions must be disabled');
    control.attempts++;
    while (control.hold && control.online) await pause(10);
    if (!control.online) throw new Error('Fixture offline');
    for (let retry = 0; retry < 50; retry++) {
        const { value, version } = await request('GET', target.path);
        let next = updater(null); if (next !== undefined && value !== null) next = updater(value);
        if (next === undefined) return { committed: false, snapshot: snapshot(target.path, value) };
        if (!control.online) throw new Error('Fixture offline');
        const result = await request('PUT', target.path, { value: next, version });
        if (result.conflict) continue;
        const delay = control.ackDelay, fail = control.rejectAck; control.rejectAck = false;
        if (delay) await pause(delay);
        if (fail) throw new Error('Fixture lost acknowledgement after commit');
        return { committed: true, snapshot: snapshot(target.path, result.value) };
    }
    throw new Error('Fixture transaction retry limit');
}
export async function update(target, patch) {
    if (!control.online) throw new Error('Fixture offline');
    await request('PATCH', target.path, { patch });
}
export const remove = target => request('PATCH', target.path, { value: null });
export const query = (target, ...constraints) => ({ ...target, constraints }), orderByChild = order => ({ order }), endAt = end => ({ end }), limitToFirst = limit => ({ limit });
export const onDisconnect = target => ({ set: async value => disconnects.set(target.path, value), cancel: async () => disconnects.delete(target.path) });
`;

function createBackend() {
    const values = new Map(), versions = new Map();
    const root = path => path.split('/').slice(0, 3).join('/');
    function read(path) {
        const parts = path.split('/');
        if (parts.length === 2) return Object.fromEntries([...values].filter(([key]) => key.startsWith(path + '/')).map(([key, value]) => [key.split('/').at(-1), value]));
        return parts.slice(3).reduce((node, key) => node && node[key], values.get(root(path))) ?? null;
    }
    function write(path, value) {
        const key = root(path), fields = path.split('/').slice(3);
        if (!fields.length) { if (value === null) values.delete(key); else values.set(key, structuredClone(value)); }
        else {
            const next = structuredClone(values.get(key) || {}); let node = next;
            for (const field of fields.slice(0, -1)) node = node[field] ||= {};
            if (value === null) delete node[fields.at(-1)]; else node[fields.at(-1)] = value;
            values.set(key, next);
        }
        versions.set(key, (versions.get(key) || 0) + 1);
    }
    async function handle(request, response, url) {
        const path = url.searchParams.get('path'), key = root(path);
        let input = '';
        for await (const chunk of request) input += chunk;
        const body = input ? JSON.parse(input) : {};
        let result;
        if (request.method === 'GET') result = { value: read(path), version: versions.get(key) || 0 };
        else if (request.method === 'PUT' && body.version !== (versions.get(key) || 0)) result = { conflict: true };
        else {
            if (body.patch) for (const [field, value] of Object.entries(body.patch)) write(path + '/' + field, value);
            else write(path, body.value);
            result = { value: read(path), version: versions.get(key) || 0 };
        }
        response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); response.end(JSON.stringify(result));
    }
    return { handle, read, write, sdk };
}
module.exports = createBackend;
