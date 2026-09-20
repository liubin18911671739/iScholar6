/**
 * CompareTableStep (components/training/steps/compare-table-step.tsx)
 *
 * Functionality:
 * - Renders an editable comparison table step with candidate, novelty, value, feasibility, and keep/drop decision columns.
 * - Parses and serializes the stored string value via `step-types`, padding to the requested row count.
 * - Emits the updated serialized table on every cell change.
 *
 * Notes:
 * - Uses the shared `Input` primitive and caller-supplied localized column labels.
 *
 * @author mrpi
 * @date 2026-09-16
 */

"use client";

import { Input } from "@/components/ui/input";
import {
  emptyCompareRows,
  parseCompareTable,
  serializeCompareTable,
  type CompareTableRow,
} from "@/lib/training/step-types";

/** Props for {@link CompareTableStep}, including localized column labels. */
type Props = {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  rows?: number;
  labels: {
    candidate: string;
    novelty: string;
    value: string;
    feasibility: string;
    decision: string;
    keep: string;
    drop: string;
  };
};

/** Editable candidate comparison table step. */
export function CompareTableStep({
  value,
  onChange,
  disabled,
  rows = 3,
  labels,
}: Props) {
  const tableRows = (() => {
    const parsed = parseCompareTable(value);
    if (parsed.length >= rows) return parsed.slice(0, rows);
    return [...parsed, ...emptyCompareRows(rows - parsed.length)];
  })();

  // Patch a row and re-serialize the table into the stored value.
  function update(i: number, patch: Partial<CompareTableRow>) {
    const next = tableRows.map((r, idx) => (idx === i ? { ...r, ...patch } : r));
    onChange(serializeCompareTable(next));
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full min-w-[640px] text-left text-xs">
        <thead className="bg-muted/40">
          <tr>
            <th className="p-2 font-medium">#</th>
            <th className="p-2 font-medium">{labels.candidate}</th>
            <th className="p-2 font-medium">{labels.novelty}</th>
            <th className="p-2 font-medium">{labels.value}</th>
            <th className="p-2 font-medium">{labels.feasibility}</th>
            <th className="p-2 font-medium">{labels.decision}</th>
          </tr>
        </thead>
        <tbody>
          {tableRows.map((row, i) => (
            <tr key={i} className="border-t">
              <td className="p-2 text-muted-foreground">Q{i + 1}</td>
              <td className="p-1">
                <Input
                  value={row.candidate}
                  disabled={disabled}
                  onChange={(e) => update(i, { candidate: e.target.value })}
                  className="h-8 text-xs"
                />
              </td>
              <td className="p-1">
                <Input
                  value={row.novelty}
                  disabled={disabled}
                  onChange={(e) => update(i, { novelty: e.target.value })}
                  className="h-8 text-xs"
                />
              </td>
              <td className="p-1">
                <Input
                  value={row.value}
                  disabled={disabled}
                  onChange={(e) => update(i, { value: e.target.value })}
                  className="h-8 text-xs"
                />
              </td>
              <td className="p-1">
                <Input
                  value={row.feasibility}
                  disabled={disabled}
                  onChange={(e) => update(i, { feasibility: e.target.value })}
                  className="h-8 text-xs"
                />
              </td>
              <td className="p-1">
                <select
                  className="h-8 w-full rounded border bg-background px-1 text-xs"
                  disabled={disabled}
                  value={row.decision}
                  onChange={(e) =>
                    update(i, {
                      decision: e.target.value as CompareTableRow["decision"],
                    })
                  }
                >
                  <option value="">—</option>
                  <option value="keep">{labels.keep}</option>
                  <option value="drop">{labels.drop}</option>
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
