# E2E traces

Local runs record traces in `test-results/trace-pack.html` by default. Use `E2E_TRACE=0` to disable tracing or `pnpm test-e2e-trace` to explicitly enable it. CI runs with tracing off by default.

```sh
pnpm test-e2e e2e/render.spec.ts
```

## E2E traces on GitHub Actions

Add the `e2e-trace` label to a same-repository PR to trace changed E2E specs on each push. Find the trace link in the PR description. Remove the label to stop automatic runs.

To trace existing specs that the PR does not change, or test a branch manually:

```sh
gh workflow run e2e-trace.yml --ref main \
  -f ref=my-branch \
  -f tests='e2e/render.spec.ts'
```

Separate test file filters with spaces. Add `-f grep='synthetic'` to filter by test title. You can also run **E2E trace** from the repository's Actions tab.
