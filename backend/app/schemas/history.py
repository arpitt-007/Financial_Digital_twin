from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class HistoryCreate(BaseModel):
    scenario_key: str = Field(min_length=1, max_length=50)
    title: str = Field(min_length=1, max_length=200)
    meta: dict[str, Any]
    response: dict[str, Any]
    net_worth_difference: float = 0


class HistoryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    scenario_key: str
    title: str
    meta: dict[str, Any]
    response: dict[str, Any]
    net_worth_difference: float
    created_at: datetime
