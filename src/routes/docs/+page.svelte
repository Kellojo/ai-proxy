<script lang="ts">
  import Icon from "$lib/svelte-components/Icon.svelte";

  export let data: { baseUrl: string };

  let activeTab = "opencode";
  let copiedTab: Record<string, boolean> = {};

  const tabs = [
    { id: "opencode", label: "OpenCode" },
    { id: "claude", label: "Claude Code" },
    { id: "api", label: "API" },
  ];

  function copyToClipboard(text: string, tabId: string) {
    navigator.clipboard.writeText(text).then(() => {
      copiedTab = { ...copiedTab, [tabId]: true };
      setTimeout(() => (copiedTab = { ...copiedTab, [tabId]: false }), 1500);
    });
  }

  const opencodeConfig = `{
  "$schema": "https://opencode.ai/config.json",
  "disabled_providers": ["openai", "opencode", "lmstudio"],
  "provider": {
    "proxy": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "AI Proxy",
      "options": {
        "baseURL": "${data.baseUrl}/api/proxy/openai/v1",
        "apiKey": "vk_your_virtual_key"
      },
      "models": {
        "gpt-4o-mini": {
          "name": "GPT 4o Mini"
        }
      }
    }
  }
}`;

  const claudeCodeConfig = `# Environment variables for Claude Code
ANTHROPIC_API_BASE_URL=${data.baseUrl}/api/proxy/openai/v1
ANTHROPIC_API_KEY=vk_your_virtual_key`;

  const apiExample = `curl -X POST ${data.baseUrl}/api/proxy/openai/v1/chat/completions \\
  -H "Authorization: Bearer vk_your_virtual_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-4o-mini",
    "messages": [{"role":"user","content":"Hello!"}]
  }'`;

  const apiHeaders = `# Required headers for all proxy endpoints
Authorization: Bearer vk_your_virtual_key
Content-Type: application/json

# Optional header to target a specific provider
x-provider-id: PROVIDER_ID`;
</script>

<main>
  <div class="stack" style="margin-bottom: 1rem;">
    <h1>Getting Started</h1>
    <p class="muted">
      Set up the proxy, configure a client, and start making requests.
    </p>
  </div>

  <!-- Quick Config Tabs -->
  <section
    class="span-12"
    style="display:flex;flex-direction:column;gap:1rem;margin-bottom:1.5rem"
  >
    <div class="tab-group">
      {#each tabs as tab}
        <button
          type="button"
          class="tab-btn {activeTab === tab.id ? 'active' : ''}"
          on:click={() => (activeTab = tab.id)}
        >
          {tab.label}
        </button>
      {/each}
    </div>

    <div class="tab-panel">
      {#if activeTab === "opencode"}
        <div class="code-block">
          <button
            type="button"
            class="copy-btn"
            on:click={() => copyToClipboard(opencodeConfig, "opencode")}
          >
            {#if copiedTab["opencode"]}
              <span>
                <Icon icon="tabler:check" /> Copied!
              </span>
            {:else}
              <span>
                <Icon icon="tabler:copy" /> Copy
              </span>
            {/if}
          </button>
          <pre><code>{opencodeConfig}</code></pre>
        </div>
      {:else if activeTab === "claude"}
        <div class="code-block">
          <button
            type="button"
            class="copy-btn"
            on:click={() => copyToClipboard(claudeCodeConfig, "claude")}
          >
            {#if copiedTab["claude"]}
              <span>
                <Icon icon="tabler:check" /> Copied!
              </span>
            {:else}
              <span>
                <Icon icon="tabler:copy" /> Copy
              </span>
            {/if}
          </button>
          <pre><code>{claudeCodeConfig}</code></pre>
        </div>
      {:else if activeTab === "api"}
        <div class="code-block">
          <button
            type="button"
            class="copy-btn"
            on:click={() => copyToClipboard(apiExample, "api")}
          >
            {#if copiedTab["api"]}
              <span>
                <Icon icon="tabler:check" /> Copied!
              </span>
            {:else}
              <span>
                <Icon icon="tabler:copy" /> Copy
              </span>
            {/if}
          </button>
          <pre><code>{apiExample}</code></pre>
        </div>
      {/if}
    </div>

    <div class="tab-panel" style="margin-top:0.5rem">
      {#if activeTab === "opencode"}
        <p class="muted">Add this to your opencode.json config file.</p>
      {:else if activeTab === "claude"}
        <p class="muted">
          Set these environment variables before launching Claude Code.
        </p>
      {:else if activeTab === "api"}
        <p class="muted">
          Use this as a template for your API calls. All proxy endpoints require
          a virtual key.
        </p>
      {/if}
    </div>
  </section>
</main>
