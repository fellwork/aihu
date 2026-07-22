pub mod emit;
pub mod mcp_emit;
pub mod mcp_schema;
pub mod sidecar_json;
pub mod sidecar_ts;
pub mod signals;
pub mod ssr_string_emit;
pub mod state_emit;
pub mod template_emit;

pub use emit::{emit, emit_with_options, EmitResult, IslandKind};
pub use mcp_emit::has_exposed_agent_members;
pub use signals::{resolve_signals, SignalMap};
