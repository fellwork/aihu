use std::collections::{BTreeMap, BTreeSet};

/// Maps reactive names to their setter name (for `[getter, setter] = signal(...)` pairs)
/// or to an empty string (for computed signals emitted via `$computed name = expr`).
///
/// Template emission uses this map to decide whether to emit a reactive leaf
/// (`leaf([getter, setter])` or `leaf([() => name[0]().prop, () => {}])`) or a
/// plain leaf (`leaf(expr)`).
#[derive(Debug, Default, PartialEq)]
pub struct SignalMap(pub BTreeMap<String, String>);

/// All identifiers declared in `@state` — the union of signals + computed
/// values + plain class-property declarations like
/// `view: 'week' | 'month' = 'week'`.
///
/// R2 (Defect B): the template emitter consults this set to decide whether
/// an attribute binding (`class={view === 'week' ? 'active' : ''}`,
/// `events={events}`) references reactive state and must therefore be lowered
/// to a `[() => (expr)]` thunk array so arbor's `_applyAttrs` takes its
/// reactive Path 2 (Array.isArray + getter[0]) instead of treating the value
/// as a static primitive — or worse, mistaking a `[]`-initialized array for
/// a Signal tuple and trying to invoke `value[0] as () => unknown`.
///
/// Lives outside `SignalMap` so the existing `Debug` snapshot serialization
/// of `SignalMap` (a single-field tuple struct) stays byte-for-byte identical.
#[derive(Debug, Default, Clone, PartialEq)]
pub struct StateNames(pub BTreeSet<String>);

impl StateNames {
    pub fn insert(&mut self, name: &str) {
        self.0.insert(name.to_string());
    }
    pub fn contains(&self, name: &str) -> bool {
        self.0.contains(name)
    }
}

impl SignalMap {
    /// Returns true if `name` is a reactive value (signal or computed signal).
    pub fn is_reactive(&self, name: &str) -> bool {
        self.0.contains_key(name)
    }

    /// Returns true if `name` is a computed signal (no setter, just a getter tuple).
    pub fn is_computed(&self, name: &str) -> bool {
        matches!(self.0.get(name), Some(s) if s.is_empty())
    }

    /// Register a computed signal name (no setter).
    pub fn insert_computed(&mut self, name: &str) {
        self.0.insert(name.to_string(), String::new());
    }

    /// Register a signal with getter and setter names.
    pub fn insert_signal(&mut self, getter: &str, setter: &str) {
        self.0.insert(getter.to_string(), setter.to_string());
    }
}

pub fn resolve_signals(script: &str) -> SignalMap {
    let mut map = SignalMap::default();
    for line in script.lines() {
        let trimmed = line.trim();
        // `const [getter, setter] = signal(...)` — regular signal
        if trimmed.starts_with("const [") {
            if let Some(bracket_end) = trimmed.find("] = signal(") {
                let inner = &trimmed[7..bracket_end];
                let parts: Vec<&str> = inner.split(',').map(|s| s.trim()).collect();
                if parts.len() == 2 && !parts[0].is_empty() && !parts[1].is_empty() {
                    map.insert_signal(parts[0], parts[1]);
                }
            }
        }
        // `const name = computed(...)` — computed signal (read-only, no setter name)
        if trimmed.starts_with("const ") {
            if let Some(eq_pos) = trimmed.find(" = computed(") {
                let name_part = &trimmed["const ".len()..eq_pos];
                let name = name_part.trim();
                // Must be a simple identifier (no brackets → not a destructure)
                if !name.is_empty() && !name.contains('[') && !name.contains(',') {
                    map.insert_computed(name);
                }
            }
        }
    }
    map
}
