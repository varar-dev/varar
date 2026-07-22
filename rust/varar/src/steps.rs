//! The author API: a `Steps<C>` builder over `varar-core`'s registry, generic in
//! **C — your own context type**. Step definitions read as
//! `s.stimulus(expr, …)` / `s.sensor(expr, …)`; the call name IS the kind,
//! matching every other port (and what the LSP/tree-sitter dialect extracts).
//!
//! Nothing here mentions `Value`. A step's slots arrive as the Rust types the
//! handler declares ([`FromSlot`]), the state is your `C`, and a sensor returns
//! one value per slot — the same contract every port shares. TypeScript spells
//! the two-slot return as the tuple `[n, n * n]`; Rust spells it as `(n, n * n)`:
//!
//! ```ignore
//! struct Ctx { total: i64 }
//!
//! pub fn register(s: &mut Steps<Ctx>) {
//!     s.stimulus("I add {int}", |ctx: Ctx, n: i64| Ok(Ctx { total: ctx.total + n }));
//!     s.sensor("The square of {int} is {int}.", |_ctx: Ctx, n: i64, _sq: i64| Ok((n, n * n)));
//! }
//! ```
//!
//! Unlike Go's reflective equivalent, every one of these is checked by the
//! compiler: a wrong arity, a slot type that cannot be read, or a sensor whose
//! results do not match its slots is a build error, not a run-time one.

use std::any::Any;
use std::rc::Rc;

use varar_core::error::HandlerError;
use varar_core::handler::{Handler, StepOutput};
use varar_core::registry::{
    Registry, add_step, create_registry, define_parameter_type, define_parameter_type_with_format,
};
use varar_core::step_kind::StepKind;
use varar_core::value::Value;

use crate::value_conv::{FromSlot, ToSlot};

/// Reads the opaque state back as `C`, falling back to `C::default()` on the
/// first step of a file (when no context factory supplied one).
fn state_as<C: Clone + Default + 'static>(state: &Rc<dyn Any>) -> C {
    state
        .downcast_ref::<C>()
        .cloned()
        .unwrap_or_else(C::default)
}

fn slot<T: FromSlot>(args: &[Value], i: usize) -> Result<T, HandlerError> {
    let value = args
        .get(i)
        .ok_or_else(|| HandlerError::new(format!("this step has no slot {}", i + 1)))?;
    T::from_slot(value)
}

fn arity(args: &[Value], want: usize) -> Result<(), HandlerError> {
    if args.len() != want {
        return Err(HandlerError::new(format!(
            "this step has {} slot(s), but the handler takes {want}",
            args.len()
        )));
    }
    Ok(())
}

/// A closure that can register as a stimulus for context `C`. `Args` is an
/// inference-only marker (the tuple of slot types), following the axum/bevy
/// handler pattern; it never appears in author code.
pub trait IntoStimulus<C, Args> {
    fn into_handler(self) -> Handler;
}

/// A closure that can register as a sensor for context `C`.
pub trait IntoSensor<C, Args> {
    fn into_handler(self) -> Handler;
}

// --- stimuli: (C, slots…) -> Result<C> --------------------------------------

impl<C, F> IntoStimulus<C, ()> for F
where
    C: Clone + Default + 'static,
    F: Fn(C) -> Result<C, HandlerError> + 'static,
{
    fn into_handler(self) -> Handler {
        Handler::new(move |state, args| {
            arity(&args, 0)?;
            Ok(StepOutput::State(Rc::new(self(state_as::<C>(&state))?)))
        })
    }
}

impl<C, A, F> IntoStimulus<C, (A,)> for F
where
    C: Clone + Default + 'static,
    A: FromSlot,
    F: Fn(C, A) -> Result<C, HandlerError> + 'static,
{
    fn into_handler(self) -> Handler {
        Handler::new(move |state, args| {
            arity(&args, 1)?;
            let a = slot::<A>(&args, 0)?;
            Ok(StepOutput::State(Rc::new(self(state_as::<C>(&state), a)?)))
        })
    }
}

impl<C, A, B, F> IntoStimulus<C, (A, B)> for F
where
    C: Clone + Default + 'static,
    A: FromSlot,
    B: FromSlot,
    F: Fn(C, A, B) -> Result<C, HandlerError> + 'static,
{
    fn into_handler(self) -> Handler {
        Handler::new(move |state, args| {
            arity(&args, 2)?;
            let (a, b) = (slot::<A>(&args, 0)?, slot::<B>(&args, 1)?);
            Ok(StepOutput::State(Rc::new(self(state_as::<C>(&state), a, b)?)))
        })
    }
}

// --- sensors: (C, slots…) -> Result<slots…> ---------------------------------

