import { render } from "preact";
import { App } from "./App.tsx";
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "./styles.css";

render(<App />, document.getElementById("root")!);
