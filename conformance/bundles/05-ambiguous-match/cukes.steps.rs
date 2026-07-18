//! Rust sibling of `cukes.steps.ts` (bundle `05-ambiguous-match`).

use var::{Handler, Registry, Steps, Value};

pub fn register(r: Registry) -> Registry {
    let mut s = Steps::from_registry(r);
    // Both expressions match "I have 5 cukes" → ambiguous-match diagnostic.
    s.stimulus("I have {int} cukes", Handler::sync1(|_state, _n| Ok(None)));
    s.stimulus("I have 5 cukes", Handler::sync0(|_state| Ok(None)));
    s.into_registry()
}

pub fn state() -> Value {
    Value::Null
}
