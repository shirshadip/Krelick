import os
from typing import Any

import httpx

from app.models import ChatMessage

NVIDIA_CHAT_COMPLETIONS_URL = "https://integrate.api.nvidia.com/v1/chat/completions"
DEFAULT_NVIDIA_MODEL = "nvidia/llama-3.3-nemotron-super-49b-v1.5"


class ProviderError(Exception):
    """An upstream NVIDIA API error safe to report to the client."""

    def __init__(self, message: str, status_code: int = 502) -> None:
        super().__init__(message)
        self.status_code = status_code


SYSTEM_PROMPT = """You are Krelick AI, a helpful technical assistant. Help users understand and solve technical problems across software engineering, AI, cloud systems, and related fields. Be accurate, practical, and clear. Explain your reasoning in approachable language, use examples or code when they help, and say when you are uncertain rather than inventing facts."""


async def generate_reply(messages: list[ChatMessage]) -> str:
    api_key = os.getenv("NVIDIA_API_KEY", "").strip()
    if not api_key:
        raise ProviderError("The chat service is not configured: NVIDIA_API_KEY is missing.", 503)

    model = os.getenv("NVIDIA_MODEL", DEFAULT_NVIDIA_MODEL).strip()
    payload: dict[str, Any] = {
        "model": model or DEFAULT_NVIDIA_MODEL,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            *[message.model_dump() for message in messages],
        ],
        "temperature": 0.6,
        "top_p": 0.95,
        "max_tokens": 2048,
        "stream": False,
    }

    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(60.0, connect=10.0)) as client:
            response = await client.post(
                NVIDIA_CHAT_COMPLETIONS_URL,
                headers={"Authorization": f"Bearer {api_key}"},
                json=payload,
            )
    except httpx.TimeoutException as exc:
        raise ProviderError("The NVIDIA chat service timed out. Please try again.", 504) from exc
    except httpx.HTTPError as exc:
        raise ProviderError("Could not reach the NVIDIA chat service. Please try again.", 502) from exc

    if response.status_code in (401, 403):
        raise ProviderError("NVIDIA rejected the configured API credentials.", 502)
    if response.status_code == 402:
        raise ProviderError("The NVIDIA endpoint requires an active plan or available API credits.", 503)
    if response.status_code == 404:
        raise ProviderError("The configured NVIDIA model was not found. Check NVIDIA_MODEL.", 502)
    if response.status_code == 429:
        raise ProviderError("The NVIDIA chat service is busy. Please try again shortly.", 503)
    if response.is_error:
        raise ProviderError("The NVIDIA chat service returned an error. Please try again.", 502)

    try:
        body = response.json()
        reply = body["choices"][0]["message"]["content"]
    except (ValueError, KeyError, IndexError, TypeError) as exc:
        raise ProviderError("The NVIDIA chat service returned an invalid response.", 502) from exc

    if not isinstance(reply, str) or not reply.strip():
        raise ProviderError("The NVIDIA chat service returned an empty reply.", 502)
    return reply.strip()
