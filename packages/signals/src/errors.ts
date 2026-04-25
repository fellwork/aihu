export class SignalError extends Error {
  override name = 'SignalError'
}

export class SignalCircularError extends SignalError {
  override name = 'SignalCircularError'

  constructor(public readonly chain: readonly string[]) {
    super(`circular dependency detected: ${chain.join(' -> ')}`)
  }
}
