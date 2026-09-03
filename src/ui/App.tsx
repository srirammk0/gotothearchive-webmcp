import { AnimatePresence, motion } from "motion/react";
import { BrowserRouter, Route, Routes, useLocation } from "react-router";
import { Rail } from "./Rail";
import { DemoBanner } from "./DemoBanner";
import { Breadcrumbs, TrailProvider } from "./Breadcrumbs";
import { ease, duration } from "./tokens";
import { Archive } from "../routes/Archive";
import { Workbench } from "../routes/Workbench";
import { Taste } from "../routes/Taste";
import { Stats } from "../routes/Stats";

/** Routes cross-fade and lift; the chrome above them never moves. */
function AnimatedRoutes() {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.main
        key={location.pathname.split("/").slice(0, 2).join("/")}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: duration.base, ease }}
        className="mx-auto w-full max-w-[1440px] px-5 py-10 sm:px-8 sm:py-14"
      >
        <Breadcrumbs />
        <Routes location={location}>
          <Route path="/" element={<Archive />} />
          <Route path="/workbench/:artifactId?" element={<Workbench />} />
          <Route path="/taste" element={<Taste />} />
          <Route path="/stats" element={<Stats />} />
        </Routes>
      </motion.main>
    </AnimatePresence>
  );
}

export function App({ demo = false }: { demo?: boolean }) {
  return (
    <BrowserRouter>
      <TrailProvider>
        <div className="flex min-h-full flex-col">
          {demo ? <DemoBanner /> : null}
          <Rail />
          <AnimatedRoutes />
        </div>
      </TrailProvider>
    </BrowserRouter>
  );
}
