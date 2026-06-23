<script lang="ts">
  import type { ProviderForm } from "../types";

  export let formData: ProviderForm;
  export let onFieldChange: (formData: ProviderForm) => void;
  export let isEdit: boolean;
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
    <select id="provider-kind" bind:value={formData.kind} onchange={() => onFieldChange(formData)}>
      <option value="openai">OpenAI</option>
      <option value="anthropic">Anthropic</option>
      <option value="other">Other OpenAI-like</option>
    </select>
  </div>
  <div>
    <label for="provider-endpoint">Endpoint URL</label>
    <input
      id="provider-endpoint"
      bind:value={formData.endpointUrl}
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
  <div>
    <label>
      <input
        type="checkbox"
        bind:checked={formData.wolEnabled}
        style="width:auto;"
        onchange={() => onFieldChange(formData)}
      /> Send Wake-on-LAN before requests</label
    >
  </div>

  {#if formData.wolEnabled}
    <div>
      <label for="provider-wol-mac">WOL MAC</label>
      <input
        id="provider-wol-mac"
        bind:value={formData.wolMac}
        placeholder="00:11:22:33:44:55"
        oninput={() => onFieldChange(formData)}
      />
    </div>
    <div>
      <label for="provider-wol-broadcast">WOL Broadcast</label>
      <input
        id="provider-wol-broadcast"
        bind:value={formData.wolBroadcast}
        oninput={() => onFieldChange(formData)}
      />
    </div>
    <div>
      <label for="provider-wol-port">WOL Port</label>
      <input
        id="provider-wol-port"
        bind:value={formData.wolPort}
        type="number"
        onchange={() => onFieldChange(formData)}
      />
    </div>
  {/if}
</div>
