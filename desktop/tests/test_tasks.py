import os
import subprocess
import sys
import threading
import time
import unittest

os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")

from pathlib import Path

from PySide6.QtCore import QThread, QThreadPool
from PySide6.QtWidgets import QApplication

from ischolar_desktop.app import ApiTask, TaskOwner, call_async


class TaskLifetimeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.app = QApplication.instance() or QApplication([])

    def test_owner_retains_task_until_run_has_returned(self):
        pool = QThreadPool()
        owner = TaskOwner(self.app)
        emitted = threading.Event()
        release = threading.Event()

        class PausedTask(ApiTask):
            def run(self):
                self.signals.result.emit("done")
                emitted.set()
                release.wait(5)

        task = PausedTask(lambda: None)
        owner.start(pool, task)
        try:
            self.assertTrue(emitted.wait(5))
            owner.collect_finished()
            self.assertIn(task, owner.tasks[pool])
        finally:
            release.set()
            self.assertTrue(pool.waitForDone(5000))
            owner.collect_finished()
            owner.deleteLater()
        self.assertFalse(owner.tasks)

    def test_result_and_error_are_delivered(self):
        pool = QThreadPool()
        received = []
        callback_threads = []

        def receive(value):
            callback_threads.append(QThread.currentThread())
            received.append(value)

        call_async(pool, lambda: 42, receive, receive)

        def fail():
            raise ValueError("network failure")

        call_async(pool, fail, receive, receive)
        deadline = time.monotonic() + 5
        while len(received) < 2 and time.monotonic() < deadline:
            self.app.processEvents()
            time.sleep(0.005)
        self.assertCountEqual(received, [42, "network failure"])
        self.assertTrue(all(thread == self.app.thread() for thread in callback_threads))
        self.assertTrue(pool.waitForDone(5000))
        self.app._ischolar_task_owner.collect_finished()

    def test_concurrent_tasks_are_retained_until_pool_is_idle(self):
        pool = QThreadPool()
        owner = TaskOwner(self.app)
        started = threading.Event()
        release = threading.Event()
        finished = threading.Event()

        def blocked():
            started.set()
            release.wait(5)

        def fast():
            finished.set()

        slow_task = ApiTask(blocked)
        fast_task = ApiTask(fast)
        owner.start(pool, slow_task)
        owner.start(pool, fast_task)
        try:
            self.assertTrue(started.wait(5))
            self.assertTrue(finished.wait(5))
            owner.collect_finished()
            self.assertEqual(len(owner.tasks[pool]), 2)
            self.assertTrue(owner.timer.isActive())
        finally:
            release.set()
            self.assertTrue(pool.waitForDone(5000))
            owner.collect_finished()
            owner.deleteLater()
        self.assertFalse(owner.tasks)
        self.assertFalse(owner.timer.isActive())

    def test_shutdown_waits_for_running_tasks(self):
        pool = QThreadPool()
        owner = TaskOwner(self.app)
        started = threading.Event()
        release = threading.Event()
        finished = threading.Event()

        def blocked():
            started.set()
            release.wait(5)
            finished.set()

        owner.start(pool, ApiTask(blocked))
        self.assertTrue(started.wait(5))
        timer = threading.Timer(0.1, release.set)
        timer.start()
        try:
            owner.shutdown()
            self.assertTrue(finished.is_set())
            self.assertFalse(owner.tasks)
            self.assertFalse(owner.timer.isActive())
        finally:
            release.set()
            timer.join()
            pool.waitForDone(5000)
            owner.deleteLater()

    def test_navigation_and_shutdown_stress_in_subprocess(self):
        script = Path(__file__).with_name("task_stress.py")
        result = subprocess.run(
            [sys.executable, str(script)], capture_output=True, text=True, timeout=45,
            env={**os.environ, "QT_QPA_PLATFORM": "offscreen"},
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertNotIn("Traceback", result.stderr)


if __name__ == "__main__":
    unittest.main()
