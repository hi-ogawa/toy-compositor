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

`pnpm dev-demo` and `pnpm build-demo` run the same editor over a fake server API: [src/lib/api-client-demo.ts](../src/lib/api-client-demo.ts) stands in for [src/lib/api-client.ts](../src/lib/api-client.ts) and answers from the bundled synthetic sample, and saves stay in the tab's session storage. It needs no projects root or ffprobe, and Cloudflare deploys it from `main` at https://toy-compositor.hiro18181.workers.dev, with a preview for each branch that the Cloudflare bot links on its PR. Anything that depends on real files or the server still needs `pnpm dev`.
