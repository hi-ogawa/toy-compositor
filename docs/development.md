# Development

```sh
pnpm install
uv sync                              # Python tools under tools/ for comparing renders
pnpm setup-sample samples/synthetic  # copy a sample into .local/projects/
pnpm dev                             # editor on .local/projects/
pnpm render <project.json> <output>  # render from source
pnpm lint-check                      # format, lint, and typecheck
pnpm test-e2e                        # against the built CLI, E2E_SERVER=dev for the dev server
pnpm build                           # dist/client/ and dist/server/cli.js
pnpm dev-demo                        # editor as a static site, see below
```

The editor and CLI run on Node 24 directly. See [samples/README.md](../samples/README.md) for the synthetic and local samples, [e2e.md](e2e.md) for E2E traces on GitHub Actions, and [working-media.md](working-media.md) for preparing camera footage.

## Projects root

The editor works on a projects root laid out as `<root>/<project-dir>/<name>.json`, where each project directory holds its project JSON files and their media. The dev server's root is `.local/projects/`, and `TOY_COMPOSITOR_ROOT` overrides it. `toy-compositor serve <root>` serves any other directory the same way.

The start page lists the root's projects, and opening one navigates to `?project=<project-dir>/<name>.json`. The server reads and saves projects and serves their media through `/api/`, resolving media relative to the project file as the renderer does. It listens on localhost only, rejects requests addressed to other hosts, and never serves hidden paths under the root.

## Static demo

`pnpm build-demo` builds the editor into `dist/demo/` as a static site over the synthetic sample, with no server. [vite.demo.config.ts](../vite.demo.config.ts) resolves [src/lib/api-client.ts](../src/lib/api-client.ts), the editor's only access to the server, to [src/lib/api-client-demo.ts](../src/lib/api-client-demo.ts). The demo module serves the bundled sample, keeps saves until reload, and inlines media as data URLs so videos can seek on hosts that ignore range requests. [wrangler.jsonc](../wrangler.jsonc) deploys it as Cloudflare static assets.
