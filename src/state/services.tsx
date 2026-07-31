import { createContext, useContext, type ReactNode } from "react";
import path from "node:path";
import { DiskCache } from "../cache.js";
import { loadConfig, type Config } from "../config.js";
import { cacheDir } from "../platform.js";
import { AtcoderClient } from "../net/http.js";
import { LoadMeter } from "../net/load.js";
import { Notices } from "./notices.js";

export interface Services {
  config: Config;
  client: AtcoderClient;
  meter: LoadMeter;
  notices: Notices;
  warnings: string[];
}

export function buildServices(): Services {
  const { config, warnings } = loadConfig();
  const dir = cacheDir();
  const meter = new LoadMeter(path.join(dir, "requests.jsonl"));
  const client = new AtcoderClient({
    meter,
    cache: config.cache ? new DiskCache(dir) : null,
    cookie: config.revelSession,
    requestsPerMinute: config.requestsPerMinute,
  });
  return { config, client, meter, notices: new Notices(), warnings };
}

const ServicesContext = createContext<Services | null>(null);

export function ServicesProvider({ services, children }: { services: Services; children: ReactNode }) {
  return <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>;
}

export function useServices(): Services {
  const services = useContext(ServicesContext);
  if (services === null) throw new Error("useServices outside ServicesProvider");
  return services;
}
