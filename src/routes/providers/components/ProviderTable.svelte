<script lang="ts">
  import {
    providers,
    loadingProviders,
    formatDuration,
    refreshAllModels,
    loadingModels,
  } from "../providers-store";

  import type { Provider } from "../types";

  import Button from "$lib/svelte-components/Button.svelte";
  import Tag from "$lib/svelte-components/Tag.svelte";
  import Icon from "$lib/svelte-components/Icon.svelte";

  interface Props {
    onEditProvider: (provider: Provider) => void;
    onDeleteProvider: (id: string) => void;
    onCreateProvider: () => void;
  }

  const { onEditProvider, onDeleteProvider, onCreateProvider } = $props<Props>();

  function formatLastRefresh(timestamp?: string | null): string {
    if (!timestamp) return "-";
    try {
      const d = new Date(timestamp);
      const diffMs = Date.now() - d.getTime();
      const mins = Math.floor(diffMs / 60000);
      if (mins < 1) return "just now";
      if (mins < 60) return `${mins}m ago`;
      const hours = Math.floor(mins / 60);
      if (hours < 24) return `${hours}h ago`;
      return d.toLocaleDateString();
    } catch {
      return timestamp;
    }
  }

  function modelTooltip(models: string[] | undefined): string {
    if (!models || models.length === 0) return "";
    return models.join("\n");
  }
</script>

<div class="stack" style="margin-bottom: 1rem;">
  <div class="page-header">
    <div class="stack" style="gap: 0.2rem;">
      <h1>Providers</h1>
      <p class="muted">
        Configure OpenAI-compatible providers.
      </p>
    </div>
    <div class="stack" style="display: flex; flex-direction: row; gap: 0.5rem;">
      {#if !$loadingModels}
        <Button variant="ghost" on:click={refreshAllModels}>
          <Icon icon="tabler:refresh" /> Refresh Models
        </Button>
      {:else}
        <span class="muted">Refreshing...</span>
      {/if}
      <Button on:click={onCreateProvider}>
        <Icon icon="tabler:plus" /> New Provider
      </Button>
    </div>
  </div>
</div>

{#if $loadingProviders && $providers.length === 0}
  <p class="muted">Loading...</p>
{:else if $providers.length === 0}
  <p class="muted">No providers yet.</p>
{:else}
  <div class="table-wrap card">
    <table class="logs-table entity-table providers-table">
      <thead>
        <tr>
          <th>Name / Endpoint</th>
          <th>Kind / Default</th>
          <th>Models</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
          {#each $providers as provider}
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
                <Tag variant="ok">Default</Tag>
                </div>
              {:else}
                <div class="muted" style="margin-top: 0.35rem;">
                  Not default
                </div>
              {/if}
            </td>
            <td>
              <div class="models-cell" title={modelTooltip(provider.modelIds)}>
                {#if provider.modelCount && provider.modelCount > 0}
                  {provider.modelCount} model{provider.modelCount === 1 ? "" : "s"}
                {:else}
                  No data
                {/if}
              </div>
              <div class="muted" style="font-size: 0.78rem; margin-top: 0.25rem;">
                {formatLastRefresh(provider.lastModelRefreshAt)}
              </div>
            </td>
            <td>
              <div class="table-actions">
                <Button variant="ghost" on:click={() => onEditProvider(provider)}>
                  <Icon icon="tabler:pencil" /> Edit
                </Button>
                <Button
                  variant="danger"
                  on:click={() => onDeleteProvider(provider.id)}
                >
                  <Icon icon="tabler:trash-x" /> Delete
                </Button>
              </div>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/if}

<style>
  .models-cell {
    cursor: default;
    font-size: 0.88rem;
  }

  [title]:hover {
    position: relative;
  }
</style>
