//! `varar` — the author facade over [`varar_core`].
//!
//! Rust uses the **injected-Registrar** author model (ADR 0006): a step file
//! exposes a `register(&mut Steps<C>)` that adds its steps explicitly, rather
//! than the module-scope accumulator TypeScript/Python use. There is therefore
//! no `defineState`/`steps()` side-effecting global here.
//!
//! The surface is deliberately small: [`Steps`] is generic in **your** context
//! type, slots arrive as **your** Rust types, and a sensor returns one value per
//! slot. The core's dynamic `Value` is an escape hatch, not the way you write
//! steps. This crate is also where the
//! registry/plan/trace conformance gates live (see `tests/conformance.rs`),
//! mirroring the Java `var` module: they need both `varar-core`'s pipeline and
//! the author surface every bundle fixture is written against.

mod steps;
mod value_conv;

pub use steps::{IntoSensor, IntoStimulus, Steps};
pub use value_conv::{FromSlot, ToSlot};

pub use varar_core::error::HandlerError;
pub use varar_core::registry::Registry;

// `Value` is the core's wire model, not part of the authoring surface: slots
// arrive as your own Rust types (see `FromSlot`), the context is your own type,
// and a sensor returns its slots' types. It is re-exported only as the escape
// hatch for a slot with no natural Rust spelling.
pub use varar_core::value::Value;
