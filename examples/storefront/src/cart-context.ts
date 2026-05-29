import { createContext } from '@aihu/context'

export type CartItem = { id: string; name: string; price: number }
export type CartSignal = [() => CartItem[], (v: CartItem[]) => void]

export const CartContext = createContext<CartSignal | null>(null)
