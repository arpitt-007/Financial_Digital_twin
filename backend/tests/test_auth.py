import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import models  # noqa: F401
from app.database import Base, get_db
from app.routers import auth, history, profile, simulate

PROFILE = {
    "monthly_income": 100000,
    "monthly_expenses": 40000,
    "cash_savings": 200000,
    "investments": 300000,
    "monthly_investment": 10000,
    "existing_debt": 0,
    "debt_interest_rate": 0,
    "monthly_debt_payment": 0,
    "financial_goal": 1000000,
}


@pytest.fixture()
def client():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, expire_on_commit=False)

    def override_db():
        db = Session()
        try:
            yield db
        finally:
            db.close()

    app = FastAPI()
    for module in (auth, history, simulate):
        app.include_router(module.router)
    app.include_router(profile.router)
    app.dependency_overrides[get_db] = override_db
    return TestClient(app)


def signup(client, email="a@example.com", name="Ana", password="password123"):
    response = client.post(
        "/auth/signup",
        json={"email": email, "name": name, "password": password},
    )
    return response


def headers(token):
    return {"Authorization": f"Bearer {token}"}


def test_signup_returns_token_and_user(client):
    response = signup(client)
    assert response.status_code == 201
    body = response.json()
    assert body["user"]["email"] == "a@example.com"
    assert body["user"]["name"] == "Ana"
    assert "password" not in body["user"]
    assert body["access_token"]


def test_duplicate_email_rejected_case_insensitively(client):
    assert signup(client).status_code == 201
    assert signup(client, email="A@Example.com").status_code == 409


def test_short_password_rejected(client):
    assert signup(client, password="short").status_code == 422


def test_login_success_and_failures(client):
    signup(client)
    ok = client.post(
        "/auth/login", json={"email": "a@example.com", "password": "password123"}
    )
    assert ok.status_code == 200
    assert ok.json()["access_token"]

    wrong_password = client.post(
        "/auth/login", json={"email": "a@example.com", "password": "nope-nope"}
    )
    unknown_user = client.post(
        "/auth/login", json={"email": "x@example.com", "password": "password123"}
    )
    assert wrong_password.status_code == unknown_user.status_code == 401
    assert wrong_password.json() == unknown_user.json()


def test_me_requires_valid_token(client):
    assert client.get("/auth/me").status_code == 401
    assert client.get("/auth/me", headers=headers("garbage")).status_code == 401

    token = signup(client).json()["access_token"]
    me = client.get("/auth/me", headers=headers(token))
    assert me.status_code == 200
    assert me.json()["email"] == "a@example.com"


def test_profile_requires_auth(client):
    assert client.get("/profile").status_code == 401
    assert client.put("/profile", json=PROFILE).status_code == 401
    assert client.post("/simulate", json={}).status_code == 401


def test_profiles_are_isolated_between_users(client):
    token_a = signup(client, email="a@example.com").json()["access_token"]
    token_b = signup(client, email="b@example.com", name="Bo").json()["access_token"]

    assert client.get("/profile", headers=headers(token_a)).status_code == 404

    put = client.put("/profile", json=PROFILE, headers=headers(token_a))
    assert put.status_code == 200

    assert client.get("/profile", headers=headers(token_a)).json()["monthly_income"] == 100000
    assert client.get("/profile", headers=headers(token_b)).status_code == 404

    other = dict(PROFILE, monthly_income=55000)
    client.put("/profile", json=other, headers=headers(token_b))
    assert client.get("/profile", headers=headers(token_a)).json()["monthly_income"] == 100000
    assert client.get("/profile", headers=headers(token_b)).json()["monthly_income"] == 55000


def test_simulate_uses_callers_profile(client):
    token = signup(client).json()["access_token"]
    assert client.post("/simulate", json={}, headers=headers(token)).status_code == 404

    client.put("/profile", json=PROFILE, headers=headers(token))
    response = client.post("/simulate", json={}, headers=headers(token))
    assert response.status_code == 200
    assert response.json()["baseline"]["timeline"]


def test_history_crud_and_isolation(client):
    token_a = signup(client, email="a@example.com").json()["access_token"]
    token_b = signup(client, email="b@example.com").json()["access_token"]

    entry = {
        "scenario_key": "loan",
        "title": "Loan",
        "meta": {"title": "Loan"},
        "response": {"baseline": {}},
        "net_worth_difference": -1234.5,
    }
    created = client.post("/history", json=entry, headers=headers(token_a))
    assert created.status_code == 201
    record_id = created.json()["id"]

    listed = client.get("/history", headers=headers(token_a)).json()
    assert [r["id"] for r in listed] == [record_id]
    assert listed[0]["response"] == {"baseline": {}}

    assert client.get("/history", headers=headers(token_b)).json() == []
    assert (
        client.delete(f"/history/{record_id}", headers=headers(token_b)).status_code
        == 404
    )

    assert (
        client.delete(f"/history/{record_id}", headers=headers(token_a)).status_code
        == 204
    )
    assert client.get("/history", headers=headers(token_a)).json() == []
