"""Task manager for background task orchestration."""

import asyncio
import sqlite3
import json
import logging
import uuid
from typing import Dict, Any, Optional, Callable, Awaitable, List
from datetime import datetime
from enum import Enum
from dataclasses import dataclass, field
from pathlib import Path

from .sse_manager import sse_manager


logger = logging.getLogger(__name__)


class TaskStatus(str, Enum):
    """Task status enumeration."""

    PENDING = "pending"
    RUNNING = "running"
    AWAITING_INPUT = "awaiting_input"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


@dataclass
class Task:
    """Represents a background task."""

    task_id: str
    task_type: str
    status: TaskStatus = TaskStatus.PENDING
    progress: float = 0.0
    message: str = ""
    created_at: datetime = field(default_factory=datetime.now)
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    error: Optional[str] = None
    result: Optional[Dict[str, Any]] = None

    # For interactive tasks
    awaiting_input: bool = False
    input_options: Optional[List[Dict[str, Any]]] = None
    input_prompt: Optional[str] = None
    input_response: Optional[Any] = None
    input_event: Optional[asyncio.Event] = None

    # Task parameters
    params: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return {
            "task_id": self.task_id,
            "task_type": self.task_type,
            "status": self.status.value,
            "progress": self.progress,
            "message": self.message,
            "created_at": self.created_at.isoformat(),
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "error": self.error,
            "awaiting_input": self.awaiting_input,
            "input_options": self.input_options,
            "input_prompt": self.input_prompt,
        }


