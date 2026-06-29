// Recursively freezes an object's own enumerable properties (descending into
// nested objects and arrays) and returns the same reference. Primitives, null,
// and already-frozen values pass through untouched. Pure except for the
// in-place `Object.freeze` on the value it is handed — used by the runtime to
// make step state immutable at runtime. Assumes acyclic input (test state is).
export function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) {
    return value
  }
  for (const key of Object.keys(value as object)) {
    deepFreeze((value as Record<string, unknown>)[key])
  }
  return Object.freeze(value)
}
