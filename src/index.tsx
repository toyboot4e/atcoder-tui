import { render } from "ink";
import { App } from "./app.js";
import { runCli } from "./cli.js";
import { buildServices } from "./state/services.js";

if (!(await runCli(process.argv.slice(2)))) {
  const services = buildServices();
  render(<App services={services} />);
}
