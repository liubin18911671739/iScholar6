"""Request-model contracts for the research-core data API (no database)."""

import uuid

from app.api.v1.data.bib_items import BibItemCreate
from app.api.v1.data.blocks import BlockCreate, ReorderBody
from app.api.v1.data.manuscripts import ManuscriptCreate
from app.api.v1.data.projects import ProjectCreate, ProjectUpdate
from app.api.v1.data.tasks import TaskCreate

PROJECT_ID = uuid.uuid4()


def test_project_create_accepts_camel_and_snake() -> None:
    body = ProjectCreate.model_validate({"name": "Thesis", "discipline": "CS", "goal": "publish"})
    assert body.discipline == "CS"
    assert ProjectCreate.model_validate({"name": "Thesis", "goal": "x"}).goal == "x"
    assert ProjectUpdate.model_validate({"metadata": {"tags": ["a"]}}).metadata == {"tags": ["a"]}


def test_manuscript_create_alias() -> None:
    body = ManuscriptCreate.model_validate({"projectId": str(PROJECT_ID), "title": "Draft"})
    assert body.project_id == PROJECT_ID
    assert body.title == "Draft"


def test_block_create_aliases_and_reorder() -> None:
    block = BlockCreate.model_validate(
        {"manuscriptId": str(PROJECT_ID), "section": "intro", "authorType": "ai"}
    )
    assert block.manuscript_id == PROJECT_ID
    assert block.author_type == "ai"
    reorder = ReorderBody.model_validate(
        {"manuscriptId": str(PROJECT_ID), "orderedIds": [str(uuid.uuid4())]}
    )
    assert len(reorder.ordered_ids) == 1


def test_bib_item_create_aliases() -> None:
    body = BibItemCreate.model_validate(
        {"projectId": str(PROJECT_ID), "title": "Paper", "citationCount": 12, "authors": ["A"]}
    )
    assert body.project_id == PROJECT_ID
    assert body.citation_count == 12


def test_task_create_aliases() -> None:
    body = TaskCreate.model_validate({"projectId": str(PROJECT_ID), "title": "Read", "dueDate": "2026-10-01"})
    assert body.project_id == PROJECT_ID
    assert body.due_date == "2026-10-01"
