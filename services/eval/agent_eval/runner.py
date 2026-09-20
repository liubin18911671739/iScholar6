"""Evaluation runner entrypoint.

Stage 0 provides the runnable skeleton. Stage 5 adds per-agent datasets,
deterministic checks, an LLM judge, and threshold enforcement.
"""

import json
import os
import sys
from dataclasses import asdict, dataclass


@dataclass(frozen=True)
class EvalReport:
    """Summary emitted to stdout / CI artifacts."""

    status: str
    backend_url: str
    datasets: int
    note: str


def build_report() -> EvalReport:
    """Assemble the current evaluation report."""
    return EvalReport(
        status="skeleton",
        backend_url=os.environ.get("BACKEND_INTERNAL_URL", "http://backend:8000"),
        datasets=0,
        note="Evaluation datasets are introduced in Stage 5.",
    )


def main() -> int:
    """Print the JSON report and return a process exit code."""
    print(json.dumps(asdict(build_report()), indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