impl<C, F> IntoSensor<C, ()> for F
where
    C: Clone + Default + 'static,
    F: Fn(C) -> Result<(), HandlerError> + 'static,
{
    fn into_handler(self) -> Handler {
        Handler::new(move |state, args| {
            arity(&args, 0)?;
            self(state_as::<C>(&state))?;
            Ok(StepOutput::Compared(None))
        })
    }
}

impl<C, A, F> IntoSensor<C, (A,)> for F
where
    C: Clone + Default + 'static,
    A: FromSlot + ToSlot,
    F: Fn(C, A) -> Result<A, HandlerError> + 'static,
{
    fn into_handler(self) -> Handler {
        Handler::new(move |state, args| {
            arity(&args, 1)?;
            let a = slot::<A>(&args, 0)?;
            // One slot: the return IS that slot's value, never a list.
            let got = self(state_as::<C>(&state), a)?;
            Ok(StepOutput::Compared(Some(got.to_slot())))
        })
    }
}

impl<C, A, B, F> IntoSensor<C, (A, B)> for F
where
    C: Clone + Default + 'static,
    A: FromSlot + ToSlot,
    B: FromSlot + ToSlot,
    F: Fn(C, A, B) -> Result<(A, B), HandlerError> + 'static,
{
    fn into_handler(self) -> Handler {
        Handler::new(move |state, args| {
            arity(&args, 2)?;
            let (a, b) = (slot::<A>(&args, 0)?, slot::<B>(&args, 1)?);
            let (ga, gb) = self(state_as::<C>(&state), a, b)?;
            Ok(StepOutput::Compared(Some(Value::List(vec![ga.to_slot(), gb.to_slot()]))))
        })
    }
}

/// Renders a parameter type's value back in the document's notation, for the
/// diff shown when a sensor mismatches.
pub type Format<T> = Box<dyn Fn(&T) -> String>;

/// The step builder, generic in the context type `C`.
pub struct Steps<C> {
    registry: Registry,
    _context: std::marker::PhantomData<C>,
}

impl<C: Clone + Default + 'static> Steps<C> {
    /// A builder over a fresh registry.
    pub fn new() -> Steps<C> {
        Steps::from_registry(create_registry())
    }

    /// A builder that continues folding into an existing registry.
    pub fn from_registry(registry: Registry) -> Steps<C> {
        Steps {
            registry,
            _context: std::marker::PhantomData,
        }
    }

    /// Register a stimulus: it drives the software and returns the whole next
    /// context. Source file and line are captured from the call site, so authors
    /// never pass them.
    #[track_caller]
    pub fn stimulus<Args>(
        &mut self,
        expression: &str,
        handler: impl IntoStimulus<C, Args>,
    ) -> &mut Steps<C> {
        let loc = std::panic::Location::caller();
        self.add(expression, loc, handler.into_handler(), StepKind::Stimulus)
    }

    /// Register a sensor: the read-only assertion, returning one value per slot
    /// for the core to compare against the document.
    #[track_caller]
    pub fn sensor<Args>(
        &mut self,
        expression: &str,
        handler: impl IntoSensor<C, Args>,
    ) -> &mut Steps<C> {
        let loc = std::panic::Location::caller();
        self.add(expression, loc, handler.into_handler(), StepKind::Sensor)
    }

    fn add(
        &mut self,
        expression: &str,
        loc: &std::panic::Location<'_>,
        handler: Handler,
        kind: StepKind,
    ) -> &mut Steps<C> {
        self.registry = add_step(
            &self.registry,
            expression,
            loc.file(),
            loc.line() as usize,
            handler,
            Some(kind),
        )
        .expect("valid step expression");
        self
    }

    /// Declare a custom parameter type in terms of your own Rust type: `parse`
    /// turns the regexp's capture groups into a `T`, which then arrives directly
    /// as the step's slot. Pass `Some(format)` to render a `T` back in the
    /// document's notation when a mismatch is reported.
    pub fn param<T: FromSlot + ToSlot + 'static>(
        &mut self,
        name: &str,
        regexp: &str,
        parse: impl Fn(&[&str]) -> T + 'static,
        format: Option<Format<T>>,
    ) -> &mut Steps<C> {
        let parse_fn: varar_core::registry::ParseFn =
            Rc::new(move |groups: &[&str]| parse(groups).to_slot());
        self.registry = match format {
            Some(format) => define_parameter_type_with_format(
                &self.registry,
                name,
                regexp,
                parse_fn,
                Rc::new(move |v: &Value| T::from_slot(v).ok().map(|t| format(&t))),
            ),
            None => define_parameter_type(&self.registry, name, regexp, parse_fn),
        };
        self
    }

    /// Consume the builder, yielding the accumulated registry.
    pub fn into_registry(self) -> Registry {
        self.registry
    }
}

impl<C: Clone + Default + 'static> Default for Steps<C> {
    fn default() -> Steps<C> {
        Steps::new()
    }
}
