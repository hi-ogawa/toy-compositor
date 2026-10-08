# Writing docs

- Write each doc for the question its reader brings:
  - project-format.md is a reference. It answers what a project means and what makes it valid.
  - compiler.md and editor.md are explanations. They answer how rendering and the editor work, such as what each part is responsible for, how data and control flow between parts, and rules that span files.
  - getting-started.md, preprocessing.md, development.md, and e2e.md are guides. They answer what to do, including what to run when a command rejects something.
- Keep docs durable and high-level, so a reader can follow them without the code open. Do not inventory component trees, function names, or file lists, which the code already shows and which churn with every refactor.
- Decisions and their reasons belong in issues and PRs. Contrasts with alternatives a doc never presents, such as "rejected rather than resolved", are decision reasons too.
