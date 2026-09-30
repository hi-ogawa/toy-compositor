import { Editor } from "./components/editor";
import { ProjectList } from "./components/project-list";

export function App() {
  const params = new URL(window.location.href).searchParams;
  const dir = params.get("project");
  const file = params.get("file");
  return dir && file ? <Editor location={{ dir, file }} /> : <ProjectList />;
}
