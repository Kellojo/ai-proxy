<script lang="ts">
  import { onMount } from "svelte";

  type Provider = {
    id: string;
    name: string;
    kind: "openai" | "anthropic" | "other";
    endpointUrl: string;
    isDefault: boolean;
  };

  type ModelItem = {
    id: string;
    object?: string;
    owned_by?: string;
  };

  let providers: Provider[] = [];
  let models: ModelItem[] = [];

  let selectedProviderId = "";
  let selectedModel = "";
  let virtualKey = "";
  let prompt = "Say hello in one short sentence.";

  let busyModels = false;
  let busyCacheRefresh = false;
  let busyChat = false;

  let infoMessage = "";
  let errorMessage = "";
  let responseText = "";
  let rawResponse = "";
  let lastStatus = "";

  function resetMessages() {
    infoMessage = "";
    errorMessage = "";
  }

  async function loadProviders() {
    resetMessages();

    const res = await fetch("/api/providers");
    const payload = await res.json();

    if (!res.ok) {
      errorMessage = payload?.error || "Failed to load providers";
      return;
    }

    providers = payload.providers || [];
    const defaultProvider = providers.find((provider) => provider.isDefault);
    selectedProviderId = defaultProvider?.id || providers[0]?.id || "";
  }

  async function fetchModels(options?: { bypassCache?: boolean }) {
    resetMessages();
    responseText = "";
    rawResponse = "";

    if (!virtualKey.trim()) {
      errorMessage = "Virtual key is required to load models.";
      return;
    }

    busyModels = true;

    try {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${virtualKey.trim()}`,
      };

      if (selectedProviderId) {
        headers["x-provider-id"] = selectedProviderId;
      }

      if (options?.bypassCache) {
        headers["cache-control"] = "no-cache";
        headers["x-refresh-cache"] = "1";
      }

      const res = await fetch("/api/proxy/openai/v1/models", {
        method: "GET",
        headers,
      });

      const payload = await res.json().catch(() => ({}));
      lastStatus = String(res.status);

      if (!res.ok) {
        errorMessage = payload?.error || "Failed to load models";
        rawResponse = JSON.stringify(payload, null, 2);
        return;
      }

      models = Array.isArray(payload?.data) ? payload.data : [];
      selectedModel = models[0]?.id || "";
      const fromCache = payload?.meta?.providersFromCache;
      infoMessage =
        typeof fromCache === "number"
          ? `Loaded ${models.length} model(s) (${fromCache} provider cache hit(s)).`
          : `Loaded ${models.length} model(s).`;
    } finally {
      busyModels = false;
    }
  }

  async function clearCacheAndRefreshModels() {
    resetMessages();
    responseText = "";
    rawResponse = "";

    if (!virtualKey.trim()) {
      errorMessage = "Virtual key is required to clear model cache.";
      return;
    }

    busyCacheRefresh = true;

    try {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${virtualKey.trim()}`,
      };

      if (selectedProviderId) {
        headers["x-provider-id"] = selectedProviderId;
      }

      const clearRes = await fetch("/api/proxy/openai/v1/models", {
        method: "DELETE",
        headers,
      });

      const clearPayload = await clearRes.json().catch(() => ({}));
      lastStatus = String(clearRes.status);

      if (!clearRes.ok) {
        errorMessage = clearPayload?.error || "Failed to clear model cache";
        rawResponse = JSON.stringify(clearPayload, null, 2);
        return;
      }

      await fetchModels({ bypassCache: true });
      infoMessage = selectedProviderId
        ? "Cleared provider model cache and reloaded models."
        : "Cleared model cache and reloaded models.";
    } finally {
      busyCacheRefresh = false;
    }
  }

  async function sendTestPrompt() {
    resetMessages();
    responseText = "";
    rawResponse = "";

    if (!virtualKey.trim()) {
      errorMessage = "Virtual key is required.";
      return;
    }

    if (!selectedModel.trim()) {
      errorMessage = "Pick a model first.";
      return;
    }

    if (!prompt.trim()) {
      errorMessage = "Prompt cannot be empty.";
      return;
    }

    busyChat = true;

    try {
      const headers: Record<string, string> = {
        "content-type": "application/json",
        Authorization: `Bearer ${virtualKey.trim()}`,
      };

      if (selectedProviderId) {
        headers["x-provider-id"] = selectedProviderId;
      }

      const res = await fetch("/api/proxy/openai/v1/chat/completions", {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: selectedModel,
          messages: [{ role: "user", content: prompt.trim() }],
          temperature: 0.2,
          max_tokens: 300,
        }),
      });

      const payload = await res.json().catch(() => ({}));
      lastStatus = String(res.status);
      rawResponse = JSON.stringify(payload, null, 2);

      if (!res.ok) {
        errorMessage = payload?.error || "Request failed";
        return;
      }

      const text = payload?.choices?.[0]?.message?.content;
      responseText =
        typeof text === "string" ? text : "(No assistant text found)";
      infoMessage = "Test request completed.";
    } finally {
      busyChat = false;
    }
  }

  function providerLabel(provider: Provider) {
    return `${provider.name} (${provider.kind})`;
  }

  onMount(loadProviders);
