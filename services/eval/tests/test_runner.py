"""Evaluation-runner tests (offline, deterministic)."""

from agent_eval.datasets import DATASETS, recorded_output, run_checks
from agent_eval.runner import build_report, evaluate, main


def test_report_shape() -> None:
    report = build_report()
    assert report.datasets == len(DATASETS)
    assert report.status == "passed"
    assert report.score == 1.0
    assert report.mode == "offline"
    assert report.backend_url.startswith("http") or report.backend_url == ""


def test_main_exits_zero() -> None:
    assert main() == 0


def test_evaluate_detects_failures() -> None:
    report = evaluate(DATASETS, lambda _case: {}, threshold=0.8)
    assert report.status == "failed"
    assert report.failed == len(DATASETS)
    assert report.failures


def test_all_recorded_outputs_pass_checks() -> None:
    for case in DATASETS:
        assert run_checks(case, recorded_output(case)) == []


def test_checks_detect_bad_output() -> None:
    topic = next(case for case in DATASETS if case.id == "topic-basic")
    assert run_checks(topic, {"topics": []})
    submit = next(case for case in DATASETS if case.id == "submit-basic")
    assert run_checks(submit, {"journals": [{"name": "J", "fitScore": 80}]})


def test_judge_disabled_by_default(monkeypatch) -> None:
    from agent_eval import judge

    monkeypatch.delenv("EVAL_JUDGE", raising=False)
    monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)
    assert judge.judge_enabled() is False
    assert judge.judge_case("topic", {"topics": []}) is None


def test_report_has_no_judge_score_offline() -> None:
    assert build_report().judge_score is None
