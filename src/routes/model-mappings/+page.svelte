<script lang="ts">
  import { onMount } from "svelte";

  type ModelMapping = {
    id: string;
    sourceModel: string;
    targetModel: string;
  };

  let mappings: ModelMapping[] = [];
  let loading = true;
  let message = "";
  let error = "";
  let toastMessage = "";
  let newSource = "";
  let newTarget = "";

  let editId: string | null = null;
  let editingSource = "";
  let editingTarget = "";

  let toastTimeout: ReturnType<typeof setTimeout> | null = null;

  async function loadMappings() {
    loading = true;
    const res = await fetch("/api/model-mappings");
    const data = (await res.json()) as { mappings?: ModelMapping[] };
    mappings = data.mappings || [];
    loading = false;
  }

  function showToast(text: string) {
    toastMessage = text;
    if (toastTimeout) clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
      toastMessage = "";
      toastTimeout = null;
    }, 1800);
  }

  async function addMapping() {
    message = "";
    error = "";

    const res = await fetch("/api/model-mappings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source_model: newSource, target_model: newTarget }),
    });

    const payload = (await res.json()) as { mapping?: ModelMapping; error?: string };
    if (!res.ok) {
      error = payload.error || "Failed to add mapping";
      return;
    }

    newSource = "";
    newTarget = "";
    showToast(`Remap "${payload.mapping!.sourceModel}" -> "${payload.mapping!.targetModel}" added`);
    await loadMappings();
  }

  function startEdit(mapping: ModelMapping) {
    editId = mapping.id;
    editingSource = mapping.sourceModel;
    editingTarget = mapping.targetModel;
  }

  function cancelEdit() {
    editId = null;
    editingSource = "";
    editingTarget = "";
  }

  async function saveEdit(id: string) {
    message = "";
    error = "";

    const res = await fetch(`/api/model-mappings/${id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source_model: editingSource, target_model: editingTarget }),
    });

    if (!res.ok) {
      const payload = (await res.json()) as { error?: string };
      error = payload.error || "Failed to save";
      return;
    }

    editId = null;
    showToast("Mapping updated");
    await loadMappings();
  }

  async function removeMapping(id: string, sourceModel: string) {
    const confirmed = window.confirm(`Remove remap for "${sourceModel}"?`);
    if (!confirmed) return;

    await fetch(`/api/model-mappings/${id}`, { method: "DELETE" });
    showToast(`Removed remap for "${sourceModel}"`);
    await loadMappings();
  }

  $: {
    if (toastTimeout) clearTimeout(toastTimeout);
  }

  onMount(loadMappings);
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

    {#if toastMessage}<div class="mini-toast">{toastMessage}</div>{/if}
    {#if message}<div class="notice">{message}</div>{/if}
    {#if error}<div class="error">{error}</div>{/if}
  </div>

  <div class="card" style="padding: 1rem; margin-bottom: 1.5rem;">
    <h3 style="margin-top: 0;">Add New Remap</h3>
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
          <input
            id="new-target"
            type="text"
            bind:value={newTarget}
            placeholder='e.g. "vibethinker-3b"'
            required
          />
        </div>
        <div>
          <button type="submit" style="width: 100%; height: calc(1.5em + 0.75rem);" disabled={!newSource.trim() || !newTarget.trim()}>
            Add Remap
          </button>
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
            <th style="width: 30%;">Source Model (alias)</th>
            <th style="width: 45%;">Target Model (real name)</th>
            <th style="width: 25%;">Actions</th>
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
                  <input
                    type="text"
                    bind:value={editingTarget}
                    class="inline-edit"
                  />
                </td>
                <td>
                  <div class="table-actions">
                    <button class="ghost" onclick={cancelEdit}>Cancel</button>
                    <button onclick={() => saveEdit(mapping.id)}>Save</button>
                  </div>
                </td>
              </tr>
            {:else}
              <tr>
                <td><code>{mapping.sourceModel}</code></td>
                <td><code>{mapping.targetModel}</code></td>
                <td>
                  <div class="table-actions">
                    <button class="ghost" onclick={() => startEdit(mapping)}>
                      Edit
                    </button>
                    <button
                      class="danger"
                      onclick={() => removeMapping(mapping.id, mapping.sourceModel)}
                    >
                      Delete
                    </button>
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
</style>
