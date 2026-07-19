//! Step handlers — the Rust replacement for Java's reflective arity-matched SAM
//! invocation (`Execute.invokeHandler`/`samMethod`). A handler is a boxed closure
//! over `(state, args)`; arity is validated at the constructor. `StepReturn`
//! carries the sync-or-`Future` channel (the analog of "an `Object` that might be
//! a `CompletableFuture`").

use crate::error::HandlerError;
use crate::value::Value;
use std::any::Any;
use std::future::Future;
use std::pin::Pin;
use std::rc::Rc;

/// A handler's resolved return: `Ok(None)` = "no assertion" (Java `null`),
/// `Ok(Some(v))` = a value, `Err(_)` = an author-signalled failure (Java `throw`).
pub type HandlerReturn = Result<StepOutput, HandlerError>;

/// What a handler produced. A stimulus yields the whole next state, which is
/// **opaque to the core** — it is threaded between a file's steps and replaced
/// wholesale, never compared, serialized, or inspected. A sensor yields the
/// value to compare against the document (`None` = no assertion).
pub enum StepOutput {
    State(Rc<dyn Any>),
    Compared(Option<Value>),
}

impl StepOutput {
    /// The comparison value, or `None` for a state output.
    pub fn compared(&self) -> Option<&Value> {
        match self {
            StepOutput::Compared(v) => v.as_ref(),
            StepOutput::State(_) => None,
        }
    }
}

/// The sync-or-async return channel.
pub enum StepReturn {
    Ready(HandlerReturn),
    Pending(Pin<Box<dyn Future<Output = HandlerReturn>>>),
}

/// Reads an opaque state back as a [`Value`], defaulting to `Null`.
fn value_state(state: &Rc<dyn Any>) -> Value {
    state
        .downcast_ref::<Value>()
        .cloned()
        .unwrap_or(Value::Null)
}

/// The boxed closure a [`Handler`] wraps: the opaque state plus the slot
/// arguments, in slot order.
type HandlerFn = dyn Fn(Rc<dyn Any>, Vec<Value>) -> StepReturn;

/// A registered step handler: a closure over `(state, args_after_state)`.
#[derive(Clone)]
pub struct Handler {
    f: Rc<HandlerFn>,
}

impl Handler {
    /// A no-op handler (arity-agnostic) — used where a handler is never invoked.
    pub fn noop() -> Handler {
        Handler {
            f: Rc::new(|_state, _args| StepReturn::Ready(Ok(StepOutput::Compared(None)))),
        }
    }

    /// Builds a handler from a raw closure over the opaque state and the slot
    /// arguments. The facade's typed `stimulus`/`sensor` build these; authors
    /// use those instead.
    pub fn new(f: impl Fn(Rc<dyn Any>, Vec<Value>) -> HandlerReturn + 'static) -> Handler {
        Handler {
            f: Rc::new(move |state, args| StepReturn::Ready(f(state, args))),
        }
    }

    /// Fixed-arity conveniences over a [`Value`] state. These exist for the
    /// core's own tests and for any consumer not using the `varar` facade —
    /// the facade builds handlers from typed closures instead, so an author
    /// never calls these.
    pub fn sync0(f: impl Fn(Value) -> Result<Option<Value>, HandlerError> + 'static) -> Handler {
        Handler::new(move |state, args| {
            if !args.is_empty() {
                return Err(HandlerError::new("no handler with 0 parameter(s)"));
            }
            Ok(StepOutput::Compared(f(value_state(&state))?))
        })
    }

    /// A synchronous 1-argument handler `(state, a)`.
    pub fn sync1(
        f: impl Fn(Value, Value) -> Result<Option<Value>, HandlerError> + 'static,
    ) -> Handler {
        Handler::new(move |state, args| {
            if args.len() != 1 {
                return Err(HandlerError::new("no handler with 1 parameter(s)"));
            }
            Ok(StepOutput::Compared(f(value_state(&state), args[0].clone())?))
        })
    }

    /// A synchronous 2-argument handler `(state, a, b)`.
    pub fn sync2(
        f: impl Fn(Value, Value, Value) -> Result<Option<Value>, HandlerError> + 'static,
    ) -> Handler {
        Handler::new(move |state, args| {
            if args.len() != 2 {
                return Err(HandlerError::new("no handler with 2 parameter(s)"));
            }
            Ok(StepOutput::Compared(f(value_state(&state), args[0].clone(), args[1].clone())?))
        })
    }

    /// As [`Handler::sync1`], but its result is the next state rather than a
    /// value to compare.
    pub fn state1(f: impl Fn(Value, Value) -> Result<Value, HandlerError> + 'static) -> Handler {
        Handler::new(move |state, args| {
            if args.len() != 1 {
                return Err(HandlerError::new("no handler with 1 parameter(s)"));
            }
            Ok(StepOutput::State(Rc::new(f(value_state(&state), args[0].clone())?)))
        })
    }

    /// An asynchronous 0-argument handler returning a `Future`.
    pub fn async0(
        f: impl Fn(Value) -> Pin<Box<dyn Future<Output = HandlerReturn>>> + 'static,
    ) -> Handler {
        Handler {
            f: Rc::new(move |state, args| {
                if !args.is_empty() {
                    return StepReturn::Ready(Err(HandlerError::new(
                        "no handler with 0 parameter(s)",
                    )));
                }
                StepReturn::Pending(f(value_state(&state)))
            }),
        }
    }

    /// A synchronous handler of any arity: `(state, args)`.
    pub fn sync_var(
        f: impl Fn(Value, Vec<Value>) -> Result<Option<Value>, HandlerError> + 'static,
    ) -> Handler {
        Handler::new(move |state, args| Ok(StepOutput::Compared(f(value_state(&state), args)?)))
    }

    /// As [`Handler::sync_var`], returning a `Future`.
    pub fn async_var(
        f: impl Fn(Value, Vec<Value>) -> Pin<Box<dyn Future<Output = HandlerReturn>>> + 'static,
    ) -> Handler {
        Handler {
            f: Rc::new(move |state, args| StepReturn::Pending(f(value_state(&state), args))),
        }
    }

    /// Invokes the handler with `state` + `args` (captures then trailing attachment).
    pub(crate) fn call(&self, state: Rc<dyn Any>, args: Vec<Value>) -> StepReturn {
        (self.f)(state, args)
    }
}
