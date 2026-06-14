# AI Proxy

Minimal SvelteKit + TypeScript proxy for multiple AI providers with virtual API keys and SQLite persistence.

## Features

- Multiple provider config (OpenAI, Anthropic, and generic OpenAI-like variants)
- Optional Wake-on-LAN for provider before each request
- Virtual key management in UI (create, update, delete, reroll)
- OpenAI-compatible proxy endpoint at `/api/proxy/openai/v1/chat/completions`
- Basic usage stats for providers, models, request timeline, status codes, token usage, and API-reported cost (when available)
- SQLite storage for easy portability

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:5173

## Run with published container image

You can run the latest published image directly from GHCR:

```bash
docker run --rm \
  -p 3000:3000 \
  -v $(pwd)/data:/app/data \
  ghcr.io/kellojo/ai-proxy:latest
```

Then open http://localhost:3000

On Windows PowerShell, use:

```powershell
docker run --rm `
  -p 3000:3000 `
  -v "${PWD}\data:/app/data" `
  ghcr.io/kellojo/ai-proxy:latest
```

Or with Compose:

```yaml
services:
  ai-proxy:
    image: ghcr.io/kellojo/ai-proxy:latest
    ports:
      - "3000:3000"
    volumes:
      - ./data:/app/data
    restart: unless-stopped
```

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
- `WOL_BOOT_WAIT_MS` (optional, default `20000`): wait time after sending WOL before first upstream attempt
- `WOL_RETRY_ATTEMPTS` (optional, default `8`): retry count while provider is still booting/unreachable
- `WOL_RETRY_INTERVAL_MS` (optional, default `3000`): delay between startup retries
- `WOL_PACKET_BURST` (optional, default `3`): number of WOL magic packets sent per wake request
- `WOL_BURST_INTERVAL_MS` (optional, default `120`): delay between burst packets
