/**
 * `@aihu/agent-a2a` — A2A protocol types.
 *
 * Conforms to the Agent2Agent (A2A) Protocol Specification v1.0.1
 * (https://a2a-protocol.org/v1.0.1/specification), JSON-RPC 2.0 binding
 * (spec §9). JSON field names are camelCase and enum values are the proto
 * string names (spec §5.5, ProtoJSON) — e.g. `TASK_STATE_COMPLETED`,
 * `ROLE_USER`.
 */
import type { AgentService, RequestContext } from '@aihu/agent-service'

export type { AgentService, RequestContext }

// ─── JSON-RPC 2.0 envelope (spec §9.3) ───────────────────────────────────────

export interface JsonRpcRequest {
  jsonrpc: '2.0'
  id?: string | number | null
  method: string
  params?: unknown
}

export interface JsonRpcError {
  code: number
  message: string
  /** Array of `@type`-tagged detail objects (spec §9.5). */
  data?: unknown[]
}

export interface JsonRpcResponse {
  jsonrpc: '2.0'
  id: string | number | null
  result?: unknown
  error?: JsonRpcError
}

// ─── Core data model (spec §4.1) ─────────────────────────────────────────────

/** Task lifecycle states (spec §4.1.3, ProtoJSON enum names). */
export type TaskState =
  | 'TASK_STATE_UNSPECIFIED'
  | 'TASK_STATE_SUBMITTED'
  | 'TASK_STATE_WORKING'
  | 'TASK_STATE_COMPLETED'
  | 'TASK_STATE_FAILED'
  | 'TASK_STATE_CANCELED'
  | 'TASK_STATE_INPUT_REQUIRED'
  | 'TASK_STATE_REJECTED'
  | 'TASK_STATE_AUTH_REQUIRED'

/** Message sender role (spec §4.1.5). */
export type Role = 'ROLE_UNSPECIFIED' | 'ROLE_USER' | 'ROLE_AGENT'

/**
 * One section of communication content (spec §4.1.6). Exactly one of the
 * oneof members (`text` | `raw` | `url` | `data`) is set per part.
 */
export interface Part {
  /** Textual content. */
  text?: string
  /** Raw file bytes, base64-encoded in JSON serialization. */
  raw?: string
  /** A URL pointing to the file's content. */
  url?: string
  /** Arbitrary structured data as a JSON value. */
  data?: unknown
  metadata?: Record<string, unknown>
  filename?: string
  mediaType?: string
}

/** One unit of communication between client and server (spec §4.1.4). */
export interface Message {
  messageId: string
  contextId?: string
  taskId?: string
  role: Role
  parts: Part[]
  metadata?: Record<string, unknown>
  extensions?: string[]
  referenceTaskIds?: string[]
}

/** Task status container (spec §4.1.2). */
export interface TaskStatus {
  state: TaskState
  message?: Message
  /** ISO 8601 UTC timestamp (spec §5.6.1). */
  timestamp?: string
}

/** A task output (spec §4.1.7). */
export interface Artifact {
  artifactId: string
  name?: string
  description?: string
  parts: Part[]
  metadata?: Record<string, unknown>
  extensions?: string[]
}

/** The core unit of action for A2A (spec §4.1.1). */
export interface Task {
  id: string
  contextId?: string
  status: TaskStatus
  artifacts?: Artifact[]
  history?: Message[]
  metadata?: Record<string, unknown>
}

// ─── Streaming events (spec §4.2) ────────────────────────────────────────────

export interface TaskStatusUpdateEvent {
  taskId: string
  contextId: string
  status: TaskStatus
  metadata?: Record<string, unknown>
}

export interface TaskArtifactUpdateEvent {
  taskId: string
  contextId: string
  artifact: Artifact
  append?: boolean
  lastChunk?: boolean
  metadata?: Record<string, unknown>
}

/**
 * Streaming payload wrapper (spec §3.2.3). Exactly one member is set; each
 * SSE frame carries one of these inside a full JSON-RPC response envelope.
 */
export interface StreamResponse {
  task?: Task
  message?: Message
  statusUpdate?: TaskStatusUpdateEvent
  artifactUpdate?: TaskArtifactUpdateEvent
}

// ─── Agent discovery (spec §4.4) ─────────────────────────────────────────────

export interface AgentInterface {
  url: string
  /** `JSONRPC`, `GRPC`, or `HTTP+JSON`; this adapter serves `JSONRPC`. */
  protocolBinding: string
  /** A2A protocol version exposed at this interface, e.g. `"1.0"`. */
  protocolVersion: string
  tenant?: string
}

export interface AgentCapabilities {
  streaming?: boolean
  pushNotifications?: boolean
  extendedAgentCard?: boolean
  extensions?: unknown[]
}

export interface AgentCardSkill {
  id: string
  name: string
  description: string
  tags: string[]
  examples?: string[]
  inputModes?: string[]
  outputModes?: string[]
}

/** Served at `{prefix}/.well-known/agent-card.json` (spec §4.4.1, IANA §13). */
export interface AgentCard {
  name: string
  description: string
  supportedInterfaces: AgentInterface[]
  version: string
  capabilities: AgentCapabilities
  defaultInputModes: string[]
  defaultOutputModes: string[]
  skills: AgentCardSkill[]
  documentationUrl?: string
  iconUrl?: string
}

// ─── Task store ──────────────────────────────────────────────────────────────

/**
 * Persistence boundary for tasks, making `GetTask` / `ListTasks` /
 * `CancelTask` implementable. The default is the bundled in-memory store;
 * inject any implementation (e.g. KV- or DB-backed) via
 * `A2aAdapterOptions.taskStore`.
 */
export interface TaskStore {
  get(id: string): Task | undefined | Promise<Task | undefined>
  save(task: Task): void | Promise<void>
  /** All stored tasks, most recently saved last. */
  list(): Task[] | Promise<Task[]>
}

// ─── Adapter surface ─────────────────────────────────────────────────────────

export interface A2aAdapterOptions {
  /** URL prefix for all routes. Default: '' */
  prefix?: string
  /** Agent name for the agent card. Default: 'aihu-agent-service' */
  name?: string
  /** Agent description for the agent card. */
  description?: string
  /** Agent version for the agent card. Default: '1.0.0' */
  version?: string
  /**
   * Absolute public URL of the JSON-RPC endpoint, advertised in the agent
   * card's `supportedInterfaces[0].url`. Defaults to the relative
   * `{prefix}/a2a` when not provided; production cards should set it (the
   * spec requires an absolute HTTPS URL).
   */
  url?: string
  /** Swap the task store; defaults to a per-adapter in-memory store. */
  taskStore?: TaskStore
  /**
   * Per-request auth resolver — the same injection point `agent-service`'s own
   * `asMiddleware()` uses (`AgentServiceOptions.resolveAuth`) and that
   * `agent-server` forwards verbatim. The adapter calls it to build the
   * `RequestContext` threaded into `handleToolCall`, so scoped/$rate-limited
   * tools are decidable over the a2a transport.
   *
   * Thesis §4 tier 0: every transport must express WHO IS ASKING, even when
   * the answer is anonymous. When this is absent — or when it throws — the
   * adapter still forwards an explicit anonymous context (`{ userId: null }`)
   * rather than nothing, so the gate always has something to decide against.
   * Fail-closed is preserved: an anonymous context 401s on a scoped binding.
   */
  resolveAuth?: (req: Request) => RequestContext | Promise<RequestContext>
}

export interface A2aAdapter {
  asMiddleware(): (req: Request) => Promise<Response | null>
}
