export type ChatRole = "user" | "assistant";

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
};

export type ApiMessage = Pick<ChatMessage, "role" | "content">;

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000").replace(/\/+$/, "");

export async function requestAssistantReply(messages: ApiMessage[]): Promise<string> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages }),
      cache: "no-store",
    });
  } catch {
    throw new Error("Could not connect to the chat service. Check that the backend is running and try again.");
  }

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const detail =
      typeof payload === "object" && payload !== null && "detail" in payload
        ? payload.detail
        : undefined;
    const message = typeof detail === "string"
      ? detail
      : `The chat request failed (${response.status}). Please try again.`;
    throw new Error(message);
  }

  if (
    typeof payload !== "object" ||
    payload === null ||
    !("reply" in payload) ||
    typeof payload.reply !== "string" ||
    payload.reply.trim().length === 0
  ) {
    throw new Error("The chat service returned an invalid response. Please try again.");
  }

  return payload.reply.trim();
}

export function isChatMessage(value: unknown): value is ChatMessage {
  if (typeof value !== "object" || value === null) return false;
  if (!("id" in value) || !("role" in value) || !("content" in value) || !("createdAt" in value)) return false;
  return (
    typeof value.id === "string" &&
    (value.role === "user" || value.role === "assistant") &&
    typeof value.content === "string" &&
    typeof value.createdAt === "string"
  );
}

export function readStoredMessages(): ChatMessage[] {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem("krelick-chat-messages") ?? "null");
    if (!Array.isArray(value)) return [];
    return value.filter(isChatMessage);
  } catch {
    return [];
  }
}
