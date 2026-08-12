import { Search } from "lucide-react";
import { Input } from "@/components/ui";

/**
 * Search box for the admin lists.
 *
 * The paginated lists (tenants, users, subscriptions, requests) filter on the
 * server. The rest are loaded whole, so their filtering is client-side — this
 * is just the shared input so every list looks and behaves the same.
 */
export function ListSearch({
  value,
  onChange,
  placeholder,
  name,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  name: string;
}) {
  return (
    <div className="relative w-full sm:w-56">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
      <Input
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        className="pl-9"
      />
    </div>
  );
}

/** Case-insensitive "does any of these fields contain the query" match. */
export function matchesQuery(query: string, ...fields: unknown[]): boolean {
  if (!query) return true;
  const needle = query.toLowerCase();
  return fields.some((field) => String(field ?? "").toLowerCase().includes(needle));
}
