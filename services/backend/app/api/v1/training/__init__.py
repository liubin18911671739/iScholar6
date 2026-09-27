"""Training / organization / LMS API (``/v1/training/*``).

RLS is replaced by API-layer authorization: routers resolve the caller's global
role and program/org access via ``app.api.v1.training.deps`` and apply the pure
policy in ``app.core.authz``.
"""

from fastapi import APIRouter

from app.api.v1.training import (
    analytics,
    calendar,
    certificates,
    consents,
    enrollments,
    export,
    lms,
    me,
    nudge,
    organizations,
    peer,
    programs,
    progress,
    report,
    reviews,
    submissions,
    task_packs,
    tasks,
)

router = APIRouter(prefix="/training")
router.include_router(programs.router)
router.include_router(enrollments.router)
router.include_router(tasks.router)
router.include_router(progress.router)
router.include_router(report.router)
router.include_router(organizations.router)
router.include_router(submissions.router)
router.include_router(me.router)
router.include_router(reviews.router)
router.include_router(peer.router)
router.include_router(certificates.program_router)
router.include_router(certificates.me_router)
router.include_router(certificates.verify_router)
router.include_router(consents.router)
router.include_router(nudge.router)
router.include_router(task_packs.router)
router.include_router(calendar.router)
router.include_router(analytics.router)
router.include_router(export.router)
router.include_router(lms.link_router)
router.include_router(lms.gradebook_router)
