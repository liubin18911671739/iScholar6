/**
 * Generic Agent Inputs (components/plugins/generic-agent-inputs.tsx)
 *
 * Functionality:
 * - Renders dynamic form inputs for a plugin agent from its declarative `InputFieldDef` list.
 * - Supports text, textarea, number, and select fields, wiring values through `fieldState` and `setField`.
 *
 * @author mrpi
 * @date 2026-09-16
 */

"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { InputProps } from "@/components/agents/agent-page-template";
import type { InputFieldDef } from "@/lib/plugins/types";

/** Renders plugin-defined input fields with bound state and change handling. */
export function GenericPluginAgentInputs({
  fields,
  fieldState,
  setField,
}: InputProps & { fields: InputFieldDef[] }) {
  return (
    <div className="space-y-4">
      {fields.map((field) => {
        const value = fieldState[field.name] ?? field.defaultValue ?? "";
        return (
          <div key={field.name} className="space-y-1.5">
            <Label htmlFor={`plugin-field-${field.name}`}>
              {field.label}
              {field.required ? " *" : ""}
            </Label>
            {field.type === "textarea" ? (
              <Textarea
                id={`plugin-field-${field.name}`}
                value={value}
                placeholder={field.placeholder}
                onChange={(e) => setField(field.name, e.target.value)}
                rows={4}
              />
            ) : field.type === "select" ? (
              <select
                id={`plugin-field-${field.name}`}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={value}
                onChange={(e) => setField(field.name, e.target.value)}
              >
                <option value="">—</option>
                {(field.options ?? []).map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            ) : (
              <Input
                id={`plugin-field-${field.name}`}
                type={field.type === "number" ? "number" : "text"}
                value={value}
                placeholder={field.placeholder}
                onChange={(e) => setField(field.name, e.target.value)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
