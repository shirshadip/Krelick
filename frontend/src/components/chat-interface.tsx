"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  AlertCircle,
  ArrowRight,
  ArrowUp,
  Check,
  Copy,
  MessageSquareText,
  Sparkles,
  Trash2,
  UserRound,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { readStoredMessages, requestAssistantReply, type ApiMessage, type ChatMessage } from "@/lib/chat";

const STORAGE_KEY = "krelick-chat-messages";
const WELCOME_TEXT = "Hi, I’m Krelick AI. I’m here to help with software, AI, cloud systems, and the technical ideas you’re working through.";
const SUGGESTIONS = [
  "Explain a technical concept in plain language",
  "Help me debug an issue in my code",
  "Compare two tools or approaches",
  "Help me plan a project step by step",
];

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function makeId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function MessageContent({ message }: { message: ChatMessage }) {
  if (message.role === "user") {
    return <div className="message-bubble message-bubble--user">{message.content}</div>;
  }

  return (
    <div className="message-bubble">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          table: ({ children }) => (
            <div className="markdown-table-wrap">
              <table>{children}</table>
            </div>
          ),
        }}
      >
        {message.content}
      </ReactMarkdown>
    </div>
  );
}

function MessageItem({ message, timeOverride }: { message: ChatMessage; timeOverride?: string }) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const isUser = message.role === "user";
  const timestamp = timeOverride ?? formatTime(message.createdAt);

  const copyMessage = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setCopyError(false);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopyError(true);
      window.setTimeout(() => setCopyError(false), 2800);
    }
  };

  return (
    <article className={`message-row${isUser ? " message-row--user" : ""}`}>
      <div className={`message-avatar${isUser ? " message-avatar--user" : ""}`} aria-hidden="true">
        {isUser ? <UserRound size={16} strokeWidth={1.8} /> : <Sparkles size={16} strokeWidth={1.8} />}
      </div>
      <div className="message-content">
        <div className="message-meta">
          <span className="message-author">{isUser ? "You" : "Krelick AI"}</span>
          <span className="message-meta-separator" aria-hidden="true" />
          <time dateTime={message.createdAt || undefined}>{timestamp}</time>
          <Button
            variant="ghost"
            size="sm"
            className="copy-button"
            onClick={copyMessage}
            aria-label={`Copy ${isUser ? "your" : "assistant"} message`}
            title="Copy message"
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
            <span>{copied ? "Copied" : copyError ? "Unavailable" : "Copy"}</span>
          </Button>
        </div>
        <MessageContent message={message} />
        <span className="sr-only" role="status">
          {copied ? "Message copied to clipboard." : copyError ? "Clipboard access is unavailable." : ""}
        </span>
      </div>
    </article>
  );
}

function Welcome({ onSuggestion, greetingTime }: { onSuggestion: (value: string) => void; greetingTime: string }) {
  const greeting: ChatMessage = {
    id: "welcome",
    role: "assistant",
    content: WELCOME_TEXT,
    createdAt: "",
  };

  return (
    <section className="welcome" aria-label="Welcome to Krelick AI">
      <MessageItem message={greeting} timeOverride={greetingTime} />
      <p className="welcome-eyebrow"><Sparkles size={13} /> Your technical thinking partner</p>
      <h2>What can I help you solve?</h2>
      <p className="welcome-copy">
        Ask a question, work through a tricky problem, or explore an idea. I’ll keep things clear, useful, and grounded.
      </p>
      <div className="suggestions" aria-label="Suggested prompts">
        {SUGGESTIONS.map((suggestion) => (
          <Button
            key={suggestion}
            variant="outline"
            className="suggestion-card"
            onClick={() => onSuggestion(suggestion)}
          >
            <span>{suggestion}</span>
            <ArrowRight className="suggestion-arrow" size={14} aria-hidden="true" />
          </Button>
        ))}
      </div>
    </section>
  );
}

function TypingIndicator() {
  return (
    <article className="message-row" aria-label="Krelick AI is typing" role="status">
      <div className="message-avatar" aria-hidden="true"><Sparkles size={16} strokeWidth={1.8} /></div>
      <div className="message-content">
        <div className="message-meta"><span className="message-author">Krelick AI</span></div>
        <div className="message-bubble typing-bubble" aria-hidden="true">
          <span className="typing-dot" /><span className="typing-dot" /><span className="typing-dot" />
        </div>
      </div>
    </article>
  );
}

