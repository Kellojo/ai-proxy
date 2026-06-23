<script lang="ts">
  import { toast, error } from "../providers-store";

  function dismissError(): void {
    error.set("");
  }
</script>

<div class="toast-container">
  {#if $toast}
    <div class="mini-toast">{$toast}</div>
  {/if}
</div>
{#if $error}
  <div class="error" role="alert">
    <span>{$error}</span>
    <button class="ghost danger" onclick={dismissError}>&times;</button>
  </div>
{/if}

<style>
  .toast-container {
    position: fixed;
    top: 1rem;
    right: 1rem;
    z-index: 9999;
    pointer-events: none;
  }

  .mini-toast {
    pointer-events: auto;
  }
</style>
