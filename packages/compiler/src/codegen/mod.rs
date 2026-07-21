pub mod emit;
pub mod mcp_schema;
pub mod signals;

pub use emit::{emit, has_exposed_agent_members, EmitResult};
pub use signals::{resolve_signals, SignalMap};
