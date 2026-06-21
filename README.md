# AI Proxy

A single entry point for multiple AI providers. Point any OpenAI- or Anthropic-compatible client at the proxy, and it routes your requests through whichever upstream provider has the model you asked for — all behind one virtual API key.

## What it does

- **Multi-provider routing** — register one or more upstream providers (OpenAI, Anthropic, or any OpenAI-compatible endpoint). The proxy auto-selects the first provider that has the model you requested, or you can pin a specific one with a header.
- **Virtual API keys** — create named keys via the web UI. Each key acts as a single authentication token for all proxy endpoints, so clients never need to know about individual provider keys.
- **OpenAI & Anthropic API formats** — the proxy exposes both `/api/proxy/openai/v1/` and `/api/proxy/anthropic/v1/` paths, so clients using either format work out of the box.
- **Model caching** — upstream model lists are cached per provider to reduce API chatter. Bypass the cache with `Cache-Control: no-cache` or `?refresh=1`.
- **Wake-on-LAN** — optionally send a WOL packet to boot a provider machine before making requests, with configurable retry logic.
- **Dashboard & stats** — built-in dashboard showing request counts, token usage, costs, per-provider/model breakdowns, and a live request timeline.
- **SQLite persistence** — all configuration and logs are stored in a single SQLite file for easy portability and backup.

## Quick start

```bash
npm install
npm run dev
```

Open http://localhost:5173, add a provider and a virtual key, then start making requests.

## Run with Docker

```bash
docker run --rm \
  -p 3000:3000 \
  -v $(pwd)/data:/app/data \
  ghcr.io/kellojo/ai-proxy:latest
```

On Windows PowerShell:

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

Then open http://localhost:3000.

## Proxy usage

### OpenAI-compatible

```bash
curl -X POST http://localhost:3000/api/proxy/openai/v1/chat/completions \
  -H "Authorization: Bearer vk_xxx" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"hello"}]}'
```

### Anthropic-compatible

```bash
curl -X POST http://localhost:3000/api/proxy/anthropic/v1/messages \
  -H "Authorization: Bearer vk_xxx" \
  -H "Content-Type: application/json" \
  -d '{"model":"claude-sonnet-4-6-20250514","max_tokens":1024,"messages":[{"role":"user","content":"hello"}]}'
```

### Provider selection

By default the proxy picks the first matching provider. To target a specific one:

```bash
-H "x-provider-id: <provider-id>"
```

### Using with Claude Code

```bash
export ANTHROPIC_API_BASE_URL=http://localhost:3000/api/proxy/anthropic/v1
export ANTHROPIC_API_KEY=vk_xxx
```

## Build container

```bash
docker build -t ai-proxy .
docker run --rm -p 3000:3000 -v ${PWD}/data:/app/data ai-proxy
```

## Configuration

| Variable | Default | Description |
|---|---|---|
| `DATABASE_PATH` | — | Custom path for SQLite DB file |
| `PORT` | — | Listen port in container/runtime |
| `WOL_BOOT_WAIT_MS` | `20000` | Wait after WOL before first upstream attempt |
| `WOL_RETRY_ATTEMPTS` | `8` | Retry count while provider is booting |
| `WOL_RETRY_INTERVAL_MS` | `3000` | Delay between startup retries |
| `WOL_PACKET_BURST` | `3` | WOL magic packets per wake request |
| `WOL_BURST_INTERVAL_MS` | `120` | Delay between burst packets |
