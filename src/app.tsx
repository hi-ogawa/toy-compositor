import { Editor } from "./components/editor";
import { ProjectList } from "./components/project-list";
import { getProjectUrl } from "./lib/project-storage";

export function App() {
  return getProjectUrl() ? <Editor /> : <ProjectList />;
}
