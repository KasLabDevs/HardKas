import type { Hardkas } from "./index.js";

export interface TaskArgs {
  [key: string]: string | boolean | undefined;
}

export interface TaskContext {
  hardkas: Hardkas;
  args: TaskArgs;
}

export type TaskAction = (ctx: TaskContext) => Promise<void>;

export interface TaskDefinition {
  name: string;
  description?: string | undefined;
  action: TaskAction;
}

/**
 * Global task registry.
 */
class TaskRegistry {
  private readonly tasks = new Map<string, TaskDefinition>();

  defineTask(name: string, action: TaskAction): void;
  defineTask(name: string, description: string, action: TaskAction): void;
  defineTask(name: string, descriptionOrAction: string | TaskAction, action?: TaskAction): void {
    let description: string | undefined;
    let finalAction: TaskAction;

    if (typeof descriptionOrAction === "string") {
      description = descriptionOrAction;
      finalAction = action!;
    } else {
      finalAction = descriptionOrAction;
    }

    this.tasks.set(name, {
      name,
      description,
      action: finalAction
    });
  }

  getTask(name: string): TaskDefinition | undefined {
    return this.tasks.get(name);
  }

  getTasks(): TaskDefinition[] {
    return Array.from(this.tasks.values());
  }
}

export const taskRegistry = new TaskRegistry();

/**
 * Defines a new HardKAS task.
 * Used in hardkas.config.ts to extend CLI functionality.
 */
export const defineTask = taskRegistry.defineTask.bind(taskRegistry);
