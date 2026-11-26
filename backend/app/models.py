from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator


class ChatMessage(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role: Literal["user", "assistant"]
    content: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=20_000)]


class ChatRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    messages: Annotated[list[ChatMessage], Field(min_length=1, max_length=100)]

    @model_validator(mode="after")
    def validate_turn_order(self) -> "ChatRequest":
        if self.messages[-1].role != "user":
            raise ValueError("messages must end with a user message")
        if any(left.role == right.role for left, right in zip(self.messages, self.messages[1:])):
            raise ValueError("messages must alternate between user and assistant")
        return self


class ChatResponse(BaseModel):
    reply: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]
