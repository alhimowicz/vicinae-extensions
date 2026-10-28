import { absolutePath } from "./platform.ts";

export type Runtime = { node: string; worker: string; native: string; python?: string };

export function validateRuntime(runtime: Runtime): Runtime {
  if (!runtime || ![runtime.node, runtime.worker, runtime.native].every(absolutePath) || (runtime.python && !absolutePath(runtime.python))) {
    throw new Error("Invalid launcher runtime. Open Web Apps to refresh this launcher.");
  }
  return { node: runtime.node, worker: runtime.worker, native: runtime.native, python: runtime.python };
}
