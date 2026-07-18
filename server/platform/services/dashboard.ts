import { countCompanyTotals } from "../repositories/companies";
import { countFarmTotal } from "../repositories/farms";
import { countMembershipTotal } from "../repositories/memberships";
import { countJobTotals, countSecurityTotals } from "../repositories/operations";

export async function getPlatformDashboard() {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1_000);
  const [companies, farms, memberships, jobs, security] = await Promise.all([
    countCompanyTotals(),
    countFarmTotal(),
    countMembershipTotal(),
    countJobTotals(),
    countSecurityTotals(since),
  ]);
  return { companies, farms, memberships, jobs, security, generatedAt: new Date() };
}