export default function ChatInterface() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [isHydrated, setIsHydrated] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [greetingTime, setGreetingTime] = useState("Now");
  const conversationRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const requestInFlight = useRef(false);

  useEffect(() => {
    const loadTimer = window.setTimeout(() => {
      setMessages(readStoredMessages());
      setGreetingTime(formatTime(new Date().toISOString()));
      setIsHydrated(true);
    }, 0);
    return () => window.clearTimeout(loadTimer);
  }, []);

  useEffect(() => {
    if (!isHydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch { /* Storage may be unavailable in private or restricted browsing modes. */ }
  }, [isHydrated, messages]);

  useEffect(() => {
    if (!isHydrated) return;
    conversationRef.current?.scrollTo({
      top: conversationRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [isHydrated, isLoading, messages]);

  const submitMessage = useCallback(async () => {
    const content = draft.trim();
    if (!isHydrated || !content || requestInFlight.current) return;

    requestInFlight.current = true;
    setIsLoading(true);
    setError(null);
    setDraft("");

    const userMessage: ChatMessage = {
      id: makeId(),
      role: "user",
      content,
      createdAt: new Date().toISOString(),
    };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);

    try {
      const lastAssistantIndex = nextMessages.findLastIndex((message) => message.role === "assistant");
      let resolvedHistory = nextMessages.slice(0, lastAssistantIndex + 1).slice(-99);
      if (resolvedHistory[0]?.role === "assistant") resolvedHistory = resolvedHistory.slice(1);
      const requestMessages: ApiMessage[] = [...resolvedHistory, userMessage].map(({ role, content: messageContent }) => ({
        role,
        content: messageContent,
      }));
      const reply = await requestAssistantReply(requestMessages);
      setMessages((current) => [
        ...current,
        {
          id: makeId(),
          role: "assistant",
          content: reply,
          createdAt: new Date().toISOString(),
        },
      ]);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Something went wrong. Please try again.");
    } finally {
      requestInFlight.current = false;
      setIsLoading(false);
    }
  }, [draft, isHydrated, messages]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void submitMessage();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void submitMessage();
    }
  };

  const clearConversation = () => {
    if (!messages.length || isLoading) return;
    const shouldClear = window.confirm("Clear this conversation? Messages stored in this browser will be deleted.");
    if (!shouldClear) return;
    setMessages([]);
    setError(null);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      setError("The conversation was cleared from this view, but browser storage could not be updated.");
    }
  };

  const chooseSuggestion = (suggestion: string) => {
    setDraft(suggestion);
    inputRef.current?.focus();
  };

  return (
    <main className="chat-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true"><Sparkles size={19} strokeWidth={1.7} /></div>
          <span className="brand-wordmark">Krelick</span>
          <Separator orientation="vertical" aria-hidden="true" className="header-separator" />
          <div className="header-title">
            <h1>Krelick AI</h1>
            <p>Your clear, capable technical assistant</p>
          </div>
        </div>
        <div className="header-actions">
          <Badge variant="outline" className="model-pill"><span className="model-pill-dot" /> NVIDIA API</Badge>
          <Button
            variant="ghost"
            size="icon"
            className="clear-button"
            onClick={clearConversation}
            disabled={!messages.length || isLoading}
            aria-label="Clear conversation"
            title="Clear conversation"
          >
            <Trash2 size={15} aria-hidden="true" />
            <span className="clear-label">Clear</span>
          </Button>
        </div>
      </header>

      <div className="conversation" ref={conversationRef} aria-label="Chat conversation">
        <div className="conversation-inner">
          {messages.length === 0 ? (
            <Welcome onSuggestion={chooseSuggestion} greetingTime={greetingTime} />
          ) : (
            <div className="message-list" role="log" aria-label="Conversation messages" aria-relevant="additions">
              {messages.map((message) => <MessageItem key={message.id} message={message} />)}
              {isLoading && <TypingIndicator />}
            </div>
          )}
          {error && (
            <div className="error-banner" role="alert">
              <AlertCircle size={15} aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}
        </div>
      </div>

      <div className="composer-wrap">
        <Card className="composer">
          <form onSubmit={handleSubmit}>
            <label htmlFor="chat-message" className="sr-only">Message Krelick AI</label>
            <Textarea
              id="chat-message"
              ref={inputRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask a question or share what you’re working on…"
              rows={2}
              maxLength={20_000}
              aria-describedby="composer-hint"
              autoComplete="off"
            />
            <div className="composer-tools">
              <span className="composer-hint" id="composer-hint">
                <MessageSquareText size={12} aria-hidden="true" />
                <span><kbd>Enter</kbd> to send · <kbd>Shift + Enter</kbd> for a new line</span>
              </span>
              <Button
                type="submit"
                className="send-button"
                disabled={!isHydrated || isLoading || !draft.trim()}
                aria-label="Send message"
              >
                <span>{isLoading ? "Thinking" : "Send"}</span>
                <ArrowUp size={15} aria-hidden="true" />
              </Button>
            </div>
          </form>
        </Card>
        <p className="composer-footer">Krelick AI can make mistakes. Review important information.</p>
      </div>
    </main>
  );
}
