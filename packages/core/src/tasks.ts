export const types = {
  string: "string",
  number: "number",
  boolean: "boolean",
} as const;

export type TaskParamType = keyof typeof types;

export interface TaskParam<T = any> {
  name: string;
  description: string;
  type: TaskParamType;
  defaultValue?: T;
  isOptional: boolean;
}

export type TaskAction<Args = any, Hk = any> = (args: Args, hk: Hk) => Promise<any>;

export interface TaskDefinition<Args = any, Hk = any> {
  name: string;
  description: string;
  params: Record<string, TaskParam>;
  actionFn?: TaskAction<Args, Hk>;
  
  param(name: string, description: string, type?: TaskParamType, defaultValue?: any): this;
  action(fn: TaskAction<Args, Hk>): this;
}

export class TaskBuilder<Args = any, Hk = any> implements TaskDefinition<Args, Hk> {
  public params: Record<string, TaskParam> = {};
  public actionFn?: TaskAction<Args, Hk>;

  constructor(public name: string, public description: string) {}

  param(name: string, description: string, type: TaskParamType = "string", defaultValue?: any): this {
    this.params[name] = {
      name,
      description,
      type,
      defaultValue,
      isOptional: defaultValue !== undefined
    };
    return this;
  }

  action(fn: TaskAction<Args, Hk>): this {
    this.actionFn = fn;
    return this;
  }
}

export function task<Args = any, Hk = any>(name: string, description: string): TaskDefinition<Args, Hk> {
  return new TaskBuilder<Args, Hk>(name, description);
}
