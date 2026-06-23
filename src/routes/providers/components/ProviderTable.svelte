<script lang="ts">
  import {
    providers,
    loadingProviders,
    formatDuration,
    modelPreview,
    cacheTooltip,
  } from "../providers-store";
  import type { Provider } from "../types";

  export let onEditProvider: (provider: Provider) => void;
  export let onDeleteProvider: (id: string) => void;
  export let onClearCache: () => void;
  export let onCreateProvider: () => void;
</script>

<div class="stack" style="margin-bottom: 1rem;">
  <div class="page-header">
    <div class="stack" style="gap: 0.2rem;">
      <h1>Providers</h1>
      <p class="muted">
        Configure OpenAI, Anthropic, and OpenAI-compatible providers.
      </p>
    </div>
    <div class="stack" style="display: flex; flex-direction: row; gap: 0.5rem;">
      <button class="ghost" onclick={onClearCache}>Clear Cache</button>
      <button onclick={onCreateProvider}>New Provider</button>
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
          <th>Wake-on-LAN</th>
          <th>Model Cache / Models</th>
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
                >
                  {provider.wolMac} via {provider.wolBroadcast}:{provider.wolPort}
                </span>
              {:else}
                <span class="muted">Disabled</span>
              {/if}
            </td>
            <td>
              {#if provider.modelCache}
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
                <button class="ghost" onclick={() => onEditProvider(provider)}
                  >Edit</button
                >
                <button
                  class="danger"
                  onclick={() => onDeleteProvider(provider.id)}>Delete</button
                >
              </div>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/if}
