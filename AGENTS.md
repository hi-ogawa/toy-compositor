# Agent Guide

- Read README.md for the motivation and layout.
- Never commit media, images, or renders. Keep raw data in gitignored folders and add or update a `fetch.sh` that reproduces it.
- Source media is large, so copy only what an experiment needs and never unzip archives wholesale. The archive of past covers is on the `e-1800` drive under `hiroshi/projects/`.
- Record experiment findings under `research/<slug>/` and remove experiment code once it is superseded, linking to it by commit.
- Run `pnpm lint` after code changes.
- Commit messages use Conventional Commits. Commit each logical step as it lands.
