import { expect, test } from "bun:test";

// The audit failure this guards: WebMCP registration only ran behind a route
// or panel that a capture never reached. <WebMcpProvider> is the one owner of
// registrar.sync and must mount unconditionally on every route, above <Routes>.
const src = await Bun.file(new URL("./App.tsx", import.meta.url)).text();

test("WebMcpProvider wraps the routed tree, unconditionally, inside the router", () => {
  // The App component body: everything from `export function App` on.
  const body = src.slice(src.indexOf("export function App"));

  const open = body.indexOf("<WebMcpProvider>");
  const routerOpen = body.indexOf("<BrowserRouter>");
  const routes = body.indexOf("<AnimatedRoutes");
  const close = body.indexOf("</WebMcpProvider>");

  expect(routerOpen).toBeGreaterThan(-1);
  expect(open).toBeGreaterThan(routerOpen); // inside the router (needs useLocation)
  expect(open).toBeLessThan(routes); // wraps the routed tree
  expect(routes).toBeLessThan(close);

  // Unconditional: not gated on the `demo` prop or any `&&` / `?` just before it.
  expect(body).not.toMatch(/(\?|&&|demo\b)[^\n]*<WebMcpProvider>/);
});

test("App renders one WebMcpProvider for both <App/> and <App demo/>", () => {
  expect(src.match(/<WebMcpProvider>/g)).toHaveLength(1);
});
