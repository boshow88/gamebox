// TEMPORARY AUTH A/B TEST. Removal instructions: docs/AUTH-AB-TEST.md.
// One device-local key; no accounts, tokens or error messages are recorded.
const KEY = 'gamebox:auth-ab-test:v1';
export function createAuthABTest(root) {
    let saved, storageOK = true;
    try { saved = JSON.parse(root.localStorage.getItem(KEY) || 'null'); }
    catch (_) { storageOK = false; }
    const enabled = !!(saved && (saved.mode === 'A' || saved.mode === 'B'));
    const mode = enabled ? saved.mode : 'A';
    let events = enabled && Array.isArray(saved.events) ? saved.events.filter(item => item && typeof item.at === 'string' && /^[AB]$/.test(item.mode) && typeof item.event === 'string').slice(-20) : [];
    let account, output, note, mounted = false;
    const standalone = !!(root.navigator && root.navigator.standalone) || !!root.matchMedia?.('(display-mode: standalone)').matches;
    function paint() {
        if (!output) return;
        const user = account.currentUser();
        const state = account.authState() === 'loading' ? '恢復登入中' : account.authState() === 'error' ? '登入狀態讀取失敗' : !user ? '未登入' : user.anon ? '訪客' : 'Google 已登入';
        output.textContent = `目前：${mode}${enabled ? '（測試中）' : '（預設，測試未啟用）'}\n環境：${standalone ? '主畫面 Web App' : '一般瀏覽器'}\n狀態：${state}\n` + events.map(item => `${item.at} ${item.mode} ${item.event}`).join('\n');
    }
    function record(event) {
        if (enabled) {
            events.push({ at: new Date().toISOString(), mode, event });
            events = events.slice(-20);
            try {
                // A different open tab may already have switched modes. Never undo it.
                const current = JSON.parse(root.localStorage.getItem(KEY) || 'null');
                if (current?.mode === mode) root.localStorage.setItem(KEY, JSON.stringify({ mode, events }));
            } catch (_) { storageOK = false; }
        }
        paint();
    }
    function select(next) {
        try {
            if (next) root.localStorage.setItem(KEY, JSON.stringify({ mode: next, events }));
            else root.localStorage.removeItem(KEY);
            root.location.reload();
        } catch (_) {
            if (note) note.textContent = '無法保存測試設定，尚未切換模式。請保留目前環境並回報此訊息。';
        }
    }
    function mount() {
        const parent = root.document?.getElementById('account')?.parentElement;
        if (!parent || mounted) return;
        mounted = true;
        const node = (tag, text) => {
            const element = root.document.createElement(tag);
            if (text) element.textContent = text;
            return element;
        };
        const panel = node('details'); panel.id = 'auth-ab-test';
        const summary = node('summary', '登入 A/B 測試（暫時）'); summary.className = 'drawer-item';
        panel.append(summary);
        note = node('p', '先選模式並重新載入，再登出、重新登入。切換模式不會自動登出。請在主畫面 Web App 內測試，並記下 A、B 結果。');
        if (!storageOK) note.textContent = '無法讀取測試設定，目前使用 A。';
        panel.append(note);
        for (const [value, label] of [['A', '選 A：目前方式'], ['B', '選 B：原本方式'], [null, '結束測試並回 A']]) {
            const button = node('button', label); button.type = 'button'; button.className = 'drawer-item';
            button.dataset.authAbMode = value || 'off';
            button.addEventListener('click', () => select(value)); panel.append(button);
        }
        const refresh = node('button', '重新載入（登入卡住時使用）'); refresh.type = 'button'; refresh.className = 'drawer-item';
        refresh.addEventListener('click', () => root.location.reload()); panel.append(refresh);
        output = node('pre'); output.id = 'auth-ab-output'; output.setAttribute('aria-label', '登入測試紀錄');
        output.style.cssText = 'white-space:pre-wrap;overflow-wrap:anywhere;font-size:11px;max-height:260px;overflow:auto;';
        panel.append(output); parent.append(panel); paint();
    }
    return {
        mode,
        connect(value) {
            account = value;
            record(`page-open:${standalone ? 'standalone' : 'browser'}`);
            account.onAuth(user => record(!user ? 'signed-out' : user.anon ? 'guest' : 'google-signed-in'));
            mount();
            root.document?.addEventListener('DOMContentLoaded', mount, { once: true });
            root.document?.addEventListener('visibilitychange', () => record(`visibility:${root.document.visibilityState}`));
            root.addEventListener?.('pageshow', () => record('pageshow'));
            root.addEventListener?.('arcade-auth-error', () => record('auth-state-error'));
        },
        signIn(operation) {
            if (!enabled) return operation();
            record('google-login-start');
            // Observe the original promise without adding timeouts, retries or a new
            // sign-in flow: A and B must differ only in Auth initialization.
            let result;
            try { result = operation(); }
            catch (error) { record('google-login-threw'); throw error; }
            Promise.resolve(result).then(() => record('google-login-resolved'), error => {
                const code = /^auth\/[a-z-]+$/.test(error?.code) ? error.code : 'unknown';
                record(`google-login-rejected:${code}`);
            });
            return result;
        },
    };
}
export const authABTest = createAuthABTest(window);
