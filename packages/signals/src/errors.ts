export class SignalError extends Error {
  override name = 'SignalError'
}

export class SignalCircularError extends SignalError {
  override name = 'SignalCircularError'

  // Richer cycle context (e.g. ordered chain of computation labels) lands
  // when devtools land. v0 ships only the bare error. See spec-signals.md §6.
  constructor(message: string = 'circular dependency detected') {
    super(message)
  }
}
