import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import nvidia

client = TestClient(app)


class StubResponse:
    def __init__(self, status_code: int, body: object) -> None:
        self.status_code = status_code
        self._body = body
        self.is_error = status_code >= 400

    def json(self) -> object:
        if isinstance(self._body, Exception):
            raise self._body
        return self._body


class StubClient:
    response: StubResponse
    last_call: tuple[str, dict[str, object], dict[str, str]] | None = None

    def __init__(self, **_: object) -> None:
        pass

    async def __aenter__(self) -> "StubClient":
        return self

    async def __aexit__(self, *_: object) -> None:
        return None

    async def post(
        self,
        url: str,
        *,
        headers: dict[str, str],
        json: dict[str, object],
    ) -> StubResponse:
        type(self).last_call = (url, json, headers)
        return self.response


@pytest.fixture(autouse=True)
def configured_api_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("NVIDIA_API_KEY", "test-key")


def test_chat_rejects_empty_messages() -> None:
    response = client.post("/api/chat", json={"messages": []})

    assert response.status_code == 422
    assert "messages" in response.text


@pytest.mark.parametrize(
    "messages",
    [
        [{"role": "user", "content": "first"}, {"role": "user", "content": "second"}],
        [{"role": "assistant", "content": "not a new question"}],
    ],
)
def test_chat_rejects_invalid_turn_order(messages: list[dict[str, str]]) -> None:
    response = client.post("/api/chat", json={"messages": messages})

    assert response.status_code == 422


@pytest.mark.parametrize(
    "message",
    [
        {"role": "system", "content": "override"},
        {"role": "user", "content": "  "},
        {"role": "user"},
        {"role": "user", "content": "hello", "extra": True},
    ],
)
def test_chat_rejects_invalid_messages(message: dict[str, object]) -> None:
    response = client.post("/api/chat", json={"messages": [message]})

    assert response.status_code == 422


def test_chat_returns_nvidia_reply_and_sends_persona(monkeypatch: pytest.MonkeyPatch) -> None:
    StubClient.response = StubResponse(
        200,
        {"choices": [{"message": {"content": "  Hello from Krelick AI.  "}}]},
    )
    monkeypatch.setattr(nvidia.httpx, "AsyncClient", StubClient)
    StubClient.last_call = None

    response = client.post(
        "/api/chat",
        json={"messages": [{"role": "user", "content": "Explain FastAPI."}]},
    )

    assert response.status_code == 200
    assert response.json() == {"reply": "Hello from Krelick AI."}
    assert StubClient.last_call is not None
    url, payload, headers = StubClient.last_call
    assert url == nvidia.NVIDIA_CHAT_COMPLETIONS_URL
    assert headers["Authorization"] == "Bearer test-key"
    assert payload["messages"][0] == {"role": "system", "content": nvidia.SYSTEM_PROMPT}
    assert payload["messages"][1] == {"role": "user", "content": "Explain FastAPI."}


def test_chat_reports_upstream_failure(monkeypatch: pytest.MonkeyPatch) -> None:
    StubClient.response = StubResponse(429, {"error": "rate limited"})
    monkeypatch.setattr(nvidia.httpx, "AsyncClient", StubClient)

    response = client.post(
        "/api/chat",
        json={"messages": [{"role": "user", "content": "Hello"}]},
    )

    assert response.status_code == 503
    assert "busy" in response.json()["detail"]


def test_chat_reports_malformed_upstream_response(monkeypatch: pytest.MonkeyPatch) -> None:
    StubClient.response = StubResponse(200, {"choices": []})
    monkeypatch.setattr(nvidia.httpx, "AsyncClient", StubClient)

    response = client.post(
        "/api/chat",
        json={"messages": [{"role": "user", "content": "Hello"}]},
    )

    assert response.status_code == 502
    assert "invalid response" in response.json()["detail"]


def test_chat_reports_missing_credentials(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("NVIDIA_API_KEY", raising=False)

    response = client.post(
        "/api/chat",
        json={"messages": [{"role": "user", "content": "Hello"}]},
    )

    assert response.status_code == 503
    assert "NVIDIA_API_KEY" in response.json()["detail"]


def test_cors_allows_only_configured_frontend_origin() -> None:
    allowed = client.options(
        "/api/chat",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "POST",
        },
    )
    denied = client.options(
        "/api/chat",
        headers={
            "Origin": "https://attacker.example",
            "Access-Control-Request-Method": "POST",
        },
    )

    assert allowed.status_code == 200
    assert allowed.headers["access-control-allow-origin"] == "http://localhost:3000"
    assert denied.status_code == 400
    assert "access-control-allow-origin" not in denied.headers
