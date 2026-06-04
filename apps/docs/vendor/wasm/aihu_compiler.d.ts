/* tslint:disable */
/* eslint-disable */

/**
 * One-shot compile: parse → compile_full → emit. Returns an `EmitResult`
 * serialized as a plain JS object: `{ js, manifest_json, route_json }`.
 *
 * Tag name resolution mirrors the native CLI binary (`src/bin/main.rs`):
 * 1. `@state { name: "..." }` → component name
 * 2. `@route { name: "..." }` → route name
 * 3. fallback to `"aihu-component"`
 */
export function wasm_compile(source: string): any;

/**
 * Client-target compile: identical to `wasm_compile` but emits the
 * browser bundle (`BuildTarget::Client`). The difference that matters for the
 * docs agent-drive stage: a `@agent` component compiled here gets the
 * policy-free `__agentDispatcher` AND the per-instance
 * `_registerAgentDispatcher(ctx.element, …)` wiring injected into the setup
 * body — so a mounted instance can be driven over the capability bridge
 * (`@aihu/runtime` `_takeAgentDispatcher`). The server `__agentBinding`
 * (scope/rateLimit policy) is elided. Mirrors the native CLI's
 * `--target client`.
 */
export function wasm_compile_client(source: string): any;

/**
 * Diagnostic helper exposed to the playground UI: returns the build
 * version string of the compiler at compile time.
 */
export function wasm_version(): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly wasm_compile: (a: number, b: number) => [number, number, number];
    readonly wasm_compile_client: (a: number, b: number) => [number, number, number];
    readonly wasm_version: () => [number, number];
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
