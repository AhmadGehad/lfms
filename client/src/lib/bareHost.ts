// Bare-domain visitors (no company subdomain) get the marketing page; a
// company workspace only exists on <slug>.<base-domain>.
export function isBareHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === "localhost" || /^[0-9.]+$/.test(host) || host.includes(":")) return true;
  if (host.endsWith(".localhost")) return false;
  const labels = host.split(".");
  if (labels[0] === "www") return true;
  return labels.length <= 2;
}
