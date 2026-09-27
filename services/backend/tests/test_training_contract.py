"""Request-model and route contracts for the training API (no database)."""

import uuid

from app.api.v1.training.enrollments import EnrollmentUpdate, EnrollmentUpsert
from app.api.v1.training.me import SubmissionSubmit
from app.api.v1.training.organizations import MemberUpsert, OrganizationCreate
from app.api.v1.training.peer import PeerReviewSubmit, anonymize_learner_token
from app.api.v1.training.programs import ProgramCreate, ProgramUpdate
from app.api.v1.training.reviews import ReviewAction
from app.api.v1.training.submissions import ReviewCreate, SubmissionUpdate, SubmissionUpsert
from app.api.v1.training.tasks import ProgramTaskInput, ProgramTasksReplace
from app.main import app

PROGRAM_ID = uuid.uuid4()
USER_ID = uuid.uuid4()


def test_program_create_accepts_camel_and_snake() -> None:
    camel = ProgramCreate.model_validate(
        {
            "name": "Spring Camp",
            "cohortName": "2026A",
            "startDate": "2026-03-01",
            "endDate": "2026-05-01",
            "maxMembers": 30,
            "organizationId": str(uuid.uuid4()),
        }
    )
    assert camel.cohort_name == "2026A"
    assert camel.start_date is not None and camel.start_date.isoformat() == "2026-03-01"
    assert camel.max_members == 30
    assert camel.organization_id is not None

    snake = ProgramCreate.model_validate({"name": "X", "cohort_name": "B"})
    assert snake.cohort_name == "B"
    assert ProgramUpdate.model_validate({"status": "active"}).status == "active"


def test_program_create_rejects_nonpositive_capacity() -> None:
    import pytest

    with pytest.raises(ValueError):
        ProgramCreate.model_validate({"name": "X", "maxMembers": 0})


def test_enrollment_aliases() -> None:
    upsert = EnrollmentUpsert.model_validate({"learnerId": str(USER_ID), "role": "ta"})
    assert upsert.learner_id == USER_ID
    assert upsert.role == "ta"
    assert EnrollmentUpdate.model_validate({"status": "completed"}).status == "completed"


def test_submission_and_review_aliases() -> None:
    submission = SubmissionUpsert.model_validate(
        {"programId": str(PROGRAM_ID), "taskId": "research-question", "answers": {"a": 1}}
    )
    assert submission.program_id == PROGRAM_ID
    assert submission.task_id == "research-question"
    assert SubmissionUpdate.model_validate({"claim": True}).claim is True

    review = ReviewCreate.model_validate({"decision": "approved", "feedback": "ok", "score": 88})
    assert review.decision == "approved"
    assert review.score == 88


def test_review_score_bounds() -> None:
    import pytest

    with pytest.raises(ValueError):
        ReviewCreate.model_validate({"decision": "approved", "score": 101})


def test_program_task_aliases_and_replace() -> None:
    task = ProgramTaskInput.model_validate(
        {"taskId": "t1", "ordinal": 2, "dueAt": "2026-04-01T00:00:00Z", "requiresReviewOverride": True}
    )
    assert task.task_id == "t1"
    assert task.requires_review_override is True
    replace = ProgramTasksReplace.model_validate({"tasks": [{"taskId": "t1"}, {"taskId": "t2"}]})
    assert len(replace.tasks) == 2


def test_org_models() -> None:
    org = OrganizationCreate.model_validate({"name": "Dept", "slug": "dept"})
    assert org.slug == "dept"
    member = MemberUpsert.model_validate({"userId": str(USER_ID), "role": "org_admin"})
    assert member.user_id == USER_ID


def test_me_submit_and_consent_alias() -> None:
    body = SubmissionSubmit.model_validate(
        {
            "programId": str(PROGRAM_ID),
            "taskId": "research-question",
            "answers": {"a": 1},
            "consentProof": {"consentId": str(uuid.uuid4()), "consentedAt": "2026-09-27T00:00:00Z"},
        }
    )
    assert body.program_id == PROGRAM_ID
    assert body.status == "submitted"
    assert body.consent_proof is not None
    assert SubmissionSubmit.model_validate({"programId": str(PROGRAM_ID), "taskId": "t"}).consent_proof is None


def test_review_action_claim_and_decision() -> None:
    claim = ReviewAction.model_validate({"submissionId": str(PROGRAM_ID), "claim": True})
    assert claim.claim is True
    unclaim = ReviewAction.model_validate({"submissionId": str(PROGRAM_ID), "claim": False})
    assert unclaim.claim is False
    decision = ReviewAction.model_validate({"submissionId": str(PROGRAM_ID), "decision": "approved", "score": 90})
    assert decision.decision == "approved"


def test_peer_review_and_anonymize() -> None:
    body = PeerReviewSubmit.model_validate(
        {"assignmentId": str(PROGRAM_ID), "decision": "approved", "evidenceCardIds": ["e1"]}
    )
    assert body.decision == "approved"
    assert body.evidence_card_ids == ["e1"]
    token = anonymize_learner_token(USER_ID)
    assert token == anonymize_learner_token(USER_ID)
    assert len(token) == 8
    assert token != anonymize_learner_token(PROGRAM_ID)


def test_training_route_inventory() -> None:
    paths = set(app.openapi()["paths"].keys())
    expected = {
        "/v1/training/programs",
        "/v1/training/programs/{program_id}",
        "/v1/training/programs/{program_id}/enrollments",
        "/v1/training/programs/{program_id}/enrollments/{enrollment_id}",
        "/v1/training/programs/{program_id}/tasks",
        "/v1/training/organizations",
        "/v1/training/organizations/{org_id}/members",
        "/v1/training/organizations/{org_id}/members/{member_user_id}",
        "/v1/training/submissions",
        "/v1/training/submissions/by-program",
        "/v1/training/submissions/{submission_id}",
        "/v1/training/submissions/{submission_id}/reviews",
        "/v1/training/me",
        "/v1/training/reviews",
        "/v1/training/peer",
        "/v1/training/programs/{program_id}/progress",
        "/v1/training/programs/{program_id}/report",
        "/v1/training/programs/{program_id}/certificates",
        "/v1/training/programs/{program_id}/consents",
        "/v1/training/programs/{program_id}/nudge",
        "/v1/training/programs/{program_id}/export",
        "/v1/training/programs/{program_id}/lms/link",
        "/v1/training/programs/{program_id}/lms/gradebook",
        "/v1/training/me/certificate",
        "/v1/training/certificates/verify",
        "/v1/training/task-packs",
        "/v1/training/calendar",
        "/v1/training/analytics/dashboard",
    }
    assert expected.issubset(paths)
