/** Block-id generation (invariant I2): `b_<base36 counter+entropy>`, minted once at node creation. */

let counter = 0

export function freshId(): string {
  counter += 1
  return `b_${counter.toString(36)}${Math.random().toString(36).slice(2, 8)}`
}
