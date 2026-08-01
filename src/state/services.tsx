import { type Config, loadConfig } from "../config.js";
import { type ReactNode, createContext, useContext } from "react";
import { AtcoderClient } from "../net/http.js";
import { DiskCache } from "../cache.js";
import { LoadMeter } from "../net/load.js";
import { Notices } from "./notices.js";
import { cacheDir } from "../platform.js";
import path from "node:path";

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
    cache: config.cache ? new DiskCache(dir) : null,
    cookie: config.revelSession,
    meter,
    requestsPerMinute: config.requestsPerMinute,
  });
  return { client, config, meter, notices: new Notices(), warnings };
}

const ServicesContext = createContext<Services | null>(null);

export function ServicesProvider({
  services,
  children,
}: {
  services: Services;
  children: ReactNode;
}) {
  return <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>;
}

export function useServices(): Services {
  const services = useContext(ServicesContext);
  if (services === null) throw new Error("useServices outside ServicesProvider");
  return services;
}
