# Agent Guide

- Read README.md for the motivation and layout.
- Never commit media, images, or renders. Keep raw data in gitignored folders and add or update a `fetch.sh` that reproduces it.
- Source media is large, so copy only what an experiment needs and never unzip archives wholesale. The archive of past covers is on the `e-1800` drive under `hiroshi/projects/`.
- Start each experiment in its own `prototypes/<date>-<slug>/` folder with its own dependencies.
- Run `pnpm typecheck` after TypeScript changes.
- Commit messages use Conventional Commits. Commit each logical step as it lands.
