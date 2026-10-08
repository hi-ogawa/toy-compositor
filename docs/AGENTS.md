# Writing docs

- Docs hold only durable, high-level architecture and existing facts, such as what each part is responsible for, how data and control flow between parts, and rules that span files. Write them so a reader can skim the design without the code open, and do not inventory component trees, function names, or file lists, which the code already shows and which churn with every refactor.
- Decisions and their reasons belong in issues and PRs. Contrasts with alternatives a doc never presents, such as "rejected rather than resolved", are decision reasons too.
- A reference, such as project-format.md, states rules as facts about the file, not as what loading does when they are broken. A guide, such as getting-started.md, tells the reader what happens and what to run, which includes when a command rejects a project.
- A change updates docs only when one of those facts changes.
