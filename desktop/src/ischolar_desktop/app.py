"""Native PySide6 desktop interface for the iScholar application."""

from __future__ import annotations

import argparse
import json
import os
import sys
from typing import Any, Callable

from PySide6.QtCore import QObject, QRunnable, QSettings, Qt, QThreadPool, QTimer, Signal
from PySide6.QtGui import QFont
from PySide6.QtWidgets import (
    QApplication,
    QCheckBox,
    QComboBox,
    QDialog,
    QDialogButtonBox,
    QFormLayout,
    QFrame,
    QGridLayout,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QMainWindow,
    QMessageBox,
    QPushButton,
    QScrollArea,
    QSpinBox,
    QSplitter,
    QStackedWidget,
    QTabWidget,
    QTextBrowser,
    QTextEdit,
    QVBoxLayout,
    QWidget,
)

from .api import ApiClient, ApiError


APP_NAME = "iScholar"
NAV_ITEMS = [
    ("dashboard", "总览", "Dashboard"),
    ("projects", "研究项目", "Projects"),
    ("training", "科研训练营", "Training"),
    ("agents", "研究助手", "Research assistants"),
    ("tools", "研究工具", "Research tools"),
    ("settings", "设置", "Settings"),
]
AGENTS = [
    ("topic", "选题探索", "Topic discovery"),
    ("litreview", "文献综述", "Literature review"),
    ("design", "研究设计", "Research design"),
    ("data", "数据采集与分析", "Data collection & analysis"),
    ("write", "论文撰写", "Academic writing"),
    ("submit", "投稿匹配", "Journal submission"),
    ("rebuttal", "返修与展示", "Rebuttal & presentation"),
    ("research-plan", "协作研究计划", "Collaborative research plan"),
]
AGENT_FIELDS: dict[str, list[tuple[str, str, str]]] = {
    "topic": [("discipline", "学科领域", "例如：教育技术"), ("keywords", "研究关键词", "用逗号分隔"), ("targetJournal", "目标期刊", "可选")],
    "litreview": [("query", "检索问题", "描述需要综述的主题"), ("yearFrom", "起始年份", "例如：2018"), ("yearTo", "结束年份", "例如：2026"), ("maxResults", "最大结果数", "默认 50")],
    "design": [("researchQuestion", "研究问题", "明确可回答的问题"), ("methodology", "方法偏好", "定量、定性或混合方法")],
    "data": [("dataSource", "数据来源", "数据集或来源说明"), ("collectionMethod", "采集方法", "问卷、访谈、实验等")],
    "write": [("section", "论文部分", "例如：introduction"), ("citationStyle", "引用格式", "APA、MLA 等")],
    "submit": [("abstract", "论文摘要", "粘贴论文摘要"), ("keywords", "关键词", "用逗号分隔"), ("openAccess", "开放获取偏好", "yes / no")],
    "rebuttal": [("reviewerComments", "审稿意见", "逐条粘贴审稿意见")],
    "research-plan": [("researchGoal", "研究目标", "描述希望解决的研究问题"), ("discipline", "学科领域", "例如：教育技术"), ("keywords", "关键词", "用逗号分隔")],
}
TRAINING_TASKS = [
    ("research-question", "从兴趣到可检索研究问题", "topic", ["明确研究对象和场景", "比较三个候选问题", "填写保留或放弃理由", "提交最终研究问题"]),
    ("retrieval-query", "从关键词到多语言检索式", "litreview", ["拆分核心概念", "补充英文和同义词", "生成检索式", "记录检索调整理由"]),
    ("evidence-verification", "AI 输出与文献证据核验", "litreview", ["标记需要核验的陈述", "绑定文献和原文", "判断证据强度", "修改无依据结论"]),
    ("research-design", "把问题转成研究设计", "design", ["选择研究方法", "定义变量或材料", "说明样本与限制", "解释可行性"]),
    ("data-governance", "数据、版权与隐私判断", "data", ["说明数据来源", "识别隐私风险", "识别版权风险", "制定脱敏方案"]),
    ("responsible-writing", "负责任的学术写作", "write", ["选择段落结构", "标记 AI 参与环节", "完成事实核验", "填写作者修改说明"]),
    ("journal-decision", "期刊匹配与投稿决策", "submit", ["明确稿件主题", "比较三个期刊", "核对官网要求", "说明最终选择"]),
    ("rebuttal-action", "审稿意见转为修改行动", "rebuttal", ["分类审稿意见", "制定修改行动", "绑定证据或位置", "完成作者确认"]),
]

QSS = """
QMainWindow, QWidget { background: #f5f7fb; color: #142338; font-family: 'Inter', 'PingFang SC', 'Microsoft YaHei'; font-size: 13px; }
QFrame#sidebar { background: #10223a; border: none; }
QFrame#sidebar QLabel { color: #dbe7f5; }
QPushButton#nav { color: #dbe7f5; background: transparent; text-align: left; border: 0; border-radius: 8px; padding: 10px 12px; }
QPushButton#nav:hover, QPushButton#nav[active="true"] { background: #1f3b5d; color: white; }
QPushButton#primary { background: #167dff; color: white; border: 0; border-radius: 7px; padding: 9px 15px; font-weight: 600; }
QPushButton#primary:hover { background: #0864dc; }
QPushButton#secondary { background: white; color: #24364c; border: 1px solid #d4dce7; border-radius: 7px; padding: 8px 13px; }
QPushButton#danger { background: #fff0f0; color: #bd3434; border: 1px solid #f0c8c8; border-radius: 7px; padding: 8px 13px; }
QFrame#card { background: white; border: 1px solid #e2e8f0; border-radius: 11px; }
QLineEdit, QTextEdit, QComboBox, QSpinBox { background: white; border: 1px solid #d7dfeb; border-radius: 6px; padding: 8px; selection-background-color: #167dff; }
QTextBrowser { background: white; border: 0; }
QTabWidget::pane { background: white; border: 1px solid #e2e8f0; border-radius: 8px; }
QTabBar::tab { padding: 9px 14px; }
QTabBar::tab:selected { color: #0864dc; border-bottom: 2px solid #167dff; }
QScrollArea { border: none; }
QLabel#muted { color: #718198; }
QLabel#title { color: #142338; font-size: 25px; font-weight: 700; }
QLabel#section { color: #142338; font-size: 16px; font-weight: 650; }
QLabel#metric { color: #102b45; font-size: 26px; font-weight: 700; }
QLabel#status { color: #566a81; background: #eef3f8; border-radius: 10px; padding: 4px 9px; }
"""


class TaskSignals(QObject):
    result = Signal(object)
    error = Signal(str)


class ApiTask(QRunnable):
    def __init__(self, fn: Callable[[], Any]) -> None:
        super().__init__()
        self.setAutoDelete(False)
        self.fn = fn
        self.signals = TaskSignals()

    def run(self) -> None:
        try:
            self.signals.result.emit(self.fn())
        except Exception as exc:  # Network and API errors go back to the UI thread.
            self.signals.error.emit(str(exc))


class TaskOwner(QObject):
    """Keep runnable wrappers and their callbacks alive until workers have returned."""

    def __init__(self, app: QApplication) -> None:
        super().__init__(app)
        self.tasks: dict[QThreadPool, list[ApiTask]] = {}
        self.timer = QTimer(self)
        self.timer.setInterval(50)
        self.timer.timeout.connect(self.collect_finished)
        app.aboutToQuit.connect(self.shutdown)

    def start(self, pool: QThreadPool, task: ApiTask) -> None:
        self.tasks.setdefault(pool, []).append(task)
        self.timer.start()
        pool.start(task)

    def collect_finished(self) -> None:
        # A result can be delivered before run() returns. Only release wrappers
        # after Qt confirms that no runnable is still executing in this pool.
        for pool in list(self.tasks):
            if pool.waitForDone(0):
                del self.tasks[pool]
        if not self.tasks:
            self.timer.stop()

    def shutdown(self) -> None:
        self.timer.stop()
        for pool in self.tasks:
            pool.waitForDone()
        self.tasks.clear()


def call_async(pool: QThreadPool, fn: Callable[[], Any], done: Callable[[Any], None], fail: Callable[[str], None]) -> None:
    app = QApplication.instance()
    if app is None:
        raise RuntimeError("Background tasks require a QApplication")
    owner = getattr(app, "_ischolar_task_owner", None)
    if owner is None:
        owner = TaskOwner(app)
        app._ischolar_task_owner = owner
    task = ApiTask(fn)
    task.signals.result.connect(done, Qt.ConnectionType.QueuedConnection)
    task.signals.error.connect(fail, Qt.ConnectionType.QueuedConnection)
    owner.start(pool, task)


def card(parent: QWidget | None = None) -> QFrame:
    frame = QFrame(parent)
    frame.setObjectName("card")
    return frame


def title_block(title: str, subtitle: str = "") -> QVBoxLayout:
    layout = QVBoxLayout()
    heading = QLabel(title)
    heading.setObjectName("title")
    layout.addWidget(heading)
    if subtitle:
        detail = QLabel(subtitle)
        detail.setObjectName("muted")
        detail.setWordWrap(True)
        layout.addWidget(detail)
    return layout


