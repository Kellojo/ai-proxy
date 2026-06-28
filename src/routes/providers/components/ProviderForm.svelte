<script lang="ts">
  import type { ProviderForm, ProviderKind } from "../types";
  import { getDefaultEndpoint, PROVIDER_KINDS } from "../types";

  export let formData: ProviderForm;
  export let onFieldChange: (formData: ProviderForm) => void;
  export let isEdit: boolean;

  function onKindChange(newKind: ProviderKind): void {
    formData.kind = newKind;
    const defaultUrl = getDefaultEndpoint(newKind);
    if (defaultUrl) {
      formData.endpointUrl = defaultUrl;
    }
    onFieldChange(formData);
  }
</script>

<div class="form-grid">
  <div>
    <label for="provider-name">Name</label>
    <input
      id="provider-name"
      bind:value={formData.name}
      placeholder="Main OpenAI"
      oninput={() => onFieldChange(formData)}
    />
  </div>
  <div>
    <label for="provider-kind">Kind</label>
    <select id="provider-kind" bind:value={formData.kind} onchange={() => onKindChange(formData.kind)}>
      {#each PROVIDER_KINDS as kindOption}
        <option value={kindOption.value}>{kindOption.label}</option>
      {/each}
    </select>
  </div>
  <div>
    <label for="provider-endpoint">Endpoint URL</label>
    <input
      id="provider-endpoint"
      bind:value={formData.endpointUrl}
      disabled={formData.kind !== 'openai-compatible'}
      placeholder="https://api.openai.com"
      oninput={() => onFieldChange(formData)}
    />
  </div>
  <div>
    <label for="provider-apikey">{#if isEdit}API Key / Token (optional){:else}API Key / Token{/if}</label>
    <input
      id="provider-apikey"
      bind:value={formData.apiKey}
      type="password"
      placeholder={isEdit ? "Leave blank to keep existing key" : "sk-..."}
      oninput={() => onFieldChange(formData)}
    />
  </div>
  <div>
    <label>
      <input
        type="checkbox"
        bind:checked={formData.isDefault}
        style="width:auto;"
        onchange={() => onFieldChange(formData)}
      /> Default provider</label
    >
  </div>
</div>
