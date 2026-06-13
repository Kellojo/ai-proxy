<main>
  <div class="stack" style="margin-bottom: 1rem;">
    <h1>API Documentation</h1>
    <p class="muted">
      How to use the proxy endpoints locally and from client apps.
    </p>
    <div class="notice">
      Base URL: <code>http://localhost:5173</code> in development.
    </div>
  </div>

  <div class="grid">
    <section class="card span-12 stack">
      <h2>Quick Start</h2>
      <ol
        class="muted"
        style="margin: 0; padding-left: 1.15rem; display: grid; gap: 0.45rem;"
      >
        <li>
          Create at least one provider in <a href="/providers">Providers</a>.
        </li>
        <li>
          Create a virtual key in <a href="/virtual-keys">Virtual Keys</a>.
        </li>
        <li>Use that key in <code>Authorization: Bearer vk_...</code>.</li>
        <li>
          Call OpenAI-compatible endpoints under <code
            >/api/proxy/openai/v1</code
          >.
        </li>
      </ol>
    </section>

    <section class="card span-12 stack">
      <h2>Auth</h2>
      <p class="muted">
        All proxy endpoints require a virtual key bearer token.
      </p>
      <pre><code>Authorization: Bearer vk_your_virtual_key</code></pre>
      <p class="muted">Optional: route request to a specific provider with:</p>
      <pre><code>x-provider-id: PROVIDER_ID</code></pre>
    </section>

    <section class="card span-12 stack">
      <h2>Endpoint Map</h2>
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
            <tr
              ><td>GET</td><td><code>/api/providers</code></td><td
                >List providers</td
              ></tr
            >
            <tr
              ><td>POST</td><td><code>/api/providers</code></td><td
                >Create provider</td
              ></tr
            >
            <tr
              ><td>GET</td><td><code>/api/virtual-keys</code></td><td
                >List virtual keys</td
              ></tr
            >
            <tr
              ><td>POST</td><td><code>/api/virtual-keys</code></td><td
                >Create virtual key</td
              ></tr
            >
            <tr
              ><td>GET</td><td><code>/api/proxy/openai/v1/models</code></td><td
                >List upstream models</td
              ></tr
            >
            <tr
              ><td>POST</td><td
                ><code>/api/proxy/openai/v1/chat/completions</code></td
              ><td>OpenAI-compatible chat completions</td></tr
            >
            <tr
              ><td>GET</td><td><code>/api/stats</code></td><td
                >Dashboard statistics and logs</td
              ></tr
            >
          </tbody>
        </table>
      </div>
    </section>

    <section class="card span-12 stack">
      <h2>Examples</h2>

      <h3>Create a Provider</h3>
      <pre><code
          >curl -X POST http://localhost:5173/api/providers \
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
          >curl -X POST http://localhost:5173/api/virtual-keys \
  -H "Content-Type: application/json" \
  -d '&#123;"name":"Local Client"&#125;'</code
        ></pre>

      <h3>List Models</h3>
      <pre><code
          >curl http://localhost:5173/api/proxy/openai/v1/models \
  -H "Authorization: Bearer vk_your_virtual_key"</code
        ></pre>

      <h3>Chat Completion</h3>
      <pre><code
          >curl -X POST http://localhost:5173/api/proxy/openai/v1/chat/completions \
  -H "Authorization: Bearer vk_your_virtual_key" \
  -H "Content-Type: application/json" \
  -d '&#123;
    "model": "gpt-4o-mini",
    "messages": [&#123;"role":"user","content":"Hello!"&#125;]
  &#125;'</code
        ></pre>

      <h3>Streaming Chat Completion</h3>
      <pre><code
          >curl -N -X POST http://localhost:5173/api/proxy/openai/v1/chat/completions \
  -H "Authorization: Bearer vk_your_virtual_key" \
  -H "Content-Type: application/json" \
  -d '&#123;
    "model": "gpt-4o-mini",
    "stream": true,
    "messages": [&#123;"role":"user","content":"Stream a response"&#125;]
  &#125;'</code
        ></pre>
    </section>

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
    </section>
  </div>
</main>
