import { render } from "ink";
import { App } from "./app.js";
import { buildServices } from "./state/services.js";

const services = buildServices();
render(<App services={services} />);
