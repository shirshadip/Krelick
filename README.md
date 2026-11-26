# Krelick

Krelick is a responsive AI chat application with a Next.js and TypeScript frontend and an independent FastAPI backend. Chat history stays in the browser's local storage. The backend sends conversation messages to NVIDIA's OpenAI-compatible chat completions API; the NVIDIA key is only read by the backend.

## Requirements

- Bun (the frontend lockfile uses Bun)
- Python 3.10 or newer
- An NVIDIA API key for live assistant replies

## Configure and run the backend

In a terminal:

```powershell
cd backend
py -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item .env.example .env
```

Put your NVIDIA API key in `backend/.env`. `NVIDIA_MODEL` defaults to `nvidia/llama-3.3-nemotron-super-49b-v1.5`. `FRONTEND_ORIGIN` defaults to `http://localhost:3000` and sets the allowed browser origin for CORS.

Start the API from the `backend` directory:

```powershell
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

The chat endpoint is `POST http://localhost:8000/api/chat`. The API docs are available at `http://localhost:8000/docs` while the server is running.

For macOS or Linux, replace the environment setup commands with:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
cp .env.example .env
```

## Configure and run the frontend

In a second terminal:

```powershell
cd frontend
bun install
Copy-Item .env.example .env.local
bun run dev
```

Open [http://localhost:3000](http://localhost:3000). `NEXT_PUBLIC_API_BASE_URL` can point the frontend at a different backend URL; it contains no secret credentials.

## Checks

Run the backend API tests from the `backend` directory:

```powershell
python -m pytest
```

Run the frontend checks from the `frontend` directory:

```powershell
bun run lint
bun run build
```

## API contract

```json
{
  "messages": [
    { "role": "user", "content": "Explain async Python." }
  ]
}
```

Successful responses contain a `reply` string. Invalid input returns a validation error, and missing credentials or NVIDIA service failures return a meaningful HTTP error. The API does not return placeholder replies.
