<script lang="ts">
  import { onMount } from "svelte";

  type VirtualKey = {
    id: string;
    name: string;
    keyPrefix: string;
    active: boolean;
    createdAt: string;
    lastUsedAt?: string;
  };

  let keys: VirtualKey[] = [];
  let keyName = "";
  let message = "";
  let error = "";
  let showCreateModal = false;

  function formatTime(value?: string) {
    if (!value) return "-";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
  }

  async function loadKeys() {
    const response = await fetch("/api/virtual-keys");
    keys = (await response.json()).keys || [];
  }

  async function createVirtualKey() {
    message = "";
    error = "";

    const res = await fetch("/api/virtual-keys", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: keyName }),
    });

    const payload = await res.json();
    if (!res.ok) {
      error = payload.error || "Failed to create key";
      return;
    }

    message = `Created key ${payload.key.name}`;
    keyName = "";
    showCreateModal = false;
    await loadKeys();
  }

  async function rerollKey(id: string) {
    const res = await fetch(`/api/virtual-keys/${id}/reroll`, {
      method: "POST",
    });
    const payload = await res.json();
    if (res.ok) {
      message = `Rerolled key ${payload.key.name}`;
      error = "";
      await loadKeys();
    } else {
      error = payload.error || "Failed to reroll key";
    }
  }

  async function toggleKey(key: VirtualKey) {
    await fetch(`/api/virtual-keys/${key.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ active: !key.active, name: key.name }),
    });
    await loadKeys();
  }

  async function renameKey(key: VirtualKey) {
    const nextName = window.prompt("New key name", key.name)?.trim();
    if (!nextName) return;

    await fetch(`/api/virtual-keys/${key.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: nextName, active: key.active }),
    });

    await loadKeys();
  }

  async function deleteKey(id: string) {
    await fetch(`/api/virtual-keys/${id}`, { method: "DELETE" });
    await loadKeys();
  }

  onMount(loadKeys);
</script>

<main>
  <div class="stack" style="margin-bottom: 1rem;">
    <div class="page-header">
      <div class="stack" style="gap: 0.2rem;">
        <h1>Virtual Keys</h1>
        <p class="muted">
          Manage client-facing keys used to access proxy endpoints.
        </p>
      </div>
      <button on:click={() => (showCreateModal = true)}>New Key</button>
    </div>
    {#if message}<div class="notice">{message}</div>{/if}
    {#if error}<div class="error">{error}</div>{/if}
  </div>

  <div class="grid">
    <section class="card span-12 stack">
      <h2>Configured Keys</h2>
      {#if keys.length === 0}
        <p class="muted">No virtual keys yet.</p>
      {:else}
        <div class="table-wrap">
          <table class="logs-table entity-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Prefix</th>
                <th>Status</th>
                <th>Last Used</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {#each keys as key}
                <tr>
                  <td><strong>{key.name}</strong></td>
                  <td>
                    <span class="provider-endpoint">{key.keyPrefix}...</span>
                  </td>
                  <td>
                    <span class={`status-pill ${key.active ? "ok" : "warn"}`}
                      >{key.active ? "Active" : "Disabled"}</span
                    >
                  </td>
                  <td>{formatTime(key.lastUsedAt)}</td>
                  <td>{formatTime(key.createdAt)}</td>
                  <td>
                    <div class="table-actions">
                      <button class="ghost" on:click={() => renameKey(key)}
                        >Rename</button
                      >
                      <button class="ghost" on:click={() => toggleKey(key)}
                        >{key.active ? "Disable" : "Enable"}</button
                      >
                      <button class="alt" on:click={() => rerollKey(key.id)}
                        >Reroll</button
                      >
                      <button class="ghost" on:click={() => deleteKey(key.id)}
                        >Delete</button
                      >
                    </div>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </section>
  </div>

  {#if showCreateModal}
    <div class="modal-backdrop" role="presentation">
      <button
        class="modal-dismiss"
        type="button"
        aria-label="Close create key dialog"
        on:click={() => (showCreateModal = false)}
      ></button>

      <div
        class="modal stack"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-key-title"
      >
        <div class="modal-header">
          <h2 id="create-key-title">Create Key</h2>
          <button class="ghost" on:click={() => (showCreateModal = false)}
            >Close</button
          >
        </div>

        <div class="row">
          <div style="flex: 1 1 260px;">
            <label for="key-name">Key Name</label>
            <input
              id="key-name"
              bind:value={keyName}
              placeholder="Production client"
            />
          </div>
          <div style="align-self: flex-end;">
            <button class="alt" on:click|preventDefault={createVirtualKey}
              >Create Key</button
            >
          </div>
        </div>

        <p class="muted">
          Use Authorization: Bearer vk_xxx when calling proxy endpoints.
        </p>

        <div class="row" style="justify-content: flex-end;">
          <button class="ghost" on:click={() => (showCreateModal = false)}
            >Cancel</button
          >
        </div>
      </div>
    </div>
  {/if}
</main>