class TaskManager:
    """Manages background tasks with SQLite persistence."""

    def __init__(self, db_path: str = "web_tasks.db"):
        self.db_path = Path(db_path)
        self._tasks: Dict[str, Task] = {}
        self._task_queue: asyncio.Queue = asyncio.Queue()
        self._worker_task: Optional[asyncio.Task] = None
        self._lock = asyncio.Lock()
        self._task_handlers: Dict[str, Callable] = {}
        self._init_database()

    def _init_database(self):
        """Initialize the task tracking database."""
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS tasks (
                    task_id TEXT PRIMARY KEY,
                    task_type TEXT NOT NULL,
                    status TEXT NOT NULL,
                    progress REAL DEFAULT 0.0,
                    message TEXT,
                    params TEXT,
                    result TEXT,
                    error TEXT,
                    created_at TEXT NOT NULL,
                    started_at TEXT,
                    completed_at TEXT
                )
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS task_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    task_id TEXT NOT NULL,
                    level TEXT NOT NULL,
                    message TEXT NOT NULL,
                    timestamp TEXT NOT NULL,
                    FOREIGN KEY (task_id) REFERENCES tasks (task_id)
                )
            """)
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks (status)"
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_task_logs_task_id ON task_logs (task_id)"
            )
            conn.commit()
        logger.info(f"Task database initialized at {self.db_path}")

    def register_handler(
        self, task_type: str, handler: Callable[["Task", "TaskManager"], Awaitable[None]]
    ):
        """Register a handler for a task type."""
        self._task_handlers[task_type] = handler
        logger.info(f"Registered handler for task type: {task_type}")

    async def start(self):
        """Start the task worker."""
        if self._worker_task is None:
            self._worker_task = asyncio.create_task(self._worker_loop())
            logger.info("Task worker started")

    async def stop(self):
        """Stop the task worker."""
        if self._worker_task:
            self._worker_task.cancel()
            try:
                await self._worker_task
            except asyncio.CancelledError:
                pass
            self._worker_task = None
            logger.info("Task worker stopped")

    async def create_task(
        self, task_type: str, params: Optional[Dict[str, Any]] = None
    ) -> Task:
        """Create a new task and queue it for execution."""
        task_id = str(uuid.uuid4())
        task = Task(
            task_id=task_id,
            task_type=task_type,
            params=params or {},
            input_event=asyncio.Event(),
        )

        async with self._lock:
            self._tasks[task_id] = task

        # Persist to database
        self._save_task(task)

        # Queue for execution
        await self._task_queue.put(task_id)

        # Broadcast task creation
        await sse_manager.broadcast_global_event("task_created", task.to_dict())

        logger.info(f"Created task {task_id} of type {task_type}")
        return task

    async def get_task(self, task_id: str) -> Optional[Task]:
        """Get a task by ID."""
        async with self._lock:
            return self._tasks.get(task_id)

    async def get_all_tasks(self, limit: int = 50) -> List[Task]:
        """Get all tasks, sorted by creation time."""
        async with self._lock:
            tasks = list(self._tasks.values())
        return sorted(tasks, key=lambda t: t.created_at, reverse=True)[:limit]

    async def update_progress(
        self, task_id: str, progress: float, message: str = ""
    ):
        """Update task progress."""
        async with self._lock:
            task = self._tasks.get(task_id)
            if task:
                task.progress = progress
                task.message = message
                self._save_task(task)

        # Broadcast update
        await sse_manager.broadcast_task_event(
            task_id,
            "progress",
            {"progress": progress, "message": message},
        )

    async def request_input(
        self,
        task_id: str,
        prompt: str,
        options: List[Dict[str, Any]],
    ) -> Optional[int]:
        """Request user input for an interactive task.

        Returns the selected option index, or None if cancelled.
        """
        async with self._lock:
            task = self._tasks.get(task_id)
            if not task:
                return None

            task.status = TaskStatus.AWAITING_INPUT
            task.awaiting_input = True
            task.input_prompt = prompt
            task.input_options = options
            task.input_response = None
            if task.input_event:
                task.input_event.clear()
            self._save_task(task)

        # Broadcast input request
        await sse_manager.broadcast_task_event(
            task_id,
            "input_required",
            {
                "prompt": prompt,
                "options": options,
            },
        )

        # Wait for response
        if task.input_event:
            await task.input_event.wait()

        async with self._lock:
            task = self._tasks.get(task_id)
            if task:
                task.awaiting_input = False
                task.status = TaskStatus.RUNNING
                response = task.input_response
                task.input_options = None
                task.input_prompt = None
                self._save_task(task)
                return response

        return None

    async def respond_to_input(self, task_id: str, selection: int) -> bool:
        """Respond to an interactive input request."""
        async with self._lock:
            task = self._tasks.get(task_id)
            if not task or not task.awaiting_input:
                return False

            task.input_response = selection
            if task.input_event:
                task.input_event.set()

        logger.info(f"Task {task_id} received input response: {selection}")
        return True

    async def cancel_task(self, task_id: str) -> bool:
        """Cancel a task."""
        async with self._lock:
            task = self._tasks.get(task_id)
            if not task:
                return False

            if task.status in [TaskStatus.PENDING, TaskStatus.RUNNING, TaskStatus.AWAITING_INPUT]:
                task.status = TaskStatus.CANCELLED
                task.completed_at = datetime.now()
                task.message = "Cancelled by user"
                if task.input_event:
                    task.input_event.set()  # Unblock if waiting for input
                self._save_task(task)

        # Broadcast cancellation
        await sse_manager.broadcast_task_event(task_id, "cancelled", {})
        await sse_manager.broadcast_global_event("task_updated", task.to_dict())

        logger.info(f"Task {task_id} cancelled")
        return True

    async def log_task(self, task_id: str, level: str, message: str):
        """Log a message for a task."""
        timestamp = datetime.now().isoformat()
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                "INSERT INTO task_logs (task_id, level, message, timestamp) VALUES (?, ?, ?, ?)",
                (task_id, level, message, timestamp),
            )
            conn.commit()

        # Broadcast log entry
        await sse_manager.broadcast_task_event(
            task_id,
            "log",
            {"level": level, "message": message, "timestamp": timestamp},
        )

    async def get_task_logs(
        self, task_id: str, limit: int = 100
    ) -> List[Dict[str, Any]]:
        """Get logs for a task."""
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.execute(
                "SELECT level, message, timestamp FROM task_logs WHERE task_id = ? ORDER BY id DESC LIMIT ?",
                (task_id, limit),
            )
            return [dict(row) for row in cursor.fetchall()]

    def _save_task(self, task: Task):
        """Save task to database."""
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO tasks
                (task_id, task_type, status, progress, message, params, result, error, created_at, started_at, completed_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    task.task_id,
                    task.task_type,
                    task.status.value,
                    task.progress,
                    task.message,
                    json.dumps(task.params),
                    json.dumps(task.result) if task.result else None,
                    task.error,
                    task.created_at.isoformat(),
                    task.started_at.isoformat() if task.started_at else None,
                    task.completed_at.isoformat() if task.completed_at else None,
                ),
            )
            conn.commit()

    async def _worker_loop(self):
        """Main worker loop that processes tasks sequentially."""
        logger.info("Task worker loop started")
        while True:
            try:
                task_id = await self._task_queue.get()
                await self._execute_task(task_id)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Worker loop error: {e}")

    async def _execute_task(self, task_id: str):
        """Execute a single task."""
        async with self._lock:
            task = self._tasks.get(task_id)
            if not task:
                logger.warning(f"Task {task_id} not found")
                return

            if task.status == TaskStatus.CANCELLED:
                logger.info(f"Task {task_id} was cancelled before execution")
                return

            task.status = TaskStatus.RUNNING
            task.started_at = datetime.now()
            self._save_task(task)

        # Broadcast task started
        await sse_manager.broadcast_task_event(task_id, "started", {})
        await sse_manager.broadcast_global_event("task_updated", task.to_dict())

        try:
            handler = self._task_handlers.get(task.task_type)
            if not handler:
                raise ValueError(f"No handler registered for task type: {task.task_type}")

            await handler(task, self)

            # Mark completed
            async with self._lock:
                task = self._tasks.get(task_id)
                if task and task.status != TaskStatus.CANCELLED:
                    task.status = TaskStatus.COMPLETED
                    task.completed_at = datetime.now()
                    task.progress = 100.0
                    self._save_task(task)

            # Broadcast completion
            await sse_manager.broadcast_task_event(
                task_id, "completed", {"result": task.result}
            )
            await sse_manager.broadcast_global_event("task_updated", task.to_dict())

            logger.info(f"Task {task_id} completed successfully")

        except Exception as e:
            logger.error(f"Task {task_id} failed: {e}")

            async with self._lock:
                task = self._tasks.get(task_id)
                if task:
                    task.status = TaskStatus.FAILED
                    task.completed_at = datetime.now()
                    task.error = str(e)
                    self._save_task(task)

            # Broadcast failure
            await sse_manager.broadcast_task_event(
                task_id, "failed", {"error": str(e)}
            )
            await sse_manager.broadcast_global_event("task_updated", task.to_dict())


# Global task manager instance
task_manager = TaskManager()
