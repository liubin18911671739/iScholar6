import { describe, expect, it } from "vitest";
import {
  isMissingColumnError,
  isMissingRelationError,
} from "@/lib/server/schema-compat";

describe("schema-compat error detectors", () => {
  it("detects missing table messages from PostgREST", () => {
    expect(
      isMissingRelationError(
        "Could not find the table 'public.training_peer_assignments' in the schema cache"
      )
    ).toBe(true);
    expect(isMissingRelationError("permission denied")).toBe(false);
  });

  it("detects missing column messages", () => {
    expect(
      isMissingColumnError("column training_programs.status does not exist")
    ).toBe(true);
    expect(
      isMissingColumnError("Could not find the 'role' column of 'training_enrollments'")
    ).toBe(true);
  });
});
