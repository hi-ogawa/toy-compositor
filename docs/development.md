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
pnpm dev-demo                        # editor as a static site, see below
```

The editor and CLI run on Node 24 directly. See [samples/README.md](../samples/README.md) for the synthetic and local samples, [e2e.md](e2e.md) for E2E traces on GitHub Actions, and [working-media.md](working-media.md) for preparing camera footage.

The dev server works on `.local/projects/`, and `TOY_COMPOSITOR_ROOT` points it at another projects root.

## Static demo

`pnpm build-demo` builds the editor into `dist/demo/` as a static site, which [wrangler.jsonc](../wrangler.jsonc) deploys as Cloudflare static assets. [vite.demo.config.ts](../vite.demo.config.ts) swaps [src/lib/api-client.ts](../src/lib/api-client.ts) for [src/lib/api-client-demo.ts](../src/lib/api-client-demo.ts), so a new `apiClient` method also needs a demo version. The demo inlines media as data URLs, because some static hosts ignore range requests and videos then cannot seek.
