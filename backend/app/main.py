from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from sqlalchemy import inspect, text

from app.database import Base, engine
from app import models  # noqa: F401  (registers tables on Base.metadata)
from app.routers import profile_router
from app.routers import auth
from app.routers import history
from app.routers import simulate
from app.routers import scenario

settings = get_settings()

# Suitable for the hackathon prototype.
# Alembic migrations should be used later for production.
Base.metadata.create_all(bind=engine)


def _ensure_profile_user_column() -> None:
    """create_all never alters existing tables; add twin_profiles.user_id."""
    columns = {c["name"] for c in inspect(engine).get_columns("twin_profiles")}
    if "user_id" in columns:
        return
    with engine.begin() as connection:
        connection.execute(
            text("ALTER TABLE twin_profiles ADD COLUMN user_id INTEGER")
        )
        connection.execute(
            text(
                "CREATE UNIQUE INDEX IF NOT EXISTS ix_twin_profiles_user_id "
                "ON twin_profiles (user_id)"
            )
        )


_ensure_profile_user_column()

app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="Backend API for financial profiles and what-if simulations",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(history.router)
app.include_router(profile_router)
app.include_router(simulate.router)
app.include_router(scenario.router)

@app.get("/")
def root():
    return {
        "message": settings.app_name,
        "version": settings.app_version,
        "environment": settings.environment,
        "docs": "/docs",
    }


@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "service": "financial-digital-twin-api",
        "environment": settings.environment,
    }