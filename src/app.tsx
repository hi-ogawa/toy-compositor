import { Editor } from "./components/editor";
import { ProjectList } from "./components/project-list";

export function App() {
  const projectPath = new URL(window.location.href).searchParams.get("project");
  return projectPath ? <Editor projectPath={projectPath} /> : <ProjectList />;
}
