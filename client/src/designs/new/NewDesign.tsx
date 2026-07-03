import NewShell from "./NewShell";
import { NewAppRoutes } from "./NewRoutes";

/**
 * The New design: redesigned shell wrapping the New route table. Redesigned
 * pages (Dashboard, Animals, Animal Profile) are swapped in via NewAppRoutes;
 * not-yet-ported pages render their Old version inside the New shell. Shares all
 * data/permissions with Old.
 */
export default function NewDesign() {
  return (
    <NewShell>
      <NewAppRoutes />
    </NewShell>
  );
}
