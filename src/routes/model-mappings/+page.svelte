<script lang="ts">
  import { onMount } from "svelte";
  import { toast } from "svelte-sonner";
  import Icon from "$lib/svelte-components/Icon.svelte";

  import Button from "$lib/svelte-components/Button.svelte";
  import Tag from "$lib/svelte-components/Tag.svelte";

  type ModelMapping = {
    id: string;
    sourceModel: string;
    targetModel: string;
    providerId?: string;
  };

  let mappings: ModelMapping[] = [];
  let loading = true;
  let message = "";
  let error = "";

  type DropdownOption = { id: string; name: string };
  let allModels: DropdownOption[] = [];
  let allProviders: DropdownOption[] = [];
  let optionsLoading = false;

  let newSource = "";
  let newTarget = "";
  let newProviderId = "";

  let editId: string | null = null;
  let editingSource = "";
  let editingTarget = "";
  let editingProviderId = "";

  async function loadMappings() {
    loading = true;
    const res = await fetch("/api/model-mappings");
    const data = (await res.json()) as { mappings?: ModelMapping[] };
    mappings = data.mappings || [];
    loading = false;
  }

  async function loadDropdownOptions() {
    optionsLoading = true;
    try {
      const res = await fetch("/api/model-mappings/options");
      if (!res.ok) return;
      const data = (await res.json()) as { models?: string[]; providers?: DropdownOption[] };
      allModels = ((data.models || []).map((m) => ({ id: m, name: m }))).sort((a, b) => a.name.localeCompare(b.name));
      allProviders = ((data.providers || []) as DropdownOption[]).sort((a, b) => a.name.localeCompare(b.name));
    } finally {
      optionsLoading = false;
    }
  }

  async function addMapping() {
    message = "";
    error = "";

    const res = await fetch("/api/model-mappings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source_model: newSource, target_model: newTarget, provider_id: newProviderId || undefined }),
    });

    const payload = (await res.json()) as { mapping?: ModelMapping; error?: string };
    if (!res.ok) {
      error = payload.error || "Failed to add mapping";
      return;
    }

    newSource = "";
    newTarget = "";
    newProviderId = "";
    toast.success(`Remap "${payload.mapping!.sourceModel}" -> "${payload.mapping!.targetModel}" added`);
    await loadMappings();
  }

  function startEdit(mapping: ModelMapping) {
    editId = mapping.id;
    editingSource = mapping.sourceModel;
    editingTarget = mapping.targetModel;
    editingProviderId = mapping.providerId || "";
  }

  function cancelEdit() {
    editId = null;
    editingSource = "";
    editingTarget = "";
    editingProviderId = "";
  }

  async function saveEdit(id: string) {
    message = "";
    error = "";

    const res = await fetch(`/api/model-mappings/${id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source_model: editingSource, target_model: editingTarget, provider_id: editingProviderId || undefined }),
    });

    if (!res.ok) {
      const payload = (await res.json()) as { error?: string };
      error = payload.error || "Failed to save";
      return;
    }

    editId = null;
    toast.success("Mapping updated");
    await loadMappings();
  }

  async function removeMapping(id: string, sourceModel: string) {
    const confirmed = window.confirm(`Remove remap for "${sourceModel}"?`);
    if (!confirmed) return;

    await fetch(`/api/model-mappings/${id}`, { method: "DELETE" });
    toast.success(`Removed remap for "${sourceModel}"`);
    await loadMappings();
  }

  onMount(async () => {
    await Promise.all([loadMappings(), loadDropdownOptions()]);
  });
</script>

<main>
  <div class="stack" style="margin-bottom: 1rem;">
    <div class="page-header">
      <div class="stack" style="gap: 0.2rem;">
        <h1>Model Mappings</h1>
        <p class="muted">
          Remap client-facing model names to real provider models. When a client
          requests "auto", it will be forwarded as the target model instead.
        </p>
      </div>
    </div>

    {#if message}<div class="notice">{message}</div>{/if}
    {#if error}<div class="error">{error}</div>{/if}
  </div>

  <div class="card" style="padding: 1rem; margin-bottom: 1.5rem;">
    <h3 style="margin-top: 0;">Add New Remap</h3>
    {#if optionsLoading}<p class="muted">Loading available models...</p>{/if}
    <form
      onsubmit={(e) => {
        e.preventDefault();
        addMapping();
      }}
    >
      <div class="row" style="align-items: flex-end; gap: 0.75rem;">
        <div style="flex: 1; min-width: 180px;">
          <label for="new-source">Source model name</label>
          <input
            id="new-source"
            type="text"
            bind:value={newSource}
            placeholder='e.g. "auto"'
            required
          />
        </div>
        <div style="flex: 1; min-width: 180px;">
          <label for="new-target">Target model name</label>
          {#if allModels.length > 0}
            <select id="new-target" bind:value={newTarget}>
              <option value="">Select a model...</option>
              {#each allModels as option}
                <option value={option.id}>{option.name}</option>
              {/each}
            </select>
          {:else}
            <input
              id="new-target"
              type="text"
              bind:value={newTarget}
              placeholder='e.g. "coding--3b"'
              required
            />
          {/if}
        </div>
        <div style="flex: 1; min-width: 180px;">
          <label for="new-provider">Provider override (optional)</label>
          {#if allProviders.length > 0}
            <select id="new-provider" bind:value={newProviderId}>
              <option value="">Auto-select provider</option>
              {#each allProviders as option}
                <option value={option.id}>{option.name}</option>
              {/each}
            </select>
          {:else}
            <input
              id="new-provider"
              type="text"
              bind:value={newProviderId}
              placeholder="provider ID or name"
            />
          {/if}
        </div>
        <div>
          <Button type="submit" disabled={!newSource.trim() || !newTarget.trim()}>
            <Icon icon="tabler:shuffle" /> Add Remap
          </Button>
        </div>
      </div>
    </form>
  </div>

  {#if loading}
    <p class="muted">Loading...</p>
  {:else if mappings.length === 0}
    <div class="card" style="padding: 1rem; text-align: center;">
      <p class="muted">No model remaps configured yet.</p>
    </div>
  {:else}
    <div class="table-wrap card">
      <table class="logs-table entity-table" style="table-layout: fixed;">
        <thead>
          <tr>
            <th style="width: 25%;">Source Model (alias)</th>
            <th style="width: 30%;">Target Model (real name)</th>
            <th style="width: 25%;">Provider</th>
            <th style="width: 20%;">Actions</th>
          </tr>
        </thead>
        <tbody>
          {#each mappings as mapping}
            {#if editId === mapping.id}
              <tr>
                <td>
                  <input
                    type="text"
                    bind:value={editingSource}
                    class="inline-edit"
                  />
                </td>
                <td>
                  {#if allModels.length > 0}
                    <select bind:value={editingTarget}>
                      {#each allModels as option}
                        <option value={option.id}>{option.name}</option>
                      {/each}
                    </select>
                  {:else}
                    <input
                      type="text"
                      bind:value={editingTarget}
                      class="inline-edit"
                    />
                  {/if}
                </td>
                <td>
                  {#if allProviders.length > 0}
                    <select bind:value={editingProviderId}>
                      <option value="">Auto</option>
                      {#each allProviders as option}
                        <option value={option.id}>{option.name}</option>
                      {/each}
                    </select>
                  {:else}
                    <input
                      type="text"
                      bind:value={editingProviderId}
                      class="inline-edit"
                      placeholder="optional"
                    />
                  {/if}
                </td>
                <td>
                  <div class="table-actions">
                    <Button variant="ghost" on:click={cancelEdit}>
                      <Icon icon="tabler:x" /> Cancel
                    </Button>
                    <Button on:click={() => saveEdit(mapping.id)}>
                      <Icon icon="tabler:check" /> Save
                    </Button>
                  </div>
                </td>
              </tr>
            {:else}
              <tr>
                <td><Tag variant="neutral">{mapping.sourceModel}</Tag></td>
                <td><Tag variant="neutral">{mapping.targetModel}</Tag></td>
                <td>
                  {#if mapping.providerId}
                    {@const mappedProvider = allProviders.find((p) => p.id === mapping.providerId)}
                    {#if mappedProvider}
                      <span class="muted">{mappedProvider.name}</span>
                    {:else}
                      <code>{mapping.providerId}</code>
                    {/if}
                  {:else}
                    <Tag variant="ok">auto</Tag>
                  {/if}
                </td>
                <td>
                  <div class="table-actions">
                    <Button variant="ghost" on:click={() => startEdit(mapping)}>
                      <Icon icon="tabler:pencil" /> Edit
                    </Button>
                    <Button
                      variant="danger"
                      on:click={() => removeMapping(mapping.id, mapping.sourceModel)}
                    >
                      <Icon icon="tabler:trash-x" /> Delete
                    </Button>
                  </div>
                </td>
              </tr>
            {/if}
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</main>

<style>
  :global(.inline-edit) {
    width: 100%;
    padding: 0.25rem 0.35rem;
    height: calc(1.5em + 0.75rem);
    font-family: var(--font-mono, monospace);
    font-size: 0.85rem;
    background: var(--bg-input, #1a1d23);
    border: 1px solid var(--line, #2a2d34);
    color: var(--primaryText, #e6e8eb);
    border-radius: 4px;
    box-sizing: border-box;
  }

  :global(.inline-edit):focus {
    outline: none;
    border-color: var(--accentBlue, #5b9aff);
  }

  select {
    width: 100%;
    padding: 0.25rem 0.35rem;
    height: calc(1.5em + 0.75rem);
    font-family: var(--font-mono, monospace);
    font-size: 0.85rem;
    background: var(--bg-input, #1a1d23);
    border: 1px solid var(--line, #2a2d34);
    color: var(--primaryText, #e6e8eb);
    border-radius: 4px;
    box-sizing: border-box;
    cursor: pointer;
  }

  select:focus {
    outline: none;
    border-color: var(--accentBlue, #5b9aff);
  }
</style>
