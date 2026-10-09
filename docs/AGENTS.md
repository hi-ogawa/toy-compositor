# Writing Docs

- Write each doc for the question its reader brings:
  - project-format.md is a reference. It answers what a project means and what makes it valid.
  - compiler.md and editor.md are explanations. They answer how rendering and the editor work, such as what each part is responsible for, how data and control flow between parts, and rules that span files, so a reader can follow them without the code open. They do not inventory component trees, function names, or file lists, which the code already shows and which churn with every refactor.
  - getting-started.md, preprocessing.md, development.md, and e2e.md are guides. They answer what to do, including what to run when a command rejects something.
- Use Title Case for headings. In explanations, phrase each section heading as the action the section explains, such as “Cut Each Clip to the Output”, and keep plain labels for lists such as “Known Gaps”.
- Write naturally for a first-time reader, without the awkward or defensive tone that builds up when a doc is revised alongside code changes.
