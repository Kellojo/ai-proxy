<script lang="ts">
  import { error } from "../providers-store";
  import Button from "$lib/svelte-components/Button.svelte";

  function dismissError(): void {
    error.set("");
  }
</script>

{#if $error}
  <div class="error" role="alert">
    <span>{$error}</span>
    <Button variant="danger" on:click={dismissError}>&times;</Button>
  </div>
{/if}
