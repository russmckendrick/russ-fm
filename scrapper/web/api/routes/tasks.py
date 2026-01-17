"""Task management API routes."""

import logging
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from ...core.auth import get_current_user
from ...core.task_manager import task_manager
from ...core.sse_manager import sse_manager
from ..models.requests import TaskInteractiveResponse
from ..models.responses import (
    TaskInfo,
    TaskListResponse,
    TaskStatus,
)


router = APIRouter(prefix="/api/v1/tasks", tags=["tasks"])
logger = logging.getLogger(__name__)


@router.get("", response_model=TaskListResponse)
async def list_tasks(
    limit: int = 50,
    user: str = Depends(get_current_user),
):
    """List all tasks."""
    tasks = await task_manager.get_all_tasks(limit=limit)

    items = []
    for task in tasks:
        items.append(
            TaskInfo(
                task_id=task.task_id,
                task_type=task.task_type,
                status=TaskStatus(task.status.value),
                progress=task.progress,
                message=task.message,
                created_at=task.created_at,
                started_at=task.started_at,
                completed_at=task.completed_at,
                error=task.error,
                awaiting_input=task.awaiting_input,
                input_options=task.input_options,
                input_prompt=task.input_prompt,
            )
        )

    return TaskListResponse(
        tasks=items,
        total=len(items),
    )


@router.get("/{task_id}", response_model=TaskInfo)
async def get_task(task_id: str, user: str = Depends(get_current_user)):
    """Get task details."""
    task = await task_manager.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    return TaskInfo(
        task_id=task.task_id,
        task_type=task.task_type,
        status=TaskStatus(task.status.value),
        progress=task.progress,
        message=task.message,
        created_at=task.created_at,
        started_at=task.started_at,
        completed_at=task.completed_at,
        error=task.error,
        awaiting_input=task.awaiting_input,
        input_options=task.input_options,
        input_prompt=task.input_prompt,
    )


@router.get("/{task_id}/stream")
async def stream_task(task_id: str, user: str = Depends(get_current_user)):
    """Stream task events via SSE."""
    task = await task_manager.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    return StreamingResponse(
        sse_manager.task_event_generator(task_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/{task_id}/logs")
async def get_task_logs(
    task_id: str,
    limit: int = 100,
    user: str = Depends(get_current_user),
):
    """Get task logs."""
    task = await task_manager.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    logs = await task_manager.get_task_logs(task_id, limit=limit)
    return {"logs": logs}


@router.post("/{task_id}/respond")
async def respond_to_task(
    task_id: str,
    request: TaskInteractiveResponse,
    user: str = Depends(get_current_user),
):
    """Respond to an interactive task prompt."""
    task = await task_manager.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    if not task.awaiting_input:
        raise HTTPException(status_code=400, detail="Task is not awaiting input")

    success = await task_manager.respond_to_input(task_id, request.selection)
    if not success:
        raise HTTPException(status_code=400, detail="Failed to submit response")

    return {"success": True, "message": "Response submitted"}


@router.delete("/{task_id}")
async def cancel_task(task_id: str, user: str = Depends(get_current_user)):
    """Cancel a task."""
    task = await task_manager.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    success = await task_manager.cancel_task(task_id)
    if not success:
        raise HTTPException(status_code=400, detail="Failed to cancel task")

    return {"success": True, "message": "Task cancelled"}


@router.get("/stream/global")
async def stream_global_events(user: str = Depends(get_current_user)):
    """Stream global events via SSE (task list updates, etc.)."""
    return StreamingResponse(
        sse_manager.global_event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
