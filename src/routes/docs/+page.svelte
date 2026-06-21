<script lang="ts">
  export let data: { baseUrl: string };
</script>

<main>
  <div class="stack" style="margin-bottom: 1rem;">
    <h1>Getting Started</h1>
    <p class="muted">
      Set up the proxy, configure a client, and start making requests.
    </p>
    <div class="notice">
      Base URL: <code>{data.baseUrl}</code>
    </div>
  </div>

  <div class="grid">

    <!-- Setup Steps -->
    <section class="card span-12 stack">
      <h2>Setup</h2>
      <ol
        class="muted"
        style="margin: 0; padding-left: 1.15rem; display: grid; gap: 0.45rem;"
      >
        <li>
          <strong>Add a provider</strong> — go to
          <a href="/providers">Providers</a> and register at least one upstream
          API (OpenAI, Anthropic, or another compatible endpoint).
        </li>
        <li>
          <strong>Create a virtual key</strong> — go to
          <a href="/virtual-keys">Virtual Keys</a> and generate a key for your
          client.
        </li>
        <li>
          <strong>Use the key</strong> — pass it as
          <code>Authorization: Bearer vk_...</code> on any proxy endpoint.
        </li>
      </ol>
    </section>

    <!-- Claude Code -->
    <section class="card span-12 stack">
      <h2>Claude Code</h2>
      <p class="muted">
        Point Claude Code at the proxy so all its API traffic routes through
        this instance. The proxy supports both the OpenAI and Anthropic API
        formats.
      </p>

      <h3>OpenAI-Compatible Mode</h3>
      <p class="muted">
        Set the <code>ANTHROPIC_API_BASE_URL</code> (or your provider's base
        URL) to the proxy, and use the virtual key as the API key:
      </p>
      <pre><code># Environment variables for Claude Code
ANTHROPIC_API_BASE_URL={data.baseUrl}/api/proxy/openai/v1
ANTHROPIC_API_KEY=vk_your_virtual_key</code></pre>

      <h3>Anthropic-Compatible Mode</h3>
      <p class="muted">
        If the upstream provider supports Anthropic's Messages API format, use
        the Anthropic proxy path instead:
      </p>
      <pre><code>ANTHROPIC_API_BASE_URL={data.baseUrl}/api/proxy/anthropic/v1
