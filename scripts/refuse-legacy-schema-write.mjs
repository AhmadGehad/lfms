const message = [
  "Legacy schema writes are disabled.",
  "DATABASE_URL may point at live LFMS customer data and must not be migrated, pushed, backfilled, or altered.",
  "Provision the additive SaaS control plane and per-tenant databases, then use their dedicated migration tooling.",
].join(" ");

process.stderr.write(`${message}\n`);
process.exitCode = 1;
