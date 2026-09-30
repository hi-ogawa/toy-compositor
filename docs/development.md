# Development

```sh
pnpm install
uv sync                              # Python tools under tools/ for comparing renders
pnpm setup-sample samples/synthetic  # copy a sample into .local/projects/
pnpm dev                             # editor with the folders in .local/projects/
pnpm render <project.json> <output>  # render from source
pnpm update-media <project.json...>  # record the media info layers use
pnpm lint-check                      # format, lint, and typecheck
pnpm test-e2e                        # against the built CLI, E2E_SERVER=dev for the dev server
pnpm build                           # dist/client/ and dist/server/cli.js
pnpm dev-demo                        # editor without a server, see below
```

The dev server keeps its project folder registry in `.local/config/` and adds each folder in `.local/projects/` at startup. `TOY_COMPOSITOR_CONFIG_DIR` points the dev server or the CLI at another registry, as e2e tests do with `.local/e2e-config/`. Open a project file directly with `?project=<absolute-path>.json`.

## Static demo

`pnpm dev-demo` and `pnpm build-demo` run the same editor over a fake server API that answers from the bundled synthetic sample, and saves stay in the tab's session storage. It needs no project folders or ffprobe, and Cloudflare deploys it from `main` at https://toy-compositor.hiro18181.workers.dev, with a preview for each branch that the Cloudflare bot links on its PR. Anything that depends on real files or the server still needs `pnpm dev`.
