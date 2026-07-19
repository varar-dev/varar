use varar::{Registry, Steps, Value};

pub fn register(r: Registry) -> Registry {
    let mut s = Steps::from_registry(r);
    s.sensor(
        "life, the universe and everything is {int}",
        |_state, _answer| Ok(Some(Value::Int(42))),
    );
    s.into_registry()
}
