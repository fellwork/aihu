use std::collections::HashMap;

#[derive(Debug, Default, PartialEq)]
pub struct SignalMap(pub HashMap<String, String>);

pub fn resolve_signals(script: &str) -> SignalMap {
    let mut map = SignalMap::default();
    for line in script.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("const [") {
            if let Some(bracket_end) = trimmed.find("] = signal(") {
                let inner = &trimmed[7..bracket_end];
                let parts: Vec<&str> = inner.split(',').map(|s| s.trim()).collect();
                if parts.len() == 2 && !parts[0].is_empty() && !parts[1].is_empty() {
                    map.0.insert(parts[0].to_string(), parts[1].to_string());
                }
            }
        }
    }
    map
}
