# Agent Guide

## Quick Reference

| Command     | When                                      |
| ----------- | ----------------------------------------- |
| `pnpm lint` | Format, Lint, Typecheck after any changes |

## Conventions

- Use [toy-midi](https://github.com/hi-ogawa/toy-midi) (checked out at `../toy-midi`) as the reference for architecture and code style, such as the runtime, store, and component patterns. Write code fresh for this domain instead of copying from it
- This application is desktop-only. Do not propose, evaluate, implement, or mention mobile or responsive behavior
- Commit messages: use Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`, `chore:`); add `!` for breaking changes
- File names: kebab-case
- Do not add compatibility paths or handling for edge cases that do not occur in practice
- Organize code so each chunk can be validated by one body of expertise. A reader meets files and diffs linearly and loads one such body at a time. Ask which single specialist could review a chunk alone, split where the needed expertise changes even with one caller, and keep code together when it shares one domain regardless of length
- When an existing test fails, first verify from first principles whether its expectation is correct. Do not compensate in the implementation merely to preserve an incorrect test.
- Order functions by reading flow, with primary entry points and callers before their implementation helpers
- Prefer `undefined` over `null`
- Prefer optional properties (`{ x?: T }`) over explicit undefined (`{ x: T | undefined }`)
- Make props/params required when all call sites always pass them
- Prefer a single options object over multiple primitive arguments (for example, `fn({ a, b })` rather than `fn(a: number, b: number)`)
- Use braces for every `switch` case body (`case "x": { ... }`, `default: { ... }`)
