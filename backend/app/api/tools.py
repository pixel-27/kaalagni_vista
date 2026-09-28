import logging
from typing import List
from fastapi import APIRouter, status
from app.models.tools import (
    ToolDefinition,
    ToolExecuteRequest,
    ToolExecuteResponse,
)
from app.services.tools import registry, ToolExecutor

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/tools", tags=["Tools"])

@router.get("", response_model=List[ToolDefinition], status_code=status.HTTP_200_OK)
async def list_available_tools() -> List[ToolDefinition]:
    """
    Returns the catalog of registered, controlled VISTA diagnostic tools
    along with their schemas, parameters, and permission levels.
    """
    return registry.list_definitions()

@router.post("/execute", response_model=ToolExecuteResponse, status_code=status.HTTP_200_OK)
async def execute_tool(request: ToolExecuteRequest) -> ToolExecuteResponse:
    """
    Executes a requested diagnostic tool within strict security boundaries.
    For execution tools (e.g. run_test), explicit user confirmation (user_approved=True) is required.
    """
    result = await ToolExecutor.execute(
        call_id=request.call_id,
        tool_name=request.tool,
        arguments=request.arguments,
        user_approved=request.user_approved,
    )
    return ToolExecuteResponse(result=result)
