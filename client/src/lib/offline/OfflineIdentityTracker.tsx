import { useOfflineIdentity } from "./useOfflineSync";

/**
 * Keeps the persisted-cache bucket name in step with the signed-in user,
 * company, and selected farm.
 *
 * Rendered only inside the authenticated shell so the identity queries never
 * fire on the login screen, and rendered for both design systems so offline
 * support does not depend on which UI a company is using.
 */
export function OfflineIdentityTracker() {
  useOfflineIdentity();
  return null;
}