ANTHROPIC_API_KEY=vk_your_virtual_key</code></pre>

      <h3>Provider Selection</h3>
      <p class="muted">
        By default the proxy auto-selects the first matching provider. To
        target a specific provider, add the <code>x-provider-id</code> header
        via your client's custom-header mechanism, or set it as a static header
        in the provider config.
      </p>
    </section>

    <!-- API Usage -->
    <section class="card span-12 stack">
      <h2>API Usage</h2>

      <h3>Proxy Endpoints</h3>
      <p class="muted">
        All proxy endpoints require a virtual key bearer token.
      </p>
      <pre><code>Authorization: Bearer vk_your_virtual_key</code></pre>
      <p class="muted">Optional header to route to a specific provider:</p>
      <pre><code>x-provider-id: PROVIDER_ID</code></pre>

      <h3>Endpoint Map</h3>
      <div class="table-wrap">
        <table class="logs-table">
          <thead>
            <tr>
              <th>Method</th>
              <th>Path</th>
              <th>Purpose</th>
            </tr>
          </thead>
          <tbody>
            <!-- Management -->
            <tr>
              <td>GET</td>
              <td><code>/api/providers</code></td>
              <td>List providers</td>
            </tr>
            <tr>
              <td>POST</td>
              <td><code>/api/providers</code></td>
              <td>Create provider</td>
            </tr>
            <tr>
              <td>GET</td>
              <td><code>/api/providers/[id]</code></td>
              <td>Get a provider</td>
            </tr>
            <tr>
              <td>PUT</td>
              <td><code>/api/providers/[id]</code></td>
              <td>Update a provider</td>
            </tr>
            <tr>
              <td>DELETE</td>
              <td><code>/api/providers/[id]</code></td>
              <td>Delete a provider</td>
            </tr>
            <tr>
              <td>GET</td>
              <td><code>/api/virtual-keys</code></td>
              <td>List virtual keys</td>
            </tr>
            <tr>
              <td>POST</td>
              <td><code>/api/virtual-keys</code></td>
              <td>Create virtual key</td>
            </tr>
            <tr>
              <td>PUT</td>
              <td><code>/api/virtual-keys/[id]</code></td>
              <td>Update a virtual key</td>
            </tr>
            <tr>
              <td>DELETE</td>
              <td><code>/api/virtual-keys/[id]</code></td>
              <td>Delete a virtual key</td>
            </tr>
            <tr>
              <td>POST</td>
              <td><code>/api/virtual-keys/[id]/reroll</code></td>
              <td>Regenerate a virtual key</td>
            </tr>
            <!-- Proxy -->
            <tr>
              <td>POST</td>
              <td><code>/api/proxy/openai/v1/chat/completions</code></td>
              <td>OpenAI chat completions</td>
            </tr>
            <tr>
              <td>GET</td>
              <td><code>/api/proxy/openai/v1/models</code></td>
              <td>List models (OpenAI format)</td>
            </tr>
            <tr>
              <td>POST</td>
              <td><code>/api/proxy/anthropic/v1/messages</code></td>
              <td>Anthropic Messages API</td>
            </tr>
            <tr>
              <td>GET</td>
              <td><code>/api/proxy/anthropic/v1/models</code></td>
              <td>List models (Anthropic format)</td>
            </tr>
            <!-- Stats -->
            <tr>
              <td>GET</td>
              <td><code>/api/stats</code></td>
              <td>Dashboard statistics and logs</td>
            </tr>
            <tr>
              <td>GET</td>
              <td><code>/api/providers/models-cache</code></td>
              <td>View model cache per provider</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- Examples -->
    <section class="card span-12 stack">
      <h2>Examples</h2>

      <h3>Create a Provider</h3>
      <pre><code
          >curl -X POST {data.baseUrl}/api/providers \
  -H "Content-Type: application/json" \
  -d '&#123;
    "name": "OpenAI",
    "kind": "openai",
    "endpointUrl": "https://api.openai.com",
    "apiKey": "sk-...",
    "isDefault": true,
    "wolEnabled": false
  &#125;'</code
        ></pre>

      <h3>Create a Virtual Key</h3>
      <pre><code
          >curl -X POST {data.baseUrl}/api/virtual-keys \
  -H "Content-Type: application/json" \
  -d '&#123;"name":"My Client"&#125;'</code
        ></pre>

      <h3>List Models</h3>
      <pre><code
          >curl {data.baseUrl}/api/proxy/openai/v1/models \
  -H "Authorization: Bearer vk_your_virtual_key"</code
        ></pre>

      <h3>Chat Completion (OpenAI Format)</h3>
      <pre><code
          >curl -X POST {data.baseUrl}/api/proxy/openai/v1/chat/completions \
  -H "Authorization: Bearer vk_your_virtual_key" \
  -H "Content-Type: application/json" \
  -d '&#123;
    "model": "gpt-4o-mini",
    "messages": [&#123;"role":"user","content":"Hello!"&#125;]
  &#125;'</code
        ></pre>

      <h3>Messages API (Anthropic Format)</h3>
      <pre><code
          >curl -X POST {data.baseUrl}/api/proxy/anthropic/v1/messages \
  -H "Authorization: Bearer vk_your_virtual_key" \
  -H "Content-Type: application/json" \
  -d '&#123;
    "model": "claude-sonnet-4-6-20250514",
    "max_tokens": 1024,
    "messages": [&#123;"role":"user","content":"Hello!"&#125;]
  &#125;'</code
        ></pre>

      <h3>Streaming</h3>
      <pre><code
          >curl -N -X POST {data.baseUrl}/api/proxy/openai/v1/chat/completions \
  -H "Authorization: Bearer vk_your_virtual_key" \
  -H "Content-Type: application/json" \
  -d '&#123;
    "model": "gpt-4o-mini",
    "stream": true,
    "messages": [&#123;"role":"user","content":"Stream a response"&#125;]
  &#125;'</code
        ></pre>
    </section>

    <!-- Response Notes -->
    <section class="card span-12 stack">
      <h2>Response Notes</h2>
      <ul
        class="muted"
        style="margin: 0; padding-left: 1.15rem; display: grid; gap: 0.4rem;"
      >
        <li><code>401</code>: missing or invalid virtual key.</li>
        <li><code>400</code>: no provider configured or invalid payload.</li>
        <li><code>502</code>: upstream provider call failed.</li>
      </ul>
      <p class="muted" style="margin-top: 0.5rem;">
        To bypass the model cache on any request, add
        <code>Cache-Control: no-cache</code> or append <code>?refresh=1</code>
        to the URL.
      </p>
    </section>
  </div>
</main>
