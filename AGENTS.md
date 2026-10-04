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
- Function names: start with a verb for the action the function performs, so a call site reads as what happens rather than what comes back. Components, hooks, and other constructs with their own ecosystem naming conventions follow those instead
- Do not add compatibility paths or handling for edge cases that do not occur in practice
- Write comments like toy-midi, mostly inline `//` comments on why something happens at a spot. Keep a docblock only when it states a rule the code does not make obvious, and never one that restates a name, signature, or literal value
- Write repeated UI chrome, such as panel bands, inline with its classes at each site, like toy-midi. Name components for a region or behavior, such as `InspectorTitle`, rather than extracting styling wrappers whose props only vary styling
- Organize code so each chunk can be validated by one body of expertise. A reader meets files and diffs linearly and loads one such body at a time. Ask which single specialist could review a chunk alone, split where the needed expertise changes even with one caller, and keep code together when it shares one domain regardless of length
- When an existing test fails, first verify from first principles whether its expectation is correct. Do not compensate in the implementation merely to preserve an incorrect test.
- `pnpm test-e2e <test-file>` records traces by default locally and generates `test-results/trace-pack.html`. Use `E2E_TRACE=0` to disable tracing. CI leaves tracing off by default. `pnpm test-e2e-trace <test-file>` or `E2E_TRACE=1` explicitly enables tracing. For selected branch traces on GitHub Actions with artifact links, see [E2E traces on GitHub Actions](docs/e2e.md).
- Add short narrative comments before each logical phase of an E2E test, describing the user action and expected behavior so the comments alone convey the scenario. Use direct, verb-led wording for actions, such as “Render the synthetic sample project.”
- Order functions by reading flow, with primary entry points and callers before their implementation helpers
- Prefer `undefined` over `null`
- Prefer optional properties (`{ x?: T }`) over explicit undefined (`{ x: T | undefined }`)
- Make props/params required when all call sites always pass them
- Shape arguments the way a reader expects from the operation. Take a value positionally when the operation conventionally takes just that value. Use an options object when a call site would be ambiguous without names
- Use braces for every `switch` case body (`case "x": { ... }`, `default: { ... }`)
- Docs hold only durable, high-level architecture and existing facts. Decisions and their reasons belong in issues and PRs. A change updates docs only when one of those facts changes. Logic that lives in one or two files gets no doc section of its own

## Current Notes

Provisional notes about the code as it is now. Remove a note when the code moves on or the lesson is absorbed.

- Keep `EditorRuntime` methods generic, taking explicit values such as `addLocator(time)`. The `use-*-interaction` hooks own placement and snapping policy, such as reading the playhead and snapping it to a frame (#132)
- Do not add e2e checks for `--help` text, the bundled paths it prints, or package file lists. Verify packaging by hand (#148)
