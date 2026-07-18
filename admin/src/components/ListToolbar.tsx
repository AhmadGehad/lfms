import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search } from "lucide-react";

export function ListToolbar({
  search,
  onSearch,
  placeholder,
  status,
  onStatus,
  statuses,
}: {
  search: string;
  onSearch: (value: string) => void;
  placeholder: string;
  status?: string;
  onStatus?: (value: string) => void;
  statuses?: readonly string[];
}) {
  return (
    <div className="mb-3 flex flex-col gap-2 border border-border bg-card p-2 sm:flex-row sm:items-center">
      <div className="relative w-full max-w-sm">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={search} onChange={event => onSearch(event.target.value)} className="h-9 pl-8" placeholder={placeholder} aria-label={placeholder} />
      </div>
      {statuses && onStatus && (
        <Select value={status || "all"} onValueChange={onStatus}>
          <SelectTrigger className="h-9 w-full sm:w-44"><SelectValue placeholder="All statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {statuses.map(value => <SelectItem value={value} key={value} className="capitalize">{value.replaceAll("_", " ")}</SelectItem>)}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
