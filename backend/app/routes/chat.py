from fastapi import APIRouter, HTTPException

from app.models import ChatRequest, ChatResponse
from app.services.nvidia import ProviderError, generate_reply

router = APIRouter(prefix="/api", tags=["chat"])


@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest) -> ChatResponse:
    try:
        reply = await generate_reply(request.messages)
    except ProviderError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    return ChatResponse(reply=reply)
