/** Shared lobby presentation. Games supply translated text, player badges and actions. */
export function createRoomLobby({ document = globalThis.document,
    parent = document.body, onClose, onError = () => {} } = {}) {
    function element(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text != null) node.textContent = text;
        return node;
    }
    function row(kind, ...children) {
        const node = element('div', 'lobby-row'); node.dataset.lobbyRow = kind;
        node.append(...children.filter(Boolean)); return node;
    }
    function button(action, id) {
        if (!action) return null;
        const node = element('button', 'btn' + (action.primary ? ' btn-primary' : ''), action.label);
        node.type = 'button'; node.disabled = !!action.disabled; node.dataset.lobbyAction = id;
        node.addEventListener('click', () => {
            try { const result = action.onClick(); if (result && result.catch) result.catch(onError); }
            catch (err) { onError(err); }
        });
        return node;
    }
    const overlay = element('div', 'overlay room-lobby'); overlay.id = 'lobby'; overlay.hidden = true;
    overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'lobby-title');
    overlay.addEventListener('pointerdown', event => event.stopPropagation());
    const card = element('div', 'overlay-card'), title = element('h2', 'overlay-title'); title.id = 'lobby-title';
    const auth = element('div', 'lobby-auth'), room = element('div', 'lobby-room');
    const status = element('p', 'lobby-status'); status.setAttribute('role', 'status');
    const close = button({ label: '', onClick: onClose }, 'close'); close.classList.add('lobby-close');
    card.append(title, auth, room, status, close); overlay.append(card); parent.append(overlay);

    function render(model) {
        const oldInput = room.querySelector('input');
        const value = oldInput ? oldInput.value : '', focused = oldInput && document.activeElement === oldInput;
        const selection = focused ? [oldInput.selectionStart, oldInput.selectionEnd] : null;
        title.textContent = model.title; close.textContent = model.closeLabel; status.textContent = model.status || '';
        auth.replaceChildren(); room.replaceChildren();
        const account = model.auth || {};
        auth.append(row('auth', account.text ? element('span', 'lobby-account', account.text) : null,
            ...(account.actions || []).map(action => button(action, action.id))));
        if (model.entry) {
            const entry = model.entry, input = element('input', 'lobby-code-input');
            input.type = 'text'; input.maxLength = entry.codeLength || 6; input.value = value;
            input.placeholder = entry.codeLabel; input.setAttribute('aria-label', entry.codeLabel);
            input.autocomplete = 'off'; input.autocapitalize = 'characters'; input.spellcheck = false;
            const join = Object.assign({}, entry.join, { onClick: () => entry.join.onClick(input.value) });
            const spectate = entry.spectate && Object.assign({}, entry.spectate, { onClick: () => entry.spectate.onClick(input.value) });
            input.addEventListener('keydown', event => {
                if (event.key === 'Enter' && !event.isComposing && !join.disabled) { event.preventDefault(); joinButton.click(); }
            });
            const joinButton = button(join, 'join');
            room.append(row('create', button(entry.create, 'create')), row('code', input),
                row('join', joinButton, button(spectate, 'spectate')));
            if (focused) { input.focus(); input.setSelectionRange(...selection); }
        } else if (model.room) {
            const data = model.room;
            room.append(element('div', 'lobby-code', data.code));
            const list = element('ul', 'lobby-plist');
            for (const player of data.players || []) {
                const item = element('li', player.muted ? 'lobby-player offline' : 'lobby-player');
                if (player.uid) item.dataset.playerUid = player.uid;
                const name = element('span', 'lobby-player-name');
                if (player.color) { const dot = element('span', 'lobby-player-dot', '\u25cf'); dot.style.color = player.color; dot.setAttribute('aria-hidden', 'true'); name.append(dot); }
                name.append(element('span', '', player.name));
                const badges = element('span', 'lobby-player-badges');
                for (const badge of player.badges || []) badges.append(element('span', 'lobby-tag ' + (badge.tone || ''), badge.label));
                item.append(name, badges); list.append(item);
            }
            room.append(list);
            for (const note of data.notes || []) room.append(element('p', 'lobby-note', note));
            const primary = data.primary && (data.primary.text
                ? element('span', 'lobby-waiting', data.primary.text) : button(data.primary, 'primary'));
            room.append(row('main', button(data.copy, 'copy'), primary), row('leave', button(data.leave, 'leave')));
        }
    }
    return { element: overlay, refs: { title, auth, room, status, close }, render };
}
