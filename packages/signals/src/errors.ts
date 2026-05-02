export class SignalError extends Error {}
export class SignalCircularError extends SignalError {}
SignalError.prototype.name = 'SignalError'
SignalCircularError.prototype.name = 'SignalCircularError'