</script>

<main>
  <div class="stack" style="margin-bottom: 1rem;">
    <h1>Testing</h1>
    <p class="muted">Quickly test providers and models directly from the UI.</p>
  </div>

  <div class="test-grid">
    <section class="card stack">
      <h2>Request Setup</h2>

      <div>
        <label for="test-virtual-key">Virtual Key</label>
        <input
          id="test-virtual-key"
          type="password"
          bind:value={virtualKey}
          placeholder="vk_..."
        />
        <div class="field-help">Use an active key from Virtual Keys.</div>
      </div>

      <div>
        <label for="test-provider">Provider</label>
        <select id="test-provider" bind:value={selectedProviderId}>
          {#if providers.length === 0}
            <option value="">No provider configured</option>
          {:else}
            {#each providers as provider}
              <option value={provider.id}>{providerLabel(provider)}</option>
            {/each}
          {/if}
        </select>
      </div>

      <div class="test-actions">
        <button
          class="alt"
          on:click|preventDefault={fetchModels}
          disabled={busyModels || busyCacheRefresh || providers.length === 0}
        >
          {busyModels ? "Loading models..." : "Load Models"}
        </button>
        <button
          class="alt"
          on:click|preventDefault={clearCacheAndRefreshModels}
          disabled={busyModels || busyCacheRefresh || providers.length === 0}
        >
          {busyCacheRefresh
            ? "Refreshing models..."
            : "Refresh Models (Clear Cache)"}
        </button>
      </div>

      <div>
        <label for="test-model">Model</label>
        <select id="test-model" bind:value={selectedModel}>
          {#if models.length === 0}
            <option value="">Load models first</option>
          {:else}
            {#each models as model}
              <option value={model.id}>{model.id}</option>
            {/each}
          {/if}
        </select>
      </div>

      <div>
        <label for="test-prompt">Prompt</label>
        <textarea
          id="test-prompt"
          bind:value={prompt}
          rows="7"
          placeholder="Type a test prompt..."
        ></textarea>
      </div>

      <div class="test-actions">
        <button
          on:click|preventDefault={sendTestPrompt}
          disabled={busyChat || !selectedModel}
        >
          {busyChat ? "Sending..." : "Send Test"}
        </button>
      </div>

      {#if infoMessage}
        <div class="notice">{infoMessage}</div>
      {/if}

      {#if errorMessage}
        <div class="error">{errorMessage}</div>
      {/if}

      {#if lastStatus}
        <p class="muted">Last response status: {lastStatus}</p>
      {/if}
    </section>

    <section class="card stack">
      <h2>Result</h2>

      <div>
        <label>Assistant Text</label>
        <pre class="test-output"><code
            >{responseText || "No response yet."}</code
          ></pre>
      </div>

      <div>
        <label>Raw JSON</label>
        <pre class="test-output"><code>{rawResponse || "No response yet."}</code
          ></pre>
      </div>
    </section>
  </div>
</main>
