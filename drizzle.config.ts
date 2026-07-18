throw new Error(
  "The legacy Drizzle configuration is disabled: legacy LFMS production tables are immutable. "
  + "Use a dedicated sidecar control-plane/tenant configuration once provisioned; do not target DATABASE_URL.",
);
