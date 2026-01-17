"""Server-Sent Events manager for real-time updates."""

import asyncio
import json
import logging
from typing import Dict, Set, Any, AsyncGenerator
from datetime import datetime


logger = logging.getLogger(__name__)


class SSEManager:
    """Manages Server-Sent Events connections and broadcasting."""

    def __init__(self):
        # Map of task_id -> set of client queues
        self._task_subscribers: Dict[str, Set[asyncio.Queue]] = {}
        # Map of client_id -> queue for global events
        self._global_subscribers: Set[asyncio.Queue] = set()
        self._lock = asyncio.Lock()

    async def subscribe_task(self, task_id: str) -> asyncio.Queue:
        """Subscribe to events for a specific task.

        Returns a queue that will receive events for this task.
        """
        queue: asyncio.Queue = asyncio.Queue()
        async with self._lock:
            if task_id not in self._task_subscribers:
                self._task_subscribers[task_id] = set()
            self._task_subscribers[task_id].add(queue)
            logger.debug(f"Client subscribed to task {task_id}")
        return queue

    async def unsubscribe_task(self, task_id: str, queue: asyncio.Queue):
        """Unsubscribe from task events."""
        async with self._lock:
            if task_id in self._task_subscribers:
                self._task_subscribers[task_id].discard(queue)
                if not self._task_subscribers[task_id]:
                    del self._task_subscribers[task_id]
                logger.debug(f"Client unsubscribed from task {task_id}")

    async def subscribe_global(self) -> asyncio.Queue:
        """Subscribe to global events (task list updates, etc.)."""
        queue: asyncio.Queue = asyncio.Queue()
        async with self._lock:
            self._global_subscribers.add(queue)
            logger.debug("Client subscribed to global events")
        return queue

    async def unsubscribe_global(self, queue: asyncio.Queue):
        """Unsubscribe from global events."""
        async with self._lock:
            self._global_subscribers.discard(queue)
            logger.debug("Client unsubscribed from global events")

    async def broadcast_task_event(
        self, task_id: str, event_type: str, data: Dict[str, Any]
    ):
        """Broadcast an event to all subscribers of a task."""
        event = {
            "event": event_type,
            "task_id": task_id,
            "timestamp": datetime.now().isoformat(),
            "data": data,
        }

        async with self._lock:
            subscribers = self._task_subscribers.get(task_id, set()).copy()

        for queue in subscribers:
            try:
                await queue.put(event)
            except Exception as e:
                logger.warning(f"Failed to send event to subscriber: {e}")

    async def broadcast_global_event(self, event_type: str, data: Dict[str, Any]):
        """Broadcast an event to all global subscribers."""
        event = {
            "event": event_type,
            "timestamp": datetime.now().isoformat(),
            "data": data,
        }

        async with self._lock:
            subscribers = self._global_subscribers.copy()

        for queue in subscribers:
            try:
                await queue.put(event)
            except Exception as e:
                logger.warning(f"Failed to send global event to subscriber: {e}")

    async def task_event_generator(
        self, task_id: str
    ) -> AsyncGenerator[str, None]:
        """Generate SSE events for a specific task.

        Yields formatted SSE strings.
        """
        queue = await self.subscribe_task(task_id)
        try:
            while True:
                try:
                    # Wait for event with timeout to allow periodic keepalives
                    event = await asyncio.wait_for(queue.get(), timeout=30.0)
                    yield self._format_sse(event)
                except asyncio.TimeoutError:
                    # Send keepalive
                    yield ": keepalive\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            await self.unsubscribe_task(task_id, queue)

    async def global_event_generator(self) -> AsyncGenerator[str, None]:
        """Generate SSE events for global updates.

        Yields formatted SSE strings.
        """
        queue = await self.subscribe_global()
        try:
            while True:
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=30.0)
                    yield self._format_sse(event)
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            await self.unsubscribe_global(queue)

    def _format_sse(self, event: Dict[str, Any]) -> str:
        """Format event as SSE string."""
        event_type = event.get("event", "message")
        data = json.dumps(event)
        return f"event: {event_type}\ndata: {data}\n\n"


# Global SSE manager instance
sse_manager = SSEManager()
