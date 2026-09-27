# Agent Guide

## Quick Reference

| Command         | When                                      |
| --------------- | ----------------------------------------- |
| `pnpm lint`     | Format, Lint, Typecheck after any changes |
| `pnpm test-e2e` | E2E tests (e2e/, playwright)              |

## Conventions

- Use [toy-midi](https://github.com/hi-ogawa/toy-midi) (checked out at `../toy-midi`) as the reference for architecture and code style, such as the runtime, store, and component patterns
- This application is desktop-only. Do not propose, evaluate, implement, or mention mobile or responsive behavior
- Commit messages: use Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`, `chore:`); add `!` for breaking changes
- File names: kebab-case
- Do not add compatibility paths or handling for edge cases that do not occur in practice
- Organize code so each chunk can be validated by one body of expertise. A reader meets files and diffs linearly and loads one such body at a time. Ask which single specialist could review a chunk alone, split where the needed expertise changes even with one caller, and keep code together when it shares one domain regardless of length
- When an existing test fails, first verify from first principles whether its expectation is correct. Do not compensate in the implementation merely to preserve an incorrect test.
- `pnpm test-e2e <test-file>` records traces by default locally and generates `test-results/trace-pack.html`. Use `E2E_TRACE=0` to disable tracing. CI leaves tracing off by default. `pnpm test-e2e-trace <test-file>` or `E2E_TRACE=1` explicitly enables tracing.
- Add short narrative comments before each logical phase of an E2E test, describing the user action and expected behavior so the comments alone convey the scenario. Use direct, verb-led wording for actions, such as “Render the synthetic sample project.”
- Order functions by reading flow, with primary entry points and callers before their implementation helpers
- Prefer `undefined` over `null`
- Prefer optional properties (`{ x?: T }`) over explicit undefined (`{ x: T | undefined }`)
- Make props/params required when all call sites always pass them
- Prefer a single options object over multiple primitive arguments (for example, `fn({ a, b })` rather than `fn(a: number, b: number)`)
- Use braces for every `switch` case body (`case "x": { ... }`, `default: { ... }`)
