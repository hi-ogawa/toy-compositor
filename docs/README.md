<!--
Writing conventions for these docs:

- Docs hold only durable, high-level architecture and existing facts, such as what each part is responsible for, how data and control flow between parts, and rules that span files. Write them so a reader can skim the design without the code open, and do not inventory component trees, function names, or file lists, which the code already shows and which churn with every refactor.
- Decisions and their reasons belong in issues and PRs. Contrasts with alternatives a doc never presents, such as "rejected rather than resolved", are decision reasons too.
- A reference, such as project-format.md, states rules as facts about the file, not as what loading does when they are broken. A guide, such as getting-started.md, tells the reader what happens and what to run, which includes when a command rejects a project.
- A change updates docs only when one of those facts changes.
-->

# Docs

- [getting-started.md](getting-started.md): installing and upgrading, project folders, and going from media to a render
- [project-format.md](project-format.md): the project JSON, its layers and clips, and `media`
- [compiler.md](compiler.md): how a project becomes one ffmpeg command
- [editor.md](editor.md): the editor's screen regions, how it composes a project in the DOM, and playback
- [preprocessing.md](preprocessing.md): preparing camera footage before it goes into a project
- [development.md](development.md): commands and gotchas for working on the repository
- [e2e.md](e2e.md): E2E traces locally and on GitHub Actions
- [samples/README.md](../samples/README.md): the synthetic and local samples
