import PanelPage from "./PanelPage";
import { Dashboard } from "./Dashboard";

export default function App() {
  return window.location.pathname.replace(/\/$/, "") === "/mobile" ? <Dashboard mobile /> : <PanelPage />;
}
