# AI Proxy

Minimal SvelteKit + TypeScript proxy for multiple AI providers with virtual API keys and SQLite persistence.

## Features

- Multiple provider config (OpenAI, Anthropic, and generic OpenAI-like variants)
- Optional Wake-on-LAN for provider before each request
- Virtual key management in UI (create, update, delete, reroll)
- OpenAI-compatible proxy endpoint at `/api/proxy/openai/v1/chat/completions`
- Basic usage stats for providers, models, request timeline, and status codes
- SQLite storage for easy portability

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:5173

## Proxy usage

Use virtual key in bearer auth:

```bash
curl -X POST http://localhost:5173/api/proxy/openai/v1/chat/completions \
  -H "Authorization: Bearer vk_xxx" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"hello"}]}'
```

Optional provider selection header:

```bash
-H "x-provider-id: <provider-id>"
```

## Build container

```bash
docker build -t ai-proxy .
docker run --rm -p 3000:3000 -v ${PWD}/data:/app/data ai-proxy
```

Then open http://localhost:3000

## Configuration

- `DATABASE_PATH` (optional): custom path for SQLite DB file
- `PORT` (optional): listen port in container/runtime
