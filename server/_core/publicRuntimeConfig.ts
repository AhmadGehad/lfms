import type { Express } from "express";

import {
  buildPublicRuntimeConfig,
  serializePublicRuntimeConfig,
} from "../../shared/publicRuntimeConfig";

export {
  buildPublicRuntimeConfig,
  serializePublicRuntimeConfig,
  type PublicRuntimeConfig,
} from "../../shared/publicRuntimeConfig";

export function registerPublicRuntimeConfig(app: Express) {
  app.get("/runtime-config.js", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.type("application/javascript");
    res.send(serializePublicRuntimeConfig(buildPublicRuntimeConfig(process.env)));
  });
}
