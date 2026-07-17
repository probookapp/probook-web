// Shared month-bucketing for the admin analytics charts (signups / revenue).
//
// Honors an explicit startDate/endDate range (YYYY-MM-DD) when the dashboard
// date-range picker supplies one, and otherwise falls back to the trailing
// `months` window (default 12). Returns the query bounds plus the ordered list
// of "YYYY-MM" month keys to initialize the buckets so empty months render as 0.

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function resolveMonthRange(
  startDateParam: string | null,
  endDateParam: string | null,
  monthsParam: string | null
): { rangeStart: Date; rangeEnd: Date; monthKeys: string[] } {
  const start = startDateParam ? new Date(startDateParam) : null;
  const end = endDateParam ? new Date(endDateParam) : null;

  let rangeStart: Date;
  let rangeEndExclusive: Date;

  if (start && end && !isNaN(start.getTime()) && !isNaN(end.getTime())) {
    // First day of the start month → first day of the month after the end month.
    rangeStart = new Date(start.getFullYear(), start.getMonth(), 1);
    rangeEndExclusive = new Date(end.getFullYear(), end.getMonth() + 1, 1);
  } else {
    const months = Math.max(1, parseInt(monthsParam || "12", 10) || 12);
    const now = new Date();
    rangeStart = new Date(now.getFullYear(), now.getMonth() - months + 1, 1);
    rangeEndExclusive = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  }

  const monthKeys: string[] = [];
  const cursor = new Date(rangeStart);
  while (cursor < rangeEndExclusive) {
    monthKeys.push(monthKey(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return { rangeStart, rangeEnd: rangeEndExclusive, monthKeys };
}
