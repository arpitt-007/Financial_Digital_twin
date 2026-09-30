from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.simulation_history import SimulationRecord
from app.models.user import User
from app.routers.deps import get_current_user
from app.schemas.history import HistoryCreate, HistoryResponse

router = APIRouter(prefix="/history", tags=["History"])


def _to_response(record: SimulationRecord) -> HistoryResponse:
    return HistoryResponse(
        id=record.id,
        scenario_key=record.scenario_key,
        title=record.title,
        meta=record.meta_json,
        response=record.response_json,
        net_worth_difference=record.net_worth_difference,
        created_at=record.created_at,
    )


@router.get("", response_model=list[HistoryResponse])
def list_history(
    current_user: User = Depends(get_current_user),
    database: Session = Depends(get_db),
) -> list[HistoryResponse]:
    records = database.scalars(
        select(SimulationRecord)
        .where(SimulationRecord.user_id == current_user.id)
        .order_by(SimulationRecord.created_at.desc(), SimulationRecord.id.desc())
    ).all()
    return [_to_response(r) for r in records]


@router.post(
    "",
    response_model=HistoryResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_history(
    payload: HistoryCreate,
    current_user: User = Depends(get_current_user),
    database: Session = Depends(get_db),
) -> HistoryResponse:
    record = SimulationRecord(
        user_id=current_user.id,
        scenario_key=payload.scenario_key,
        title=payload.title,
        meta_json=payload.meta,
        response_json=payload.response,
        net_worth_difference=payload.net_worth_difference,
    )
    database.add(record)
    database.commit()
    database.refresh(record)
    return _to_response(record)


@router.delete("/{record_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_history(
    record_id: int,
    current_user: User = Depends(get_current_user),
    database: Session = Depends(get_db),
) -> Response:
    record = database.get(SimulationRecord, record_id)
    if record is None or record.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="History entry not found.",
        )
    database.delete(record)
    database.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
