/* In-memory unread tree. Features own persistence; this module aggregates and paints. */
(function () {
    'use strict';
    function indicator(element, unread, label) {
        if (!element) return;
        element.classList.add('notification-indicator');
        element.classList.toggle('has-unread', !!unread);
        element.setAttribute('aria-label', label);
    }
    function create(options) {
        var nodes = new Map(), bindings = new Set(), scope, generation = 0;
        function node(id) {
            if (!nodes.has(id)) nodes.set(id, { parent: null, count: 0, atLeast: false, owner: null });
            return nodes.get(id);
        }
        function state(id) {
            var value = node(id), count = value.count, atLeast = value.atLeast;
            nodes.forEach(function (child, key) {
                if (child.parent !== id) return;
                var descendant = state(key); count += descendant.count; atLeast = atLeast || descendant.atLeast;
            });
            return { count: count, unread: count > 0, atLeast: atLeast };
        }
        function describe(value) {
            var count = String(value.count) + (value.atLeast ? '+' : '');
            return options.getLocale() === 'zh' ? '你有 ' + count + ' 則未讀通知'
                : 'You have ' + count + ' unread ' + (value.count === 1 && !value.atLeast ? 'notification' : 'notifications');
        }
        function refresh() {
            bindings.forEach(function (binding) {
                if (!binding.element.isConnected) { bindings.delete(binding); return; }
                var value = state(binding.id);
                indicator(binding.element, value.unread, binding.label(value));
            });
        }
        return {
            // Scope is an account/session identity. Old publishers become inert after a change.
            setScope: function (next) {
                if (scope === next) return;
                scope = next; generation++;
                nodes.forEach(function (value) { value.count = 0; value.atLeast = false; value.owner = null; });
                refresh();
            },
            source: function (id, parent) {
                var value = node(id), ancestor = parent || null;
                if (ancestor !== null) node(ancestor);
                for (var cursor = ancestor; cursor !== null; cursor = node(cursor).parent) {
                    if (cursor === id) throw new Error('notifications/cycle');
                }
                if (value.parent !== null && value.parent !== ancestor) throw new Error('notifications/parent-changed');
                value.parent = ancestor;
                var token = {}, version = generation;
                value.owner = token; value.count = 0; value.atLeast = false; refresh();
                function current() { return generation === version && value.owner === token; }
                return {
                    publish: function (count, settings) {
                        if (!current()) return false;
                        if (!Number.isSafeInteger(count) || count < 0) throw new Error('notifications/invalid-count');
                        var atLeast = count > 0 && !!(settings && settings.atLeast);
                        if (value.count !== count || value.atLeast !== atLeast) { value.count = count; value.atLeast = atLeast; refresh(); }
                        return true;
                    },
                    dispose: function () {
                        if (!current()) return;
                        value.owner = null; value.count = 0; value.atLeast = false; refresh();
                    },
                };
            },
            state: state,
            describe: describe,
            bind: function (element, id, label) {
                if (!element) return function () {};
                node(id);
                var binding = { element: element, id: id, label: label };
                bindings.add(binding); refresh();
                return function () { bindings.delete(binding); };
            },
            refresh: refresh,
        };
    }
    window.GameBoxNotifications = { create: create, indicator: indicator };
})();
