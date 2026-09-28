from fastapi import APIRouter
from pydantic import BaseModel
from datetime import datetime, timezone
from app.core.config import settings

router = APIRouter(tags=["Health"])

class HealthResponse(BaseModel):
    status: str
    project: str
    version: str
    timestamp: str
    environment: str

@router.get("/health", response_model=HealthResponse)
async def check_health() -> HealthResponse:
    return HealthResponse(
        status="healthy",
        project=settings.PROJECT_NAME,
        version=settings.VERSION,
        timestamp=datetime.now(timezone.utc).isoformat(),
        environment=settings.VISTA_ENV,
    )
