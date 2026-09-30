from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    status,
)
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.routers.deps import get_current_user
from app.routers.profile import get_user_profile
from app.schemas.simulation import (
    SimulationRequest,
    SimulationResponse,
)
from app.services.simulation_service import (
    run_simulation_for_profile,
)


router = APIRouter(
    prefix="/simulate",
    tags=["Simulation"],
)

@router.post(
    "",
    response_model=SimulationResponse,
    summary=(
        "Compare the stored financial baseline "
        "with a what-if scenario"
    ),
)
def run_simulation(
    request: SimulationRequest,
    current_user: User = Depends(get_current_user),
    database: Session = Depends(get_db),
):
    profile = get_user_profile(database, current_user)

    if profile is None:
        raise HTTPException(
            status_code=(
                status.HTTP_404_NOT_FOUND
            ),
            detail=(
                "Financial profile "
                "has not been created"
            ),
        )

    return run_simulation_for_profile(
        profile=profile,
        request=request,
    )