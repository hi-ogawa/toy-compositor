# Writing docs

- Docs hold only durable, high-level facts about what exists, such as what each part is responsible for, how data and control flow between parts, rules that span files, and what a project file means. Write them so a reader can skim the design without the code open, and do not inventory component trees, function names, or file lists, which the code already shows and which churn with every refactor.
- Decisions and their reasons belong in issues and PRs. Contrasts with alternatives a doc never presents, such as "rejected rather than resolved", are decision reasons too.
- Write each doc for the question its reader brings. A reference, such as project-format.md, answers what a project means and what makes it valid. A guide, such as getting-started.md, answers what to do, including how to fix a project a command rejects.
- A change that makes something a doc states untrue updates that doc in the same PR.
