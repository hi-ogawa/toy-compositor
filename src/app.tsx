import { Editor } from "./components/editor";

export function App() {
  const project = new URL(window.location.href).searchParams.get("project");
  if (!project) {
    return (
      <p className="p-4 text-destructive">
        No project to open. Add ?project=&lt;url&gt; to the page URL, for
        example ?project=/files/samples/synthetic/project.json
      </p>
    );
  }
  const projectUrl = new URL(project, window.location.href).href;
  return <Editor projectUrl={projectUrl} />;
}
