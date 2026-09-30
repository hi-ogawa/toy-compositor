# Development

```sh
pnpm install
uv sync                              # Python tools under tools/ for comparing renders
pnpm setup-sample samples/synthetic  # copy a sample into .local/projects/
pnpm dev                             # editor on .local/projects/
pnpm render <project.json> <output>  # render from source
pnpm update-media <project.json...>  # record the media info layers use
pnpm lint-check                      # format, lint, and typecheck
pnpm test-e2e                        # against the built CLI, E2E_SERVER=dev for the dev server
pnpm build                           # dist/client/ and dist/server/cli.js
pnpm dev-demo                        # editor without a server, see below
```

The editor and CLI run on Node 24 directly.

The dev server works on `.local/projects/`, and `TOY_COMPOSITOR_ROOT` points it at another projects root. Open a project directly with `?project=<project-dir>/<name>.json`, relative to that root.

## Static demo

`pnpm dev-demo` runs the editor with no server, over the bundled synthetic sample, and keeps saves in the tab's session storage. It is handy for UI work that needs no real projects or ffprobe. Use `pnpm dev` for anything that reads or writes project files.

`pnpm build-demo` builds the same thing as a static site. Cloudflare deploys it from `main` at https://toy-compositor.hiro18181.workers.dev, and each branch gets a preview whose URL the Cloudflare bot comments on its PR, which is a quick way to try a PR without checking it out.