class LoginDialog(QDialog):
    def __init__(self, api: ApiClient, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self.api = api
        self.setWindowTitle("登录 iScholar")
        self.setMinimumWidth(520)
        outer = QVBoxLayout(self)
        outer.setSpacing(12)
        brand = QLabel("iScholar")
        brand.setStyleSheet("font-size:28px;font-weight:700;color:#102b45")
        outer.addWidget(brand)
        note = QLabel("登录你的研究工作区。桌面客户端直连本地 FastAPI 后端，无需启动 Web 前端。")
        note.setWordWrap(True)
        note.setObjectName("muted")
        outer.addWidget(note)
        form = QFormLayout()
        form.setHorizontalSpacing(16)
        form.setVerticalSpacing(10)
        self.base = QLineEdit(api.base_url)
        self.base.setMinimumHeight(32)
        self.email = QLineEdit()
        self.email.setPlaceholderText("you@example.com")
        self.email.setMinimumHeight(32)
        self.password = QLineEdit()
        self.password.setEchoMode(QLineEdit.EchoMode.Password)
        self.password.setMinimumHeight(32)
        self.password.returnPressed.connect(self.submit)
        form.addRow("本地服务地址", self.base)
        form.addRow("邮箱", self.email)
        form.addRow("密码", self.password)
        outer.addLayout(form)
        self.status = QLabel("")
        self.status.setWordWrap(True)
        self.status.setTextInteractionFlags(Qt.TextInteractionFlag.TextSelectableByMouse)
        self.status.setStyleSheet("color:#bd3434")
        outer.addWidget(self.status)
        buttons = QDialogButtonBox(QDialogButtonBox.StandardButton.Cancel | QDialogButtonBox.StandardButton.Ok)
        buttons.button(QDialogButtonBox.StandardButton.Ok).setText("登录")
        buttons.button(QDialogButtonBox.StandardButton.Cancel).setText("退出")
        buttons.accepted.connect(self.submit)
        buttons.rejected.connect(self.reject)
        outer.addWidget(buttons)

    def submit(self) -> None:
        self.api.set_base_url(self.base.text())
        self.status.setStyleSheet("color:#566a81")
        self.status.setText("正在连接并验证…")
        QApplication.setOverrideCursor(Qt.CursorShape.WaitCursor)
        try:
            self.api.login(self.email.text(), self.password.text())
        except Exception as exc:
            self.status.setStyleSheet("color:#bd3434")
            self.status.setText(str(exc))
        else:
            self.accept()
        finally:
            QApplication.restoreOverrideCursor()


class MainWindow(QMainWindow):
    def __init__(self, api: ApiClient) -> None:
        super().__init__()
        self.api = api
        self.pool = QThreadPool.globalInstance()
        self.current_project: dict[str, Any] | None = None
        self.preferences = QSettings("iScholar", "iScholarDesktop")
        self.language = str(self.preferences.value("uiLanguage", "zh-CN"))
        self.agent_language = str(self.preferences.value("agentLanguage", "auto"))
        self.pages: dict[str, QWidget] = {}
        self.setWindowTitle("iScholar · 科研工作台")
        self.resize(1480, 940)
        self.setMinimumSize(1120, 720)
        root = QWidget()
        root_layout = QHBoxLayout(root)
        root_layout.setContentsMargins(0, 0, 0, 0)
        root_layout.setSpacing(0)
        self.setCentralWidget(root)

        self.sidebar = QFrame()
        self.sidebar.setObjectName("sidebar")
        self.sidebar.setFixedWidth(248)
        side_layout = QVBoxLayout(self.sidebar)
        side_layout.setContentsMargins(14, 16, 14, 16)
        logo = QLabel("🚀  iScholar")
        logo.setStyleSheet("font-size:18px;font-weight:700;padding:3px 8px 14px")
        side_layout.addWidget(logo)
        self.project_picker = QComboBox()
        self.project_picker.setStyleSheet("background:#19324f;color:white;border:1px solid #2c4a6c")
        self.project_picker.currentIndexChanged.connect(self._select_project)
        side_layout.addWidget(self.project_picker)
        self.nav_layout = QVBoxLayout()
        self.nav_layout.setSpacing(3)
        side_layout.addLayout(self.nav_layout)
        side_layout.addStretch(1)
        side_layout.addWidget(QLabel("科研助手"))
        self.agent_layout = QVBoxLayout()
        side_layout.addLayout(self.agent_layout)
        side_layout.addStretch(2)
        self.connection_label = QLabel("已连接")
        self.connection_label.setObjectName("muted")
        side_layout.addWidget(self.connection_label)
        root_layout.addWidget(self.sidebar)

        right = QWidget()
        right_layout = QVBoxLayout(right)
        right_layout.setContentsMargins(0, 0, 0, 0)
        right_layout.setSpacing(0)
        self.header = QFrame()
        self.header.setStyleSheet("background:white;border-bottom:1px solid #e2e8f0")
        header_layout = QHBoxLayout(self.header)
        header_layout.setContentsMargins(22, 9, 22, 9)
        self.breadcrumb = QLabel("总览")
        self.breadcrumb.setObjectName("section")
        header_layout.addWidget(self.breadcrumb)
        header_layout.addStretch(1)
        self.locale = QComboBox()
        self.locale.addItem("简体中文", "zh-CN")
        self.locale.addItem("English", "en-US")
        self.locale.setCurrentIndex(0 if self.language == "zh-CN" else 1)
        self.locale.currentIndexChanged.connect(self._locale_changed)
        header_layout.addWidget(self.locale)
        self.user_button = QPushButton("账户  ·  退出")
        self.user_button.setObjectName("secondary")
        self.user_button.clicked.connect(self.logout)
        header_layout.addWidget(self.user_button)
        right_layout.addWidget(self.header)
        self.stack = QStackedWidget()
        right_layout.addWidget(self.stack, 1)
        root_layout.addWidget(right, 1)
        self._build_nav()
        self.navigate("dashboard")
        self.load_projects()

    def _build_nav(self) -> None:
        self.nav_buttons: dict[str, QPushButton] = {}
        self.agent_buttons: dict[str, QPushButton] = {}
        for key, zh, en in NAV_ITEMS:
            button = QPushButton(f"◇   {zh}")
            button.setObjectName("nav")
            button.clicked.connect(lambda checked=False, item=key: self.navigate(item))
            self.nav_layout.addWidget(button)
            self.nav_buttons[key] = button
        for key, zh, en in AGENTS:
            button = QPushButton(f"   {zh}")
            button.setObjectName("nav")
            button.clicked.connect(lambda checked=False, item=key: self.open_agent(item))
            self.agent_layout.addWidget(button)
            self.agent_buttons[key] = button

    def _locale_changed(self, index: int) -> None:
        self.language = str(self.locale.itemData(index))
        self.preferences.setValue("uiLanguage", self.language)
        self._build_nav_text()
        route = getattr(self, "route", "dashboard")
        self.navigate(route, force=True)

    def _build_nav_text(self) -> None:
        english = self.language == "en-US"
        for key, zh, en in NAV_ITEMS:
            self.nav_buttons[key].setText(f"◇   {en if english else zh}")
        for key, zh, en in AGENTS:
            self.agent_buttons[key].setText(f"   {en if english else zh}")

    def _select_project(self, index: int) -> None:
        project_id = self.project_picker.itemData(index)
        if project_id:
            self.current_project = {"id": project_id, "name": self.project_picker.currentText()}

    def load_projects(self) -> None:
        call_async(self.pool, lambda: self.api.request("/api/data/projects"), self._projects_loaded, self._show_error)

    def _projects_loaded(self, projects: Any) -> None:
        self.projects = projects if isinstance(projects, list) else []
        active = [project for project in self.projects if project.get("status") != "archived"]
        old = self.current_project.get("id") if self.current_project else None
        self.project_picker.blockSignals(True)
        self.project_picker.clear()
        for project in active:
            self.project_picker.addItem(project.get("name", "未命名项目"), project.get("id"))
        index = next((i for i, project in enumerate(active) if project.get("id") == old), 0)
        if active:
            self.project_picker.setCurrentIndex(index)
            self.current_project = active[index]
        else:
            self.current_project = None
        self.project_picker.blockSignals(False)
        page = self.pages.get("projects")
        if isinstance(page, ProjectsPage):
            page.set_projects(active)
        page = self.pages.get("dashboard")
        if isinstance(page, DashboardPage):
            page.set_projects(active)

    def navigate(self, route: str, force: bool = False) -> None:
        self.route = route
        if route.startswith("agent:"):
            agent_id = route.split(":", 1)[1]
            if not self.current_project:
                self._show_error("请先创建或选择一个研究项目。")
                route = "projects"
            else:
                page_key = route
                page = AgentPage(self, self.current_project, agent_id)
                self._replace_page(page_key, page)
                self._activate(page_key, AGENT_NAMES[agent_id])
                page.load_latest_runs()
                return
        if route.startswith("tool:"):
            tool_key = route.split(":", 1)[1]
            page = ToolPage(self, tool_key)
            self._replace_page(route, page)
            self._activate(route, TOOL_NAMES.get(tool_key, tool_key))
            return
        if route.startswith("training:"):
            training_route = route.split(":", 1)[1]
            if training_route.startswith("task:"):
                task_id = training_route.split(":", 1)[1]
                task = next((item for item in TRAINING_TASKS if item[0] == task_id), None)
                if task:
                    page = TrainingTaskPage(self, task)
                    self._replace_page(route, page)
                    self._activate(route, task[1])
                    return
            page = TrainingPage(self, training_route)
            self._replace_page(route, page)
            self._activate(route, training_route.replace("-", " ").title())
            page.load()
            return
        if not force and route in self.pages:
            self.stack.setCurrentWidget(self.pages[route])
            self._activate(route, PAGE_NAMES.get(route, route.title()))
            return
        if route == "dashboard":
            page = DashboardPage(self)
        elif route == "projects":
            page = ProjectsPage(self)
        elif route == "training":
            page = TrainingPage(self, "hub")
        elif route == "tools":
            page = ToolsPage(self)
        elif route == "settings":
            page = SettingsPage(self)
        else:
            page = ProjectHomePage(self, self.current_project)
            route = "project-home"
        self._replace_page(route, page)
        self._activate(route, PAGE_NAMES.get(route, "项目工作区"))
        if route == "dashboard":
            page.load()
        elif route == "projects":
            page.set_projects(getattr(self, "projects", []))
        elif route == "training":
            page.load()

    def _replace_page(self, route: str, page: QWidget) -> None:
        previous = self.pages.pop(route, None)
        if previous:
            self.stack.removeWidget(previous)
            previous.deleteLater()
        self.pages[route] = page
        self.stack.addWidget(page)
        self.stack.setCurrentWidget(page)

    def _activate(self, route: str, label: str) -> None:
        self.breadcrumb.setText(label)
        for key, button in self.nav_buttons.items():
            button.setProperty("active", route == key)
            button.style().unpolish(button)
            button.style().polish(button)
        for key, button in self.agent_buttons.items():
            button.setProperty("active", route == f"agent:{key}")
            button.style().unpolish(button)
            button.style().polish(button)

    def open_agent(self, agent_id: str) -> None:
        self.navigate(f"agent:{agent_id}", force=True)

    def open_project(self, project: dict[str, Any]) -> None:
        self.current_project = project
        index = self.project_picker.findData(project.get("id"))
        if index >= 0:
            self.project_picker.setCurrentIndex(index)
        self.open_agent("topic")

    def create_project(self) -> None:
        dialog = ProjectDialog(self)
        if dialog.exec() != QDialog.DialogCode.Accepted:
            return
        call_async(
            self.pool,
            lambda: self.api.request("/api/data/projects", method="POST", payload=dialog.payload()),
            lambda project: (self.load_projects(), self.open_project(project)),
            self._show_error,
        )

    def _show_error(self, message: str) -> None:
        self.connection_label.setText("连接异常")
        QMessageBox.warning(self, "iScholar", message)

    def logout(self) -> None:
        answer = QMessageBox.question(self, "退出登录", "要退出当前账号吗？")
        if answer != QMessageBox.StandardButton.Yes:
            return
        try:
            self.api.logout()
        except Exception:
            pass
        self.close()


PAGE_NAMES = {
    "dashboard": "科研总览", "projects": "研究项目", "training": "科研训练营", "tools": "研究工具",
    "settings": "设置", "project-home": "项目工作区",
}
AGENT_NAMES = {key: zh for key, zh, _ in AGENTS}
TOOL_NAMES = {"literature-analysis": "文献分析", "paper-polishing": "论文润色", "journal-selection": "期刊选择"}


class ScrollPage(QWidget):
    def __init__(self, main: MainWindow) -> None:
        super().__init__()
        self.main = main
        self.body = QWidget()
        self.layout = QVBoxLayout(self.body)
        self.layout.setContentsMargins(28, 24, 28, 32)
        self.layout.setSpacing(18)
        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setWidget(self.body)
        outer = QVBoxLayout(self)
        outer.setContentsMargins(0, 0, 0, 0)
        outer.addWidget(scroll)

    def heading(self, title: str, subtitle: str = "") -> None:
        block = title_block(title, subtitle)
        self.layout.addLayout(block)


class MetricCard(QFrame):
    def __init__(self, label: str, value: str = "—", caption: str = "") -> None:
        super().__init__()
        self.setObjectName("card")
        layout = QVBoxLayout(self)
        small = QLabel(label)
        small.setObjectName("muted")
        layout.addWidget(small)
        self.value = QLabel(value)
        self.value.setObjectName("metric")
        layout.addWidget(self.value)
        self.caption = QLabel(caption)
        self.caption.setObjectName("muted")
        layout.addWidget(self.caption)


class DashboardPage(ScrollPage):
    def __init__(self, main: MainWindow) -> None:
        super().__init__(main)
        row = QHBoxLayout()
        row.addLayout(title_block("科研总览", "查看项目、智能体运行和最近研究活动。"), 1)
        create = QPushButton("＋  新建项目")
        create.setObjectName("primary")
        create.clicked.connect(main.create_project)
        row.addWidget(create, 0, Qt.AlignmentFlag.AlignRight | Qt.AlignmentFlag.AlignVCenter)
        self.layout.addLayout(row)
        self.metrics_layout = QHBoxLayout()
        self.metrics = [MetricCard("进行中的项目"), MetricCard("智能体运行"), MetricCard("最近活动", caption="等待载入")]
        for item in self.metrics:
            self.metrics_layout.addWidget(item)
        self.layout.addLayout(self.metrics_layout)
        self.layout.addWidget(section_label("最近项目"))
        self.projects_grid = QGridLayout()
        self.layout.addLayout(self.projects_grid)
        self.layout.addWidget(section_label("最近运行"))
        self.runs = QTextBrowser()
        self.runs.setMinimumHeight(220)
        self.layout.addWidget(self.runs)
        self.projects: list[dict[str, Any]] = []

    def set_projects(self, projects: list[dict[str, Any]]) -> None:
        self.projects = projects
        self.metrics[0].value.setText(str(len(projects)))
        while self.projects_grid.count():
            item = self.projects_grid.takeAt(0)
            if item.widget():
                item.widget().deleteLater()
        if not projects:
            empty = QLabel("还没有研究项目。创建一个项目，开始整理研究目标和资料。")
            empty.setObjectName("muted")
            self.projects_grid.addWidget(empty, 0, 0)
        for index, project in enumerate(projects[:6]):
            button = project_tile(project, lambda checked=False, p=project: self.main.open_project(p))
            self.projects_grid.addWidget(button, index // 3, index % 3)

    def load(self) -> None:
        def got(runs: Any) -> None:
            rows = runs if isinstance(runs, list) else []
            self.metrics[1].value.setText(str(len(rows)))
            self.metrics[2].value.setText("有活动" if rows else "暂无活动")
            self.metrics[2].caption.setText(rows[0].get("createdAt", "") if rows else "开始一次智能体运行")
            self.runs.setMarkdown("\n\n".join(
                f"### {run.get('agent', 'agent')} · {run.get('status', '')}\n{run.get('goal', '')}\n\n{run.get('createdAt', '')}"
                for run in rows[:8]
            ) or "暂无智能体运行记录。")

        call_async(self.main.pool, lambda: self.main.api.request("/api/agent/runs?limit=30"), got, self.main._show_error)


class ProjectsPage(ScrollPage):
    def __init__(self, main: MainWindow) -> None:
        super().__init__(main)
        row = QHBoxLayout()
        row.addLayout(title_block("研究项目", "每个项目连接研究助手、稿件、文献与运行记录。"), 1)
        add = QPushButton("＋  新建项目")
        add.setObjectName("primary")
        add.clicked.connect(main.create_project)
        row.addWidget(add, 0, Qt.AlignmentFlag.AlignRight | Qt.AlignmentFlag.AlignVCenter)
        self.layout.addLayout(row)
        self.grid = QGridLayout()
        self.layout.addLayout(self.grid)

    def set_projects(self, projects: list[dict[str, Any]]) -> None:
        while self.grid.count():
            item = self.grid.takeAt(0)
            if item.widget():
                item.widget().deleteLater()
        for index, project in enumerate(projects):
            self.grid.addWidget(project_tile(project, lambda checked=False, p=project: self.main.open_project(p)), index // 3, index % 3)
        if not projects:
            empty = QLabel("暂无项目。使用右上方按钮创建第一个研究项目。")
            empty.setObjectName("muted")
            self.grid.addWidget(empty, 0, 0)


class ProjectDialog(QDialog):
    def __init__(self, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self.setWindowTitle("新建研究项目")
        self.setMinimumWidth(520)
        form = QFormLayout(self)
        self.category = QComboBox()
        self.category.addItem("选择学科类别", "")
        self.category.addItem("社会科学", "社科")
        self.category.addItem("自然科学", "自科")
        self.method = QComboBox()
        self.method.addItem("选择研究方法", "")
        self.method.addItem("定性研究", "定性")
        self.method.addItem("定量研究", "定量")
        self.method.addItem("混合方法", "混合")
        self.name = QLineEdit()
        self.name.setPlaceholderText("例如：生成式 AI 与学术写作")
        self.discipline = QLineEdit()
        self.goal = QTextEdit()
        self.goal.setMaximumHeight(120)
        self.description = QTextEdit()
        self.description.setMaximumHeight(90)
        form.addRow("学科类别", self.category)
        form.addRow("研究方法", self.method)
        form.addRow("项目名称 *", self.name)
        form.addRow("学科领域", self.discipline)
        form.addRow("研究目标", self.goal)
        form.addRow("项目说明", self.description)
        buttons = QDialogButtonBox(QDialogButtonBox.StandardButton.Cancel | QDialogButtonBox.StandardButton.Save)
        buttons.button(QDialogButtonBox.StandardButton.Cancel).setText("取消")
        buttons.button(QDialogButtonBox.StandardButton.Save).setText("创建项目")
        buttons.accepted.connect(self._accept)
        buttons.rejected.connect(self.reject)
        form.addRow(buttons)

    def _accept(self) -> None:
        if not self.name.text().strip():
            QMessageBox.information(self, "需要项目名称", "请填写项目名称。")
            return
        self.accept()

    def payload(self) -> dict[str, Any]:
        category = self.category.currentData() or None
        method = self.method.currentData() or None
        discipline = " · ".join(value for value in (category, method, self.discipline.text().strip()) if value)
        return {
            "name": self.name.text().strip(),
            "discipline": discipline,
            "goal": self.goal.toPlainText().strip(),
            "description": self.description.toPlainText().strip(),
            "metadata": {"wizard": {"disciplineCategory": category, "researchMethod": method, "researchDirection": self.goal.toPlainText().strip()}},
        }


class ProjectHomePage(ScrollPage):
    def __init__(self, main: MainWindow, project: dict[str, Any] | None) -> None:
        super().__init__(main)
        project = project or {}
        self.heading(project.get("name", "项目工作区"), project.get("goal", "从研究助手进入项目的各个工作阶段。"))
        self.layout.addWidget(section_label("项目模块"))
        grid = QGridLayout()
        for index, (agent_id, zh, en) in enumerate(AGENTS):
            tile = project_tile({"name": zh, "discipline": en, "goal": "打开模块并继续研究"}, lambda checked=False, aid=agent_id: main.open_agent(aid))
            grid.addWidget(tile, index // 4, index % 4)
        self.layout.addLayout(grid)
        tabs = QTabWidget()
        self.data_views: dict[str, QTextBrowser] = {}
        for key, label in (("attachments", "项目资料"), ("manuscripts", "稿件"), ("bib-items", "参考文献"), ("experiments", "实验记录"), ("submissions", "投稿记录"), ("tasks", "任务")):
            view = QTextBrowser()
            view.setMarkdown("正在载入项目数据…")
            self.data_views[key] = view
            tabs.addTab(view, label)
        tabs.setMinimumHeight(280)
        self.layout.addWidget(tabs)
        if project.get("id"):
            self.load_project_data(project["id"])

    def load_project_data(self, project_id: str) -> None:
        endpoints = {
            "attachments": ("/api/data/attachments", {"projectId": project_id}),
            "manuscripts": ("/api/data/manuscripts", {"projectId": project_id}),
            "bib-items": ("/api/data/bib-items", {"projectId": project_id}),
            "experiments": ("/api/data/experiments", {"projectId": project_id}),
            "submissions": ("/api/data/submissions", {"projectId": project_id}),
            "tasks": ("/api/data/tasks", {"projectId": project_id}),
        }
        for key, (path, params) in endpoints.items():
            query = "&".join(f"{name}={urllib_quote(value)}" for name, value in params.items())
            call_async(self.main.pool, lambda p=f"{path}?{query}": self.main.api.request(p), lambda data, k=key: self._show_items(k, data), lambda error, k=key: self.data_views[k].setMarkdown(f"加载失败：{error}"))

    def _show_items(self, key: str, data: Any) -> None:
        rows = data if isinstance(data, list) else data.get("items", []) if isinstance(data, dict) else []
        self.data_views[key].setMarkdown("\n\n".join(
            f"### {item.get('title') or item.get('name') or item.get('filename') or item.get('section') or key}\n"
            f"{item.get('abstract') or item.get('description') or item.get('content') or item.get('status') or ''}\n\n"
            f"`{item.get('updatedAt') or item.get('createdAt') or ''}`"
            for item in rows[:40]
        ) or "该项目暂无记录。")


class AgentPage(ScrollPage):
    def __init__(self, main: MainWindow, project: dict[str, Any], agent_id: str) -> None:
        super().__init__(main)
        self.project = project
        self.agent_id = agent_id
        self.run_id: str | None = None
        self.run_detail: dict[str, Any] | None = None
        self.fields: dict[str, QWidget] = {}
        self.heading(f"{project.get('name', '研究项目')}  /  {AGENT_NAMES[agent_id]}", f"{AGENT_NAMES[agent_id]} · 在一个工作区里提交研究输入、查看模型过程、审阅产物并保存到项目。")
        split = QSplitter(Qt.Orientation.Horizontal)
        left = card()
        left_layout = QVBoxLayout(left)
        left_layout.addWidget(section_label("研究输入"))
        form = QFormLayout()
        for key, label, placeholder in AGENT_FIELDS[agent_id]:
            if key == "openAccess":
                widget = QComboBox()
                widget.addItem("是", "yes")
                widget.addItem("否", "no")
            elif key == "section":
                widget = QComboBox()
                for section, label_text in (("abstract", "摘要"), ("introduction", "引言"), ("methods", "方法"), ("results", "结果"), ("discussion", "讨论"), ("conclusion", "结论")):
                    widget.addItem(label_text, section)
            elif key in {"yearFrom", "yearTo", "maxResults"}:
                widget = QSpinBox()
                if key == "maxResults":
                    widget.setRange(1, 200)
                    widget.setValue(50)
                else:
                    widget.setRange(1900, 2100)
                    widget.setSpecialValueText("不限制")
                    widget.setValue(1900)
            elif key in {"abstract", "reviewerComments", "researchGoal"}:
                widget: QWidget = QTextEdit()
                widget.setPlaceholderText(placeholder)
                widget.setMinimumHeight(88 if key != "abstract" else 120)
            else:
                widget = QLineEdit()
                widget.setPlaceholderText(placeholder)
            self.fields[key] = widget
            form.addRow(label, widget)
        left_layout.addLayout(form)
        if agent_id == "research-plan":
            self.keywords = self.fields["keywords"]
            self.language_selector = QComboBox()
            self.language_selector.addItem("跟随输入", "auto")
            self.language_selector.addItem("中文", "zh")
            self.language_selector.addItem("English", "en")
            form.addRow("输出语言", self.language_selector)
        if agent_id == "topic":
            self.analysis_mode = QComboBox()
            self.analysis_mode.addItem("研究方向发现", "discovery")
            self.analysis_mode.addItem("文献启发选题", "literature")
            self.analysis_mode.addItem("研究趋势分析", "trends")
            form.addRow("分析模式", self.analysis_mode)
        if agent_id == "write":
            self.write_mode = QComboBox()
            self.write_mode.addItem("撰写", "write")
            self.write_mode.addItem("润色", "polish")
            self.write_mode.addItem("格式整理", "format")
            form.addRow("写作模式", self.write_mode)
            instructions = QTextEdit()
            instructions.setPlaceholderText("补充章节提纲或写作要求（可选）")
            instructions.setMaximumHeight(96)
            self.fields["instructions"] = instructions
            form.addRow("写作要求", instructions)
        if agent_id == "rebuttal":
            upload = QPushButton("上传审稿 PDF 并提取意见…")
            upload.setObjectName("secondary")
            upload.clicked.connect(self.import_review_pdf)
            form.addRow("PDF 导入", upload)
        self.consent = QCheckBox("我确认已阅读输入内容，并同意将其发送给已配置的 AI 服务进行处理。")
        self.consent.setText("我确认已检查输入并删除不应提交的敏感信息，同意将内容发送给已配置的 AI 与检索服务处理。")
        left_layout.addWidget(self.consent)
        actions = QHBoxLayout()
        self.run_button = QPushButton("启动协作方案" if agent_id == "research-plan" else "开始生成")
        self.run_button.setObjectName("primary")
        self.run_button.clicked.connect(self.start_run)
        actions.addWidget(self.run_button)
        self.clear_button = QPushButton("清空输入")
        self.clear_button.setObjectName("secondary")
        self.clear_button.clicked.connect(self.clear_fields)
        actions.addWidget(self.clear_button)
        left_layout.addLayout(actions)
        left_layout.addStretch(1)
        right = card()
        right_layout = QVBoxLayout(right)
        self.status = QLabel("尚未运行")
        self.status.setObjectName("status")
        right_layout.addWidget(self.status)
        self.tabs = QTabWidget()
        self.stream = QTextBrowser()
        self.output = QTextBrowser()
        self.details = QTextBrowser()
        self.tabs.addTab(self.stream, "过程与状态")
        if agent_id == "write":
            self.editor = QTextEdit()
            self.editor.setMarkdown("# 论文草稿\n\n生成内容将在这里显示。你可以直接修改后再保存到项目稿件。")
            self.tabs.addTab(self.editor, "稿件编辑器")
        self.tabs.addTab(self.output, "产物与结构化结果")
        self.tabs.addTab(self.details, "运行详情")
        right_layout.addWidget(self.tabs, 1)
        self.gate = QFrame()
        gate_layout = QVBoxLayout(self.gate)
        self.gate_title = QLabel("人工确认")
        self.gate_title.setObjectName("section")
        gate_layout.addWidget(self.gate_title)
        self.candidate = QComboBox()
        gate_layout.addWidget(self.candidate)
        gate_buttons = QHBoxLayout()
        self.approve = QPushButton("确认并继续")
        self.approve.setObjectName("primary")
        self.approve.clicked.connect(self.approve_gate)
        self.reject = QPushButton("拒绝 / 终止")
        self.reject.setObjectName("danger")
        self.reject.clicked.connect(self.reject_gate)
        gate_buttons.addWidget(self.approve)
        gate_buttons.addWidget(self.reject)
        gate_layout.addLayout(gate_buttons)
        self.gate.hide()
        right_layout.addWidget(self.gate)
        action_row = QHBoxLayout()
        self.apply_button = QPushButton("应用到项目稿件")
        self.apply_button.setObjectName("secondary")
        self.apply_button.clicked.connect(self.apply_output)
        self.apply_button.setEnabled(False)
        action_row.addWidget(self.apply_button)
        self.cancel_button = QPushButton("取消运行")
        self.cancel_button.setObjectName("danger")
        self.cancel_button.clicked.connect(self.cancel_run)
        self.cancel_button.setEnabled(False)
        action_row.addWidget(self.cancel_button)
        action_row.addStretch(1)
        right_layout.addLayout(action_row)
        split.addWidget(left)
        split.addWidget(right)
        split.setSizes([480, 720])
        self.layout.addWidget(split, 1)
        self.poller = QTimer(self)
        self.poller.setInterval(1500)
        self.poller.timeout.connect(self.refresh_run)

    def _field_value(self, widget: QWidget) -> str:
        if isinstance(widget, QTextEdit):
            return widget.toPlainText().strip()
        if isinstance(widget, QLineEdit):
            return widget.text().strip()
        if isinstance(widget, QComboBox):
            return str(widget.currentData())
        if isinstance(widget, QSpinBox):
            return str(widget.value())
        return ""

    def _input_payload(self) -> dict[str, Any]:
        values = {key: self._field_value(widget) for key, widget in self.fields.items()}
        values["language"] = self.main.agent_language
        if self.agent_id == "litreview":
            for key in ("yearFrom", "yearTo"):
                if values.get(key) == "1900":
                    values[key] = ""
            values["maxResults"] = int(values.get("maxResults") or 50)
        if self.agent_id == "research-plan":
            values["query"] = values.get("researchGoal", "")
            values["keywords"] = [item.strip() for item in values.get("keywords", "").split(",") if item.strip()]
            values["language"] = self.language_selector.currentData()
        elif self.agent_id == "topic":
            values["analysisMode"] = self.analysis_mode.currentData()
            values["keywords"] = [item.strip() for item in values.get("keywords", "").split(",") if item.strip()]
        elif self.agent_id == "write":
            values["mode"] = self.write_mode.currentData()
        return {key: value for key, value in values.items() if value not in ("", None)}

    def import_review_pdf(self) -> None:
        from PySide6.QtWidgets import QFileDialog

        path, _ = QFileDialog.getOpenFileName(self, "选择审稿 PDF", "", "PDF 文件 (*.pdf)")
        if not path:
            return
        try:
            from pypdf import PdfReader

            text = "\n\n".join(page.extract_text() or "" for page in PdfReader(path).pages)
        except Exception as exc:
            QMessageBox.warning(self, "无法读取 PDF", str(exc))
            return
        editor = self.fields.get("reviewerComments")
        if isinstance(editor, QTextEdit):
            editor.setPlainText(text)
        if not text.strip():
            QMessageBox.information(self, "未提取到文字", "PDF 可能是扫描件，请先进行 OCR 后再导入。")

    def start_run(self) -> None:
        if not self.consent.isChecked():
            QMessageBox.information(self, "需要确认", "请先确认 AI 数据处理授权。")
            return
        payload = self._input_payload()
        goal = str(
            payload.get("researchGoal")
            or payload.get("query")
            or payload.get("researchQuestion")
            or payload.get("reviewComments")
            or payload.get("abstract")
            or payload.get("dataSource")
            or "；".join(f"{key}: {value}" for key, value in payload.items())
        )
        if len(goal.strip()) < 3:
            QMessageBox.information(self, "需要研究目标", "请填写至少 3 个字符的研究目标或问题。")
            return
        self.run_button.setEnabled(False)
        self.stream.setMarkdown("正在创建运行并连接后台工作流…")

        def create() -> dict[str, Any]:
            consent = self.main.api.request(
                "/api/audit/consents",
                method="POST",
                payload={
                    "projectId": self.project["id"],
                    "purpose": "agent_run",
                    "dataCategories": list(payload.keys()),
                    "externalServices": ["configured AI and research services"],
                    "redactionConfirmed": True,
                },
            )
            thread = self.main.api.request("/api/agent/threads", method="POST", payload={"projectId": self.project["id"], "title": f"{self.agent_id} desktop"})
            run_input = payload
            if self.agent_id == "research-plan":
                run_input["researchGoal"] = goal
            return self.main.api.request("/api/agent/runs", method="POST", payload={"threadId": thread["id"], "projectId": self.project["id"], "agent": self.agent_id, "goal": goal, "input": run_input, "consentId": consent["id"]})

        call_async(self.main.pool, create, self._run_created, self._run_error)

    def _run_created(self, run: dict[str, Any]) -> None:
        self.run_id = run["id"]
        self.run_detail = run
        self.poller.start()
        self.cancel_button.setEnabled(True)
        self.stream.setMarkdown(f"运行已创建：`{self.run_id}`\n\n当前状态：`{run.get('status', 'queued')}`")
        self.refresh_run()

    def _run_error(self, message: str) -> None:
        self.run_button.setEnabled(True)
        self.stream.setMarkdown(f"**运行失败**\n\n{message}")
        self.main.connection_label.setText("运行异常")

    def load_latest_runs(self) -> None:
        path = f"/api/agent/runs?projectId={self.project['id']}&limit=25"
        call_async(self.main.pool, lambda: self.main.api.request(path), self._latest_loaded, self.main._show_error)

    def _latest_loaded(self, rows: Any) -> None:
        if not isinstance(rows, list) or not rows:
            return
        self.stream.setMarkdown("### 最近运行\n\n" + "\n\n".join(
            f"- `{run.get('status')}` · {run.get('goal', '')} · {run.get('createdAt', '')}"
            for run in rows[:10]
        ))
        latest = rows[0]
        if latest.get("status") in {"queued", "running", "waiting_for_review", "waiting_for_input"}:
            self.run_id = latest["id"]
            self.refresh_run()
            self.poller.start()

    def refresh_run(self) -> None:
        if not self.run_id:
            return
        call_async(self.main.pool, lambda: self.main.api.request(f"/api/agent/runs/{self.run_id}"), self._run_updated, self._poll_error)

    def _poll_error(self, message: str) -> None:
        self.status.setText(f"连接中断 · {message[:140]}")

    def _run_updated(self, run: dict[str, Any]) -> None:
        self.run_detail = run
        status = str(run.get("status", "unknown"))
        self.status.setText(f"运行状态：{status}")
        artifacts = run.get("artifacts") or []
        result = run.get("result") or {}
        output_blocks = []
        for artifact in artifacts:
            content = artifact.get("content") or {}
            output_blocks.append(f"## {artifact.get('kind')} · {artifact.get('status')}\n\n{content.get('text', '')}\n\n```json\n{json.dumps(content.get('structured'), ensure_ascii=False, indent=2)}\n```")
        if result.get("final", {}).get("text"):
            output_blocks.append("## 最终研究方案\n\n" + result["final"]["text"])
        self.output.setMarkdown("\n\n---\n\n".join(output_blocks) or "运行尚未生成可查看的产物。")
        if self.agent_id == "write" and hasattr(self, "editor") and artifacts:
            text = next((a.get("content", {}).get("text", "") for a in reversed(artifacts) if a.get("content", {}).get("text")), "")
            if text:
                self.editor.setMarkdown(text)
        steps = result.get("steps") or []
        details = [f"**目标：** {run.get('goal', '')}", f"**运行 ID：** `{run.get('id')}`", f"**项目 ID：** `{run.get('projectId')}`"]
        details.extend(f"- {step.get('step')} · {step.get('kind')} · `{step.get('artifactId')}`" for step in steps)
        details.extend([f"**创建：** {run.get('createdAt')}", f"**开始：** {run.get('startedAt')}", f"**完成：** {run.get('completedAt')}"])
        if run.get("error"):
            details.append(f"**错误：** {run['error']}")
        self.details.setMarkdown("\n\n".join(details))
        self._update_gate(run)
        active = status in {"queued", "running"}
        if not active:
            self.poller.stop()
            self.run_button.setEnabled(True)
            self.cancel_button.setEnabled(False)
        self.apply_button.setEnabled(bool(artifacts) and status == "succeeded")
        if status == "succeeded":
            self.stream.setMarkdown("协作完成，产物已入库。\n\n可以打开“产物与结构化结果”查看每阶段输出。")
        elif status == "failed":
            self.stream.setMarkdown(f"运行失败：{run.get('error') or '未知错误'}")

    def _update_gate(self, run: dict[str, Any]) -> None:
        if run.get("status") != "waiting_for_review":
            self.gate.hide()
            return
        self.gate.show()
        if self.agent_id == "research-plan":
            has_plan = any(item.get("kind") == "research_plan" for item in run.get("artifacts", []))
            if has_plan:
                self.gate_title.setText("最终研究方案审批")
                self.candidate.hide()
                self.approve.setText("批准并保存方案")
            else:
                self.gate_title.setText("请选择一个研究方向")
                self.candidate.show()
                self.approve.setText("选择方向并继续")
                topics = []
                for artifact in run.get("artifacts", []):
                    topics = (artifact.get("content", {}).get("structured") or {}).get("topics") or []
                self.candidate.clear()
                for topic in topics:
                    label = topic.get("title", "研究方向")
                    self.candidate.addItem(label, label)
                if not topics:
                    self.candidate.addItem("继续默认方向", "")
        else:
            self.gate_title.setText("请审阅产物后确认")
            self.candidate.hide()
            self.approve.setText("批准产物")

    def approve_gate(self) -> None:
        if not self.run_id:
            return
        if self.agent_id == "research-plan":
            has_plan = any(item.get("kind") == "research_plan" for item in (self.run_detail or {}).get("artifacts", []))
            payload = {"approved": True, "input": {}}
            if not has_plan and self.candidate.currentData():
                payload["input"] = {"selected": self.candidate.currentData()}
            self._resume(payload)
        else:
            artifacts = (self.run_detail or {}).get("artifacts", [])
            if not artifacts:
                return
            artifact_id = artifacts[-1]["id"]
            call_async(self.main.pool, lambda: self.main.api.request(f"/api/agent/artifacts/{artifact_id}/review", method="POST", payload={"status": "approved"}), lambda _: self.refresh_run(), self._run_error)

    def reject_gate(self) -> None:
        if self.agent_id == "research-plan":
            self._resume({"approved": False, "input": {}})
        else:
            artifacts = (self.run_detail or {}).get("artifacts", [])
            if artifacts:
                artifact_id = artifacts[-1]["id"]
                call_async(self.main.pool, lambda: self.main.api.request(f"/api/agent/artifacts/{artifact_id}/review", method="POST", payload={"status": "rejected", "feedback": "Rejected from desktop client"}), lambda _: self.refresh_run(), self._run_error)

    def _resume(self, payload: dict[str, Any]) -> None:
        call_async(self.main.pool, lambda: self.main.api.request(f"/api/agent/runs/{self.run_id}/resume", method="POST", payload=payload), lambda _: self.refresh_run(), self._run_error)

    def cancel_run(self) -> None:
        if self.run_id:
            call_async(self.main.pool, lambda: self.main.api.request(f"/api/agent/runs/{self.run_id}/cancel", method="POST", payload={}), lambda _: self.refresh_run(), self._run_error)

    def clear_fields(self) -> None:
        for widget in self.fields.values():
            if isinstance(widget, QTextEdit):
                widget.clear()
            elif isinstance(widget, QLineEdit):
                widget.clear()

    def apply_output(self) -> None:
        if not self.run_detail:
            return
        artifacts = self.run_detail.get("artifacts", [])
        text = self.editor.toMarkdown() if self.agent_id == "write" and hasattr(self, "editor") else ""
        if not text:
            text = next((a.get("content", {}).get("text", "") for a in reversed(artifacts) if a.get("content", {}).get("text")), "")
        if not text:
            QMessageBox.information(self, "没有可应用的内容", "当前运行没有可写入稿件的文本产物。")
            return
        def apply() -> Any:
            manuscripts = self.main.api.request(f"/api/data/manuscripts?projectId={self.project['id']}")
            manuscript = manuscripts[0] if manuscripts else self.main.api.request(
                "/api/data/manuscripts",
                method="POST",
                payload={"projectId": self.project["id"], "title": "Untitled Manuscript"},
            )
            structured = next(
                (item.get("content", {}).get("structured") for item in reversed(artifacts) if item.get("content", {}).get("structured")),
                {},
            ) or {}
            if self.agent_id == "litreview" and structured.get("papers"):
                self.main.api.request(
                    "/api/data/bib-items/bulk",
                    method="POST",
                    payload={"items": [
                        {
                            "projectId": self.project["id"],
                            "title": paper.get("title") or "Untitled paper",
                            "authors": paper.get("authors") or [],
                            "year": paper.get("year"),
                            "venue": paper.get("venue"),
                            "abstract": paper.get("findings"),
                            "doi": paper.get("doi"),
                            "metadata": {"method": paper.get("method")},
                        }
                        for paper in structured["papers"]
                    ]},
                )
            if self.agent_id == "data":
                self.main.api.request(
                    "/api/data/experiments",
                    method="POST",
                    payload={
                        "projectId": self.project["id"],
                        "name": f"Data analysis — {self._field_value(self.fields['collectionMethod']) or 'unspecified method'}",
                        "dataset": self._field_value(self.fields["dataSource"]),
                        "params": {"collectionMethod": self._field_value(self.fields["collectionMethod"])},
                        "results": structured,
                    },
                )
            if self.agent_id == "submit":
                for journal in structured.get("journals", []):
                    self.main.api.request(
                        "/api/data/submissions",
                        method="POST",
                        payload={
                            "projectId": self.project["id"],
                            "manuscriptId": manuscript["id"],
                            "journalName": journal.get("name") or "Target journal",
                            "coverLetter": journal.get("rationale"),
                        },
                    )
            if self.agent_id == "rebuttal":
                submissions = self.main.api.request(f"/api/data/submissions?projectId={self.project['id']}")
                submission = next((item for item in submissions if item.get("manuscriptId") == manuscript["id"]), None)
                if submission is None:
                    submission = self.main.api.request(
                        "/api/data/submissions",
                        method="POST",
                        payload={"projectId": self.project["id"], "manuscriptId": manuscript["id"], "journalName": "Target Journal"},
                    )
                review_round = self.main.api.request(
                    "/api/data/review-rounds",
                    method="POST",
                    payload={"submissionId": submission["id"], "roundNumber": 1, "reviewText": self._field_value(self.fields["reviewerComments"])},
                )
                for response in structured.get("responses", []):
                    self.main.api.request(
                        "/api/data/rebuttal-items",
                        method="POST",
                        payload={
                            "reviewRoundId": review_round["id"],
                            "reviewerComment": response.get("comment") or "Reviewer comment",
                            "response": response.get("response"),
                            "changeLocation": response.get("changeLocation"),
                            "evidence": {"text": response["evidence"]} if response.get("evidence") else {},
                        },
                    )
            section = self._field_value(self.fields["section"]) if self.agent_id == "write" else self.agent_id
            section_order = {"abstract": 0, "introduction": 1, "methods": 2, "results": 3, "discussion": 4, "conclusion": 5}
            if self.agent_id not in {"submit", "rebuttal"}:
                self.main.api.request(
                    "/api/data/manuscript-blocks",
                    method="POST",
                    payload={
                        "manuscriptId": manuscript["id"],
                        "section": section or "introduction",
                        "order": section_order.get(section, 1),
                        "content": text,
                        "agentRunId": self.run_id,
                    },
                )
            return manuscript

        call_async(self.main.pool, apply, lambda _: QMessageBox.information(self, "已应用", "研究产物已保存到项目稿件、文献库或对应记录。"), self.main._show_error)


class TrainingPage(ScrollPage):
    ROUTES = [
        ("hub", "训练营首页", "/api/training/me"), ("manage", "课程与项目管理", "/api/training/programs"),
        ("analytics", "训练分析", "/api/training/analytics/dashboard"), ("report", "学习报告", "/api/training/me"),
        ("review", "作业评审", "/api/training/reviews"), ("peer", "同伴互评", "/api/training/peer"), ("verify", "证书验证", "/api/training/certificates/verify"),
    ]

    def __init__(self, main: MainWindow, route: str) -> None:
        super().__init__(main)
        self.route = route
        label, _, _ = next((item for item in self.ROUTES if item[0] == route), (route, route, ""))
        self.heading(label if route == "hub" else dict((key, name) for key, name, _ in self.ROUTES).get(route, label), "训练营、学习任务、提交、评审与分析工作区。")
        nav = QHBoxLayout()
        for key, title, _ in self.ROUTES:
            button = QPushButton(title)
            button.setObjectName("secondary")
            button.clicked.connect(lambda checked=False, dest=key: main.navigate(f"training:{dest}", force=True))
            nav.addWidget(button)
        self.layout.addLayout(nav)
        self.tabs = QTabWidget()
        self.summary = QTextBrowser()
        self.records = QTextBrowser()
        self.tabs.addTab(self.summary, "工作区")
        self.tabs.addTab(self.records, "记录与详情")
        self.layout.addWidget(self.tabs, 1)
        self.layout.addWidget(section_label("常用操作"))
        if route == "peer":
            self.peer_panel = QWidget()
            self.peer_layout = QVBoxLayout(self.peer_panel)
            self.layout.addWidget(self.peer_panel)
        if route == "hub":
            self.summary.setMarkdown("## 我的科研训练\n\n查看任务进度、提交作业、参与互评，并在导师模式中运行科研助手。选择上方栏目打开对应工作区。")
            self.task_grid = QGridLayout()
            task_box = card()
            task_layout = QVBoxLayout(task_box)
            task_layout.addWidget(section_label("八项训练任务"))
            task_layout.addLayout(self.task_grid)
            self.layout.addWidget(task_box)
        elif route == "verify":
            form = QHBoxLayout()
            self.certificate_id = QLineEdit()
            self.certificate_id.setPlaceholderText("证书编号")
            button = QPushButton("验证证书")
            button.setObjectName("primary")
            button.clicked.connect(self.verify_certificate)
            form.addWidget(self.certificate_id, 1)
            form.addWidget(button)
            self.layout.addLayout(form)

    def load(self) -> None:
        if self.route == "hub":
            path = "/api/training/me?include=all"
        else:
            path = next((path for key, _, path in self.ROUTES if key == self.route), "/api/training/me")
        getter = self.main.api.request_raw if self.route == "hub" else self.main.api.request
        call_async(self.main.pool, lambda: getter(path), self._loaded, self.main._show_error)

    def _loaded(self, data: Any) -> None:
        if self.route == "hub" and isinstance(data, dict):
            enrollments = data.get("data", [])
            submissions = data.get("submissions", [])
            enrollment = enrollments[0] if enrollments else None
            self.main.training_program_id = enrollment.get("programId") if enrollment else None
            self.summary.setMarkdown(
                f"## 学习账户\n\n**课程：** {(enrollment or {}).get('program', {}).get('name', '尚未加入训练营')}  \n"
                f"**提交记录：** {len(submissions)}\n\n选择任务卡片填写步骤答案并保存。"
            )
            for index, (task_id, title, agent, steps) in enumerate(TRAINING_TASKS):
                saved = next((item for item in submissions if item.get("taskId") == task_id), None)
                status = saved.get("status", "未开始") if saved else "未开始"
                button = QPushButton(f"{title}\n智能体：{AGENT_NAMES[agent]} · {status}")
                button.setObjectName("secondary")
                button.setMinimumHeight(65)
                button.clicked.connect(lambda checked=False, tid=task_id: self.main.navigate(f"training:task:{tid}", force=True))
                self.task_grid.addWidget(button, index // 2, index % 2)
        elif self.route == "manage" and isinstance(data, list):
            self.summary.setMarkdown("## 可访问课程\n\n选择课程加入训练营。课程权限和名额仍由服务端检查。")
            program_grid = QGridLayout()
            panel = card()
            panel_layout = QVBoxLayout(panel)
            panel_layout.addLayout(program_grid)
            self.layout.insertWidget(2, panel)
            for index, program in enumerate(data):
                item = QWidget()
                item_layout = QVBoxLayout(item)
                item_layout.addWidget(section_label(program.get("name", "科研训练课程")))
                item_layout.addWidget(QLabel(program.get("description", "")))
                join = QPushButton("加入课程")
                join.setObjectName("primary")
                join.clicked.connect(lambda checked=False, p=program: self.join_program(p))
                item_layout.addWidget(join)
                program_grid.addWidget(item, index // 2, index % 2)
        elif self.route == "peer" and isinstance(data, list):
            while self.peer_layout.count():
                item = self.peer_layout.takeAt(0)
                if item.widget():
                    item.widget().deleteLater()
            for assignment in data:
                panel = card()
                panel_layout = QVBoxLayout(panel)
                panel_layout.addWidget(section_label(f"{assignment.get('taskTitle')} · 作者 {assignment.get('authorToken')}"))
                panel_layout.addWidget(QLabel(f"提交时间：{assignment.get('assignedAt')} · 截止：{assignment.get('dueAt') or '未设置'}"))
                panel_layout.addWidget(QLabel(json.dumps(assignment.get("answers", {}), ensure_ascii=False, indent=2)))
                feedback = QTextEdit()
                feedback.setPlaceholderText("写下具体、尊重且可执行的反馈…")
                feedback.setMaximumHeight(90)
                score = QSpinBox()
                score.setRange(0, 100)
                score.setValue(80)
                controls = QHBoxLayout()
                controls.addWidget(QLabel("评分"))
                controls.addWidget(score)
                for decision, text in (("approved", "通过"), ("needs_revision", "建议修改")):
                    button = QPushButton(text)
                    button.setObjectName("primary" if decision == "approved" else "secondary")
                    button.clicked.connect(lambda checked=False, a=assignment, d=decision, f=feedback, s=score: self.submit_peer_review(a, d, f.toPlainText(), s.value()))
                    controls.addWidget(button)
                panel_layout.addWidget(feedback)
                panel_layout.addLayout(controls)
                self.peer_layout.addWidget(panel)
        self.records.setMarkdown(f"```json\n{json.dumps(data, ensure_ascii=False, indent=2, default=str)[:30000]}\n```")
        if self.route not in {"hub", "verify"}:
            self.summary.setMarkdown("## 当前数据\n\n已从训练服务加载。选择“记录与详情”查看原始字段。通过页面导航可切换任务、组织、报告和分析区域。")

    def join_program(self, program: dict[str, Any]) -> None:
        user_id = (self.main.api.user or {}).get("id")
        if not user_id:
            self.main._show_error("当前登录会话未包含用户标识，请重新登录。")
            return
        call_async(
            self.main.pool,
            lambda: self.main.api.request(
                f"/api/training/programs/{program['id']}/enrollments",
                method="POST",
                payload={"learnerId": user_id, "role": "learner", "status": "active"},
            ),
            lambda _: QMessageBox.information(self, "已加入课程", f"已加入“{program.get('name', '')}”。"),
            self.main._show_error,
        )

    def submit_peer_review(self, assignment: dict[str, Any], decision: str, feedback: str, score: int) -> None:
        payload = {"assignmentId": assignment["assignmentId"], "decision": decision, "feedback": feedback, "score": score, "evidenceCardIds": []}
        call_async(self.main.pool, lambda: self.main.api.request("/api/training/peer", method="POST", payload=payload), lambda _: self.load(), self.main._show_error)

    def verify_certificate(self) -> None:
        certificate_id = urllib_quote(self.certificate_id.text().strip())
        if not certificate_id:
            return
        call_async(self.main.pool, lambda: self.main.api.request(f"/api/training/certificates/verify?hash={certificate_id}"), lambda data: self.summary.setMarkdown(f"## 验证结果\n\n```json\n{json.dumps(data, ensure_ascii=False, indent=2)}\n```"), self.main._show_error)


class TrainingTaskPage(ScrollPage):
    def __init__(self, main: MainWindow, task: tuple[str, str, str, list[str]]) -> None:
        super().__init__(main)
        self.task_id, self.task_title, self.agent_id, self.steps = task
        self.heading(self.task_title, f"对应智能体：{AGENT_NAMES[self.agent_id]}。逐步记录研究过程和判断依据。")
        self.answers: dict[str, QTextEdit] = {}
        form = QFormLayout()
        for index, step in enumerate(self.steps, start=1):
            field = QTextEdit()
            field.setPlaceholderText("记录你的分析、证据和修改理由…")
            field.setMinimumHeight(90)
            self.answers[f"step{index}"] = field
            form.addRow(f"步骤 {index} · {step}", field)
        box = card()
        box_layout = QVBoxLayout(box)
        box_layout.addLayout(form)
        box_layout.addWidget(section_label("学习反思"))
        self.reflection = QTextEdit()
        self.reflection.setPlaceholderText("记录你如何核验 AI 输出、做出取舍并修改结果。")
        self.reflection.setMaximumHeight(120)
        box_layout.addWidget(self.reflection)
        self.layout.addWidget(box)
        row = QHBoxLayout()
        self.save_button = QPushButton("保存草稿")
        self.save_button.setObjectName("secondary")
        self.save_button.clicked.connect(lambda: self.save("draft"))
        row.addWidget(self.save_button)
        self.submit_button = QPushButton("提交作业")
        self.submit_button.setObjectName("primary")
        self.submit_button.clicked.connect(lambda: self.save("submitted"))
        row.addWidget(self.submit_button)
        row.addStretch(1)
        self.layout.addLayout(row)
        self.message = QLabel("")
        self.message.setObjectName("muted")
        self.layout.addWidget(self.message)

    def save(self, status: str) -> None:
        program_id = getattr(self.main, "training_program_id", None)
        if not program_id:
            QMessageBox.information(self, "尚未加入训练营", "先打开训练营管理并加入一个可用课程，再保存或提交任务。")
            return
        payload = {
            "programId": program_id,
            "taskId": self.task_id,
            "answers": {key: editor.toPlainText() for key, editor in self.answers.items()},
            "reflection": self.reflection.toPlainText(),
            "status": status,
        }
        self.save_button.setEnabled(False)
        self.submit_button.setEnabled(False)
        call_async(
            self.main.pool,
            lambda: self.main.api.request("/api/training/submissions", method="POST", payload=payload),
            lambda data: self._saved(data, status),
            self._save_failed,
        )

    def _saved(self, data: Any, status: str) -> None:
        self.save_button.setEnabled(True)
        self.submit_button.setEnabled(True)
        self.message.setText(f"已{('保存草稿' if status == 'draft' else '提交')} · {data.get('updatedAt', '')}")

    def _save_failed(self, message: str) -> None:
        self.save_button.setEnabled(True)
        self.submit_button.setEnabled(True)
        self.message.setText(message)


class ToolsPage(ScrollPage):
    def __init__(self, main: MainWindow) -> None:
        super().__init__(main)
        self.heading("研究工具", "面向文献、论文文本和期刊选择的快速工作区。")
        grid = QGridLayout()
        for index, key in enumerate(TOOL_NAMES):
            tile = project_tile({"name": TOOL_NAMES[key], "discipline": "研究工具", "goal": "打开工具并填写输入"}, lambda checked=False, tool=key: main.navigate(f"tool:{tool}", force=True))
            grid.addWidget(tile, index // 3, index % 3)
        self.layout.addLayout(grid)


class ToolPage(ScrollPage):
    def __init__(self, main: MainWindow, tool: str) -> None:
        super().__init__(main)
        self.tool = tool
        title = TOOL_NAMES.get(tool, tool)
        self.heading(title, "填写内容后运行对应研究助手。运行过程、审核和应用方式与项目助手一致。")
        self.input = QTextEdit()
        self.input.setPlaceholderText("粘贴研究问题、文献或论文内容…")
        self.input.setMinimumHeight(220)
        self.layout.addWidget(section_label("输入内容"))
        self.layout.addWidget(self.input)
        self.run_button = QPushButton("开始分析")
        self.run_button.setObjectName("primary")
        self.run_button.clicked.connect(self.run_tool)
        self.layout.addWidget(self.run_button, 0, Qt.AlignmentFlag.AlignLeft)
        self.output = QTextBrowser()
        self.output.setMinimumHeight(300)
        self.layout.addWidget(self.output, 1)

    def run_tool(self) -> None:
        if not self.main.current_project:
            QMessageBox.information(self, "需要项目", "请先创建或选择一个项目。")
            return
        if not hasattr(self, "consent"):
            self.consent = QCheckBox("我确认已检查输入并删除不应提交的敏感信息，同意将内容发送给已配置的 AI 与检索服务处理。")
            self.layout.insertWidget(3, self.consent)
        if not self.consent.isChecked():
            QMessageBox.information(self, "需要确认", "请先确认输入内容适合发送给已配置的 AI 服务。")
            return
        agent = {"literature-analysis": "litreview", "paper-polishing": "write", "journal-selection": "submit"}.get(self.tool, "litreview")
        run_input = {"query": self.input.toPlainText()} if agent == "litreview" else {"abstract": self.input.toPlainText()}

        def create() -> Any:
            project_id = self.main.current_project["id"]
            consent = self.main.api.request("/api/audit/consents", method="POST", payload={"projectId": project_id, "purpose": "agent_run", "dataCategories": ["research_text"], "externalServices": ["configured AI and research services"], "redactionConfirmed": True})
            thread = self.main.api.request("/api/agent/threads", method="POST", payload={"projectId": project_id, "title": self.tool})
            return self.main.api.request("/api/agent/runs", method="POST", payload={"threadId": thread["id"], "agent": agent, "goal": self.input.toPlainText()[:20000], "input": run_input, "consentId": consent["id"]})

        self.output.setMarkdown("任务已提交，正在运行…")
        call_async(self.main.pool, create, lambda run: self._poll(run["id"]), self.main._show_error)

    def _poll(self, run_id: str) -> None:
        def tick() -> None:
            call_async(self.main.pool, lambda: self.main.api.request(f"/api/agent/runs/{run_id}"), self._show_run, self.main._show_error)
        self.timer = QTimer(self)
        self.timer.timeout.connect(tick)
        self.timer.start(1500)
        tick()

    def _show_run(self, run: dict[str, Any]) -> None:
        artifacts = run.get("artifacts", [])
        if artifacts:
            self.output.setMarkdown(artifacts[-1].get("content", {}).get("text", ""))
        else:
            self.output.setMarkdown(f"运行状态：`{run.get('status')}`")
        if run.get("status") in {"succeeded", "failed", "cancelled"}:
            self.timer.stop()


class SettingsPage(ScrollPage):
    def __init__(self, main: MainWindow) -> None:
        super().__init__(main)
        self.heading("设置", "管理桌面显示语言、服务地址与本地会话。")
        language = card()
        l = QVBoxLayout(language)
        l.addWidget(section_label("界面语言"))
        select = QComboBox()
        select.addItem("简体中文", "zh-CN")
        select.addItem("English", "en-US")
        select.setCurrentIndex(0 if main.language == "zh-CN" else 1)
        select.currentIndexChanged.connect(lambda i: main.locale.setCurrentIndex(i))
        l.addWidget(select)
        agent_language = QComboBox()
        agent_language.addItem("跟随研究输入", "auto")
        agent_language.addItem("中文", "zh")
        agent_language.addItem("English", "en")
        agent_language.setCurrentIndex({"auto": 0, "zh": 1, "en": 2}.get(main.agent_language, 0))
        agent_language.currentIndexChanged.connect(lambda i: self.set_agent_language(str(agent_language.itemData(i))))
        l.addWidget(QLabel("智能体回复语言"))
        l.addWidget(agent_language)
        self.layout.addWidget(language)
        connection = card()
        c = QVBoxLayout(connection)
        c.addWidget(section_label("服务连接"))
        c.addWidget(QLabel(f"FastAPI 后端服务：{main.api.base_url}"))
        c.addWidget(QLabel("桌面端仅在内存中保留短时效访问令牌，不读取或保存 backend service token。"))
        c.addWidget(QLabel("API 状态：已使用当前账号的访问令牌访问。"))
        self.layout.addWidget(connection)
        plugins = card()
        p = QVBoxLayout(plugins)
        p.addWidget(section_label("扩展与服务"))
        p.addWidget(QLabel("插件、MCP 和外部模型服务沿用后端当前配置。"))
        self.layout.addWidget(plugins)
        self.backend_status = QTextBrowser()
        self.backend_status.setMaximumHeight(220)
        self.backend_status.setMarkdown("正在读取已配置的插件和 MCP 工具…")
        self.layout.addWidget(self.backend_status)
        call_async(
            main.pool,
            lambda: {
                "plugins": main.api.request("/api/plugins"),
                "mcpTools": main.api.request("/api/mcp/tools"),
            },
            lambda data: self.backend_status.setMarkdown(
                "## 插件与工具\n\n```json\n" + json.dumps(data, ensure_ascii=False, indent=2, default=str)[:12000] + "\n```"
            ),
            lambda error: self.backend_status.setMarkdown(f"插件与 MCP 配置读取失败：{error}"),
        )

    def set_agent_language(self, value: str) -> None:
        self.main.agent_language = value
        self.main.preferences.setValue("agentLanguage", value)


def section_label(text: str) -> QLabel:
    label = QLabel(text)
    label.setObjectName("section")
    return label


def project_tile(project: dict[str, Any], on_click: Callable[..., None]) -> QPushButton:
    name = project.get("name", "研究项目")
    detail = project.get("discipline") or "项目工作区"
    goal = project.get("goal") or project.get("description") or "打开项目查看研究助手与产物。"
    button = QPushButton(f"{name}\n{detail}\n\n{goal[:125]}")
    button.setObjectName("secondary")
    button.setMinimumHeight(128)
    button.setCursor(Qt.CursorShape.PointingHandCursor)
    button.clicked.connect(on_click)
    button.setStyleSheet("text-align:left;padding:16px;line-height:1.45")
    return button


def urllib_quote(value: str) -> str:
    from urllib.parse import quote

    return quote(value, safe="")


def main() -> int:
    parser = argparse.ArgumentParser(description="iScholar PySide6 desktop client")
    parser.add_argument(
        "--base-url",
        default=os.getenv("ISCHOLAR_BACKEND_URL", "http://127.0.0.1:8000"),
        help="FastAPI backend base URL (no web/BFF required)",
    )
    parser.add_argument("--smoke-test", action="store_true", help=argparse.SUPPRESS)
    args = parser.parse_args()
    if args.smoke_test:
        "example.com".encode("idna")
        os.environ["QT_QPA_PLATFORM"] = "offscreen"
        QApplication([])
        return 0
    app = QApplication(sys.argv)
    app.setApplicationName(APP_NAME)
    app.setFont(QFont("Inter", 10))
    app.setStyleSheet(QSS)
    api = ApiClient(args.base_url)
    login = LoginDialog(api)
    if login.exec() != QDialog.DialogCode.Accepted:
        return 0
    window = MainWindow(api)
    window.show()
    return app.exec()


if __name__ == "__main__":
    raise SystemExit(main())
