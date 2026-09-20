"""Skeleton evaluation-runner tests."""

from agent_eval.runner import build_report, main


def test_report_shape() -> None:
    report = build_report()
    assert report.datasets == 0
    assert report.backend_url.startswith("http")


def test_main_exits_zero() -> None:
    assert main() == 0
