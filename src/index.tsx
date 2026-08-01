import { App } from "./app.js";
import { buildServices } from "./state/services.js";
import { render } from "ink";
import { runCli } from "./cli.js";

if (!(await runCli(process.argv.slice(2)))) {
  const services = buildServices();
  render(<App services={services} />);
}
