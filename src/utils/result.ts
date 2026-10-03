export type Result<T, E = unknown> =
  | { ok: true; value: T }
  | { ok: false; error: E };
