from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.twin_profile import TwinProfile
from app.models.user import User
from app.routers.deps import get_current_user
from app.schemas.twin_profile import (
    TwinProfileResponse,
    TwinProfileUpdate,
)

router = APIRouter(
    prefix="/profile",
    tags=["Financial Profile"],
)


def get_user_profile(database: Session, user: User) -> TwinProfile | None:
    return database.scalar(
        select(TwinProfile).where(TwinProfile.user_id == user.id)
    )


@router.get(
    "",
    response_model=TwinProfileResponse,
    summary="Get the current user's financial profile",
)
def get_profile(
    current_user: User = Depends(get_current_user),
    database: Session = Depends(get_db),
) -> TwinProfile:
    profile = get_user_profile(database, current_user)

    if profile is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Financial profile has not been created",
        )

    return profile


@router.put(
    "",
    response_model=TwinProfileResponse,
    summary="Create or update the current user's financial profile",
)
def update_profile(
    profile_data: TwinProfileUpdate,
    current_user: User = Depends(get_current_user),
    database: Session = Depends(get_db),
) -> TwinProfile:
    profile = get_user_profile(database, current_user)

    validated_data = profile_data.model_dump()

    if profile is None:
        profile = TwinProfile(user_id=current_user.id, **validated_data)
        database.add(profile)
    else:
        for field_name, value in validated_data.items():
            setattr(profile, field_name, value)

    database.commit()
    database.refresh(profile)

    return profile
