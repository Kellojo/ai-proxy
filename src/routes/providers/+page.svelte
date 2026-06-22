<script lang="ts">
  import { onDestroy, onMount } from "svelte";

  type ProviderModelCache = {
    cachedAt: string;
    cacheAgeMs: number;
    expiresInMs: number;
    expired: boolean;
    modelCount: number;
    modelIds: string[];
  };

  type Provider = {
    id: string;
    name: string;
    kind: "openai" | "anthropic" | "other";
    endpointUrl: string;
    isDefault: boolean;
    wolEnabled: boolean;
    wolMac?: string;
    wolBroadcast?: string;
    wolPort?: number;
    cacheEnabled: boolean;
    modelCache: ProviderModelCache | null;
  };

  let providers: Provider[] = [];
  let cacheTtlMs = 0;
  let message = "";
  let error = "";
  let loadingProviders = false;
  const MODEL_PREVIEW_MAX_CHARS = 15;
  const DIALOG_ANIMATION_MS = 140;

  let showCreateModal = false;
  let createModalClosing = false;
  let showEditModal = false;
  let editModalClosing = false;
  let editingProviderId = "";

  let createDialog: HTMLDialogElement | null = null;
  let editDialog: HTMLDialogElement | null = null;
  let cacheRefreshInterval: ReturnType<typeof setInterval> | null = null;

  let providerForm = {
    name: "",
    kind: "openai",
    endpointUrl: "https://api.openai.com",
    apiKey: "",
    isDefault: false,
    wolEnabled: false,
    wolMac: "",
    wolBroadcast: "255.255.255.255",
    wolPort: 9,
  };

  let editForm = {
    name: "",
    kind: "openai",
    endpointUrl: "",
    apiKey: "",
    isDefault: false,
    wolEnabled: false,
    wolMac: "",
    wolBroadcast: "255.255.255.255",
    wolPort: 9,
  };

  async function loadProviders() {
    loadingProviders = true;

    try {
      const response = await fetch("/api/providers");
      const payload = await response.json();

      if (!response.ok) {
        error = payload?.error || "Failed to load providers";
        return;
      }

      providers = payload?.providers || [];
      cacheTtlMs = payload?.cacheTtlMs || 0;
    } catch {
      error = "Failed to load providers";
    } finally {
      loadingProviders = false;
    }
  }

  async function refreshProviderData() {
    await loadProviders();
  }

  async function refreshProvidersIfVisible() {
    if (
      typeof document !== "undefined" &&
      document.visibilityState !== "visible"
    ) {
      return;
    }

    await loadProviders();
  }

  function formatDuration(ms?: number) {
    if (!ms || ms <= 0) return "0s";

    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;

    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ${seconds % 60}s`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ${minutes % 60}m`;

    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  }

  function modelPreview(modelIds: string[]): string {
    const full = modelIds.join(", ");
    if (!full) return "-";
    if (full.length <= MODEL_PREVIEW_MAX_CHARS) return full;
    return `${full.slice(0, MODEL_PREVIEW_MAX_CHARS)}...`;
  }

  function cacheTooltip(provider: Provider): string {
    if (!provider.modelCache) return "No cached models";

    const status = provider.modelCache.expired ? "Expired" : "Fresh";
    const ids = provider.modelCache.modelIds.join(", ") || "-";
    return `${status} | ${provider.modelCache.modelCount} model(s) | ${formatDuration(provider.modelCache.cacheAgeMs)} old\n${ids}`;
  }

  async function addProvider() {
    message = "";
    error = "";

    const res = await fetch("/api/providers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(providerForm),
    });

    const payload = await res.json();
    if (!res.ok) {
      error = payload.error || "Failed to create provider";
      return;
    }

    message = `Provider ${payload.provider.name} created`;
    providerForm = {
      ...providerForm,
      name: "",
      apiKey: "",
    };
    closeCreateModal();

    await refreshProviderData();
  }

  function openCreateModal() {
    createModalClosing = false;
    showCreateModal = true;
  }

  function closeCreateModal() {
    if (!showCreateModal || createModalClosing) return;
    createModalClosing = true;

    setTimeout(() => {
      providerForm = {
        name: "",
        kind: "openai",
        endpointUrl: "https://api.openai.com",
        apiKey: "",
        isDefault: false,
        wolEnabled: false,
        wolMac: "",
        wolBroadcast: "255.255.255.255",
        wolPort: 9,
      };
      showCreateModal = false;
      createModalClosing = false;
    }, DIALOG_ANIMATION_MS);
  }

  async function removeProvider(id: string) {
    const confirmed = window.confirm(
      "Delete this provider? This action cannot be undone.",
    );
    if (!confirmed) return;

    await fetch(`/api/providers/${id}`, { method: "DELETE" });
    await refreshProviderData();
  }

  function openEditProvider(provider: Provider) {
    editModalClosing = false;
    editingProviderId = provider.id;
    editForm = {
      name: provider.name,
      kind: provider.kind,
      endpointUrl: provider.endpointUrl,
      apiKey: "",
      isDefault: provider.isDefault,
      wolEnabled: provider.wolEnabled,
      wolMac: provider.wolMac || "",
      wolBroadcast: provider.wolBroadcast || "255.255.255.255",
      wolPort: provider.wolPort || 9,
    };
    showEditModal = true;
  }

  function closeEditModal() {
    if (!showEditModal || editModalClosing) return;
    editModalClosing = true;

    setTimeout(() => {
      editForm = {
        name: "",
        kind: "openai",
        endpointUrl: "",
        apiKey: "",
        isDefault: false,
        wolEnabled: false,
        wolMac: "",
        wolBroadcast: "255.255.255.255",
        wolPort: 9,
      };
      showEditModal = false;
      editModalClosing = false;
      editingProviderId = "";
    }, DIALOG_ANIMATION_MS);
  }

  async function saveProviderEdits() {
    message = "";
    error = "";

    const res = await fetch(`/api/providers/${editingProviderId}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...editForm,
        apiKey: editForm.apiKey.trim() || undefined,
      }),
    });

    const payload = await res.json();
    if (!res.ok) {
      error = payload.error || "Failed to update provider";
      return;
    }

    message = `Provider ${payload.provider.name} updated`;
    closeEditModal();
    await refreshProviderData();
  }

  $: {
    if (showCreateModal && createDialog && !createDialog.open) {
      createDialog.showModal();
    }

    if (!showCreateModal && createDialog?.open) {
      createDialog.close();
    }
  }

  $: {
    if (showEditModal && editDialog && !editDialog.open) {
      editDialog.showModal();
    }

    if (!showEditModal && editDialog?.open) {
      editDialog.close();
    }
  }

  onMount(() => {
    refreshProviderData();

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        loadProviders();
      }
    };

    const onWindowFocus = () => {
      loadProviders();
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", onWindowFocus);

    cacheRefreshInterval = setInterval(() => {
      refreshProvidersIfVisible();
    }, 5000);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", onWindowFocus);
      if (cacheRefreshInterval) {
        clearInterval(cacheRefreshInterval);
        cacheRefreshInterval = null;
      }
    };
  });

  onDestroy(() => {
    if (cacheRefreshInterval) {
      clearInterval(cacheRefreshInterval);
      cacheRefreshInterval = null;
    }
  });
</script>

<main>
  <div class="stack" style="margin-bottom: 1rem;">
    <div class="page-header">
      <div class="stack" style="gap: 0.2rem;">
        <h1>Providers</h1>
        <p class="muted">
          Configure OpenAI, Anthropic, and OpenAI-compatible providers.
        </p>
      </div>
      <button on:click={openCreateModal}>New Provider</button>
    </div>
    {#if message}<div class="notice">{message}</div>{/if}
    {#if error}<div class="error">{error}</div>{/if}
  </div>

  {#if providers.length === 0}
    <p class="muted">No providers yet.</p>
  {:else}
    <div class="table-wrap card">
      <table class="logs-table entity-table providers-table">
        <thead>
          <tr>
            <th>Name / Endpoint</th>
            <th>Kind / Default</th>
            <th>Wake-on-LAN</th>
            <th>Model Cache / Models</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {#each providers as provider}
            <tr>
              <td>
                <strong>{provider.name}</strong>
                <div class="provider-endpoint" title={provider.endpointUrl}>
                  {provider.endpointUrl}
                </div>
              </td>
              <td>
                <span class="kind-chip">{provider.kind}</span>
                {#if provider.isDefault}
                  <div style="margin-top: 0.35rem;">
                    <span class="status-pill ok">Default</span>
                  </div>
                {:else}
                  <div class="muted" style="margin-top: 0.35rem;">
                    Not default
                  </div>
                {/if}
              </td>
              <td>
                {#if provider.wolEnabled}
                  <span
                    class="wol-detail"
                    title={`${provider.wolMac || ""} via ${provider.wolBroadcast || ""}:${provider.wolPort || ""}`}
                    >{provider.wolMac} via {provider.wolBroadcast}:{provider.wolPort}</span
                  >
                {:else}
                  <span class="muted">Disabled</span>
                {/if}
              </td>
              <td>
                {#if loadingProviders}
                  <span class="muted">Loading...</span>
                {:else if provider.modelCache}
                  <div class="muted">
                    {provider.modelCache.modelCount} model(s), {formatDuration(
                      provider.modelCache.cacheAgeMs,
                    )} old
                  </div>
                  <div
                    class="provider-endpoint cached-model-list"
                    title={cacheTooltip(provider)}
                  >
                    {modelPreview(provider.modelCache.modelIds)}
                  </div>
                {:else}
                  <span class="muted">Empty</span>
                {/if}
              </td>
              <td>
                <div class="table-actions">
                  <button
                    class="ghost"
                    on:click={() => openEditProvider(provider)}>Edit</button
                  >
                  <button
                    class="danger"
                    on:click={() => removeProvider(provider.id)}>Delete</button
                  >
                </div>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}

  <dialog
    bind:this={createDialog}
    class={`modal stack ${createModalClosing ? "is-closing" : ""}`}
    aria-labelledby="create-provider-title"
    on:cancel|preventDefault={closeCreateModal}
    on:click={(event) => {
      if (event.currentTarget === event.target && document.activeElement !== event.currentTarget && !event.currentTarget.contains(document.activeElement)) closeCreateModal();
    }}
  >
    <div class="modal-header">
      <h2 id="create-provider-title">Create Provider</h2>
    </div>

    <div class="form-grid">
      <div>
        <label for="provider-name">Name</label>
        <input
          id="provider-name"
          bind:value={providerForm.name}
          placeholder="Main OpenAI"
        />
      </div>
      <div>
        <label for="provider-kind">Kind</label>
        <select id="provider-kind" bind:value={providerForm.kind}>
          <option value="openai">OpenAI</option>
          <option value="anthropic">Anthropic</option>
          <option value="other">Other OpenAI-like</option>
        </select>
      </div>
      <div>
        <label for="provider-endpoint">Endpoint URL</label>
        <input
          id="provider-endpoint"
          bind:value={providerForm.endpointUrl}
          placeholder="https://api.openai.com"
        />
      </div>
      <div>
        <label for="provider-apikey">API Key / Token</label>
        <input
          id="provider-apikey"
          bind:value={providerForm.apiKey}
          type="password"
          placeholder="sk-..."
        />
      </div>
      <div>
        <label
          ><input
            type="checkbox"
            bind:checked={providerForm.isDefault}
            style="width:auto;"
          /> Default provider</label
        >
      </div>
      <div>
        <label
          ><input
            type="checkbox"
            bind:checked={providerForm.wolEnabled}
            style="width:auto;"
          /> Send Wake-on-LAN before requests</label
        >
      </div>

      {#if providerForm.wolEnabled}
        <div>
          <label for="provider-wol-mac">WOL MAC</label>
          <input
            id="provider-wol-mac"
            bind:value={providerForm.wolMac}
            placeholder="00:11:22:33:44:55"
          />
        </div>
        <div>
          <label for="provider-wol-broadcast">WOL Broadcast</label>
          <input
            id="provider-wol-broadcast"
            bind:value={providerForm.wolBroadcast}
          />
        </div>
        <div>
          <label for="provider-wol-port">WOL Port</label>
          <input
            id="provider-wol-port"
            bind:value={providerForm.wolPort}
            type="number"
          />
        </div>
      {/if}
    </div>

    <div class="modal-footer">
      <button class="ghost" on:click={closeCreateModal}>Close</button>
      <button on:click|preventDefault={addProvider}>Save Provider</button>
    </div>
  </dialog>

  <dialog
    bind:this={editDialog}
    class={`modal stack ${editModalClosing ? "is-closing" : ""}`}
    aria-labelledby="edit-provider-title"
    on:cancel|preventDefault={closeEditModal}
    on:click={(event) => {
      if (event.currentTarget === event.target && document.activeElement !== event.currentTarget && !event.currentTarget.contains(document.activeElement)) closeEditModal();
    }}
  >
    <div class="modal-header">
      <h2 id="edit-provider-title">Edit Provider</h2>
    </div>

    <div class="form-grid">
      <div>
        <label for="edit-provider-name">Name</label>
        <input
          id="edit-provider-name"
          bind:value={editForm.name}
          placeholder="Main OpenAI"
        />
      </div>
      <div>
        <label for="edit-provider-kind">Kind</label>
        <select id="edit-provider-kind" bind:value={editForm.kind}>
          <option value="openai">OpenAI</option>
          <option value="anthropic">Anthropic</option>
          <option value="other">Other OpenAI-like</option>
        </select>
      </div>
      <div>
        <label for="edit-provider-endpoint">Endpoint URL</label>
        <input
          id="edit-provider-endpoint"
          bind:value={editForm.endpointUrl}
          placeholder="https://api.openai.com"
        />
      </div>
      <div>
        <label for="edit-provider-apikey">API Key / Token (optional)</label>
        <input
          id="edit-provider-apikey"
          bind:value={editForm.apiKey}
          type="password"
          placeholder="Leave blank to keep existing key"
        />
      </div>
      <div>
        <label
          ><input
            type="checkbox"
            bind:checked={editForm.isDefault}
            style="width:auto;"
          /> Default provider</label
        >
      </div>
      <div>
        <label
          ><input
            type="checkbox"
            bind:checked={editForm.wolEnabled}
            style="width:auto;"
          /> Send Wake-on-LAN before requests</label
        >
      </div>

      {#if editForm.wolEnabled}
        <div>
          <label for="edit-provider-wol-mac">WOL MAC</label>
          <input
            id="edit-provider-wol-mac"
            bind:value={editForm.wolMac}
            placeholder="00:11:22:33:44:55"
          />
        </div>
        <div>
          <label for="edit-provider-wol-broadcast">WOL Broadcast</label>
          <input
            id="edit-provider-wol-broadcast"
            bind:value={editForm.wolBroadcast}
          />
        </div>
        <div>
          <label for="edit-provider-wol-port">WOL Port</label>
          <input
            id="edit-provider-wol-port"
            bind:value={editForm.wolPort}
            type="number"
          />
        </div>
      {/if}
    </div>

    <div class="modal-footer">
      <button class="ghost" on:click={closeEditModal}>Close</button>
      <button on:click|preventDefault={saveProviderEdits}>Save Changes</button>
    </div>
  </dialog>
</main>
