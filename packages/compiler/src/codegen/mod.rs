pub mod emit;
pub mod signals;

pub use emit::{emit, EmitResult};
pub use signals::{resolve_signals, SignalMap};
