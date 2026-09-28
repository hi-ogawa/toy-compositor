import { Editor } from "./components/editor";

export function App() {
  const projectPath = new URL(window.location.href).searchParams.get("project");
  if (!projectPath) {
    return (
      <p className="p-4 text-destructive">
        No project to open. Add ?project=&lt;path&gt; to the page URL with a
        path relative to the projects root, for example
        ?project=synthetic/project.json
      </p>
    );
  }
  return <Editor projectPath={projectPath} />;
}
