import { BrowserRouter, Route, Routes } from "react-router";
import { Rail } from "./Rail";
import { Archive } from "../routes/Archive";
import { Workbench } from "../routes/Workbench";
import { Taste } from "../routes/Taste";

export function App() {
  return (
    <BrowserRouter>
      <div className="mx-auto flex min-h-full max-w-[1400px] flex-col items-stretch gap-8 px-5 py-8 sm:gap-10 sm:px-8 sm:py-12 lg:flex-row lg:items-start lg:gap-12">
        <Rail />
        <div className="min-w-0 flex-1">
          <Routes>
            <Route path="/" element={<Archive />} />
            <Route path="/workbench/:artifactId?" element={<Workbench />} />
            <Route path="/taste" element={<Taste />} />
          </Routes>
        </div>
      </div>
    </BrowserRouter>
  );
}
