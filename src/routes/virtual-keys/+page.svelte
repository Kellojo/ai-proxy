<script lang="ts">
  import { onDestroy, onMount } from "svelte";

  type VirtualKey = {
    id: string;
    name: string;
    keyPrefix: string;
    active: boolean;
    createdAt: string;
    lastUsedAt?: string;
  };

  let keys: VirtualKey[] = [];
  const DIALOG_ANIMATION_MS = 140;

  let keyName = "";
  let message = "";
  let error = "";
  let toastMessage = "";
  let showCreateModal = false;
  let createModalClosing = false;
  let toastTimeout: ReturnType<typeof setTimeout> | null = null;

  let createDialog: HTMLDialogElement | null = null;

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

    if (payload.plaintext) {
      try {
        await navigator.clipboard.writeText(payload.plaintext);
        showToast("Key copied to clipboard");
      } catch {
        showToast("Key created, but clipboard access failed");
      }
    }

    closeCreateModal();
    await loadKeys();
  }

  function showToast(text: string) {
    toastMessage = text;
    if (toastTimeout) clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
      toastMessage = "";
      toastTimeout = null;
    }, 1800);
  }

  function openCreateModal() {
    createModalClosing = false;
    keyName = "";
    error = "";
    showCreateModal = true;
  }

  function closeCreateModal() {
    if (!showCreateModal || createModalClosing) return;
    createModalClosing = true;

    setTimeout(() => {
      showCreateModal = false;
      createModalClosing = false;
      keyName = "";
    }, DIALOG_ANIMATION_MS);
  }

  async function rerollKey(id: string) {
    const confirmed = window.confirm(
      "Reroll this key? The previous key value will stop working.",
    );
    if (!confirmed) return;

    const res = await fetch(`/api/virtual-keys/${id}/reroll`, {
      method: "POST",
    });
    const payload = await res.json();
    if (res.ok) {
      message = `Rerolled key ${payload.key.name}`;
      error = "";

      if (payload.plaintext) {
        try {
          await navigator.clipboard.writeText(payload.plaintext);
          showToast("Rerolled key copied to clipboard");
        } catch {
          showToast("Key rerolled, but clipboard access failed");
        }
      }

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
    const confirmed = window.confirm(
      "Delete this key? This action cannot be undone.",
    );
    if (!confirmed) return;

    await fetch(`/api/virtual-keys/${id}`, { method: "DELETE" });
    await loadKeys();
  }

  $: {
    if (showCreateModal && createDialog && !createDialog.open) {
      createDialog.showModal();
    }

    if (!showCreateModal && createDialog?.open) {
      createDialog.close();
    }
  }

  onMount(loadKeys);

  onDestroy(() => {
    if (toastTimeout) clearTimeout(toastTimeout);
  });
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
      <button on:click={openCreateModal}>New Key</button>
    </div>
    {#if toastMessage}<div class="mini-toast">{toastMessage}</div>{/if}
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
                      <button class="danger" on:click={() => deleteKey(key.id)}
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

  <dialog
    bind:this={createDialog}
    class={`modal stack ${createModalClosing ? "is-closing" : ""}`}
    aria-labelledby="create-key-title"
    on:cancel|preventDefault={closeCreateModal}
    on:click={(event) => {
      if (event.currentTarget === event.target && document.activeElement !== event.currentTarget && !event.currentTarget.contains(document.activeElement)) closeCreateModal();
    }}
  >
    <div class="modal-header">
      <h2 id="create-key-title">Create Key</h2>
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
    </div>

    <p class="muted">
      Use Authorization: Bearer vk_xxx when calling proxy endpoints.
    </p>

    <div class="row modal-footer">
      <button class="ghost" on:click={closeCreateModal}>Close</button>
      <button on:click|preventDefault={createVirtualKey}>Create Key</button>
    </div>
  </dialog>
</main>
