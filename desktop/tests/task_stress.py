"""Exercise real Qt navigation and worker cleanup in an isolated process."""
import faulthandler
import threading
import time

from PySide6.QtCore import QCoreApplication, QEvent
from PySide6.QtWidgets import QApplication

from ischolar_desktop.app import MainWindow

faulthandler.enable()


class FakeApi:
    def __init__(self):
        self.release = threading.Event()
        self.started = threading.Event()
        self.lock = threading.Lock()
        self.calls = 0

    def request(self, path):
        with self.lock:
            self.calls += 1
            self.started.set()
        if not self.release.wait(10):
            raise TimeoutError("test request was not released")
        if path.startswith("/api/data/projects"):
            return [{"id": "project-1", "name": "Test project"}]
        if path.startswith("/api/agent/runs"):
            return [{"agent": "topic", "status": "done", "goal": "Test"}]
        raise AssertionError(f"Unexpected request: {path}")


def pump_until(app, condition, timeout=10):
    deadline = time.monotonic() + timeout
    while not condition():
        if time.monotonic() >= deadline:
            raise AssertionError("Timed out waiting for UI state")
        app.processEvents()
        time.sleep(0.002)
    app.processEvents()


def main():
    app = QApplication([])
    app.setQuitOnLastWindowClosed(False)
    for _ in range(12):
        api = FakeApi()
        window = MainWindow(api)
        errors = []
        window._show_error = errors.append
        window.show()
        assert api.started.wait(5)
        for _ in range(8):
            window.navigate("projects")
            window.navigate("dashboard")
            app.processEvents()
        api.release.set()
        pump_until(app, lambda: getattr(window, "projects", None) is not None
                   and window.pages["dashboard"].metrics[1].value.text() == "1")
        assert window.project_picker.currentText() == "Test project"
        assert not errors, errors
        assert window.pool.waitForDone(5000)
        app._ischolar_task_owner.collect_finished()

        # Close with a request in flight; release it while shutdown waits.
        api.started.clear()
        api.release.clear()
        window.load_projects()
        assert api.started.wait(5)
        releaser = threading.Timer(0.02, api.release.set)
        releaser.start()
        window.close()
        app._ischolar_task_owner.shutdown()
        releaser.join()
        app.processEvents()
        window.deleteLater()
        QCoreApplication.sendPostedEvents(None, QEvent.Type.DeferredDelete)
        app.processEvents()
    assert not app._ischolar_task_owner.tasks


if __name__ == "__main__":
    main()
