// Adapted from toy-midi's `src/lib/rpc/core.ts`, without its worker callback
// serialization, and keeping a method's optional params optional.

export type RpcClient<Handlers> = {
  [Method in keyof Handlers]: Handlers[Method] extends (
    ...args: infer Args
  ) => Promise<infer Result>
    ? (...args: Args) => Promise<Result>
    : never;
};

export function createRpcProxy<Handlers>(
  call: (method: string, params: unknown) => Promise<unknown>,
): RpcClient<Handlers> {
  return new Proxy({} as RpcClient<Handlers>, {
    get(_target, property) {
      if (
        typeof property !== "string" ||
        property === "then" ||
        property === "toJSON"
      ) {
        return undefined;
      }
      return (params: unknown) => call(property, params);
    },
  });
}
