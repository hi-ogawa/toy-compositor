# Writing docs

- Write each doc for the question its reader brings:
  - project-format.md is a reference. It answers what a project means and what makes it valid.
  - compiler.md and editor.md are explanations. They answer how rendering and the editor work, such as what each part is responsible for, how data and control flow between parts, and rules that span files, so a reader can follow them without the code open. They do not inventory component trees, function names, or file lists, which the code already shows and which churn with every refactor.
  - getting-started.md, preprocessing.md, development.md, and e2e.md are guides. They answer what to do, including what to run when a command rejects something.
- Describe the system as if it had always been the way it is. How it got here and where it is going, such as decisions and their reasons, alternatives that were not taken ("rejected rather than resolved"), and progress ("only … so far"), belong in issues and PRs.
- After drafting, reread the change as someone who has not seen the issue or PR. A sentence that only makes sense with that discussion in mind belongs in the discussion.
