/**
 * Default in-memory `TaskStore`. Insertion-ordered (a `Map`), unbounded by
 * count but process-local — swap it via `A2aAdapterOptions.taskStore` for any
 * deployment where tasks must outlive the process or be shared across
 * instances.
 */
import type { Task, TaskStore } from './types.ts'

export function createInMemoryTaskStore(): TaskStore {
  const tasks = new Map<string, Task>()
  return {
    get(id: string): Task | undefined {
      return tasks.get(id)
    },
    save(task: Task): void {
      // Re-insert on update so `list()` stays "most recently saved last".
      tasks.delete(task.id)
      tasks.set(task.id, task)
    },
    list(): Task[] {
      return [...tasks.values()]
    },
  }
}
