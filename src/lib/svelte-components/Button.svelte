<script lang="ts">
  export let variant: "primary" | "ghost" | "danger" | "alt" = "primary";
  export let disabled = false;
  export let type: "button" | "submit" | "reset" = "button";
</script>

<button class="btn {variant}" {type} {disabled} on:click>
  <slot />
</button>

<style lang="css">
  .btn {
    font-family: inherit;
    font-weight: 600;
    border-radius: 0.5rem;
    padding: 0.5rem 1rem;
    cursor: pointer;
    transition:
      transform 110ms ease-out,
      filter 110ms ease-out,
      background-color 0.2s ease-in-out,
      border-color 0.2s ease-in-out,
      color 0.2s ease-in-out;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    text-decoration: none;
  }

  .btn:not(:disabled):hover {
    opacity: 0.85;
    filter: brightness(1.02);
  }

  .btn:not(:disabled):active {
    transform: scale(0.97);
    filter: brightness(1.04);
    transition-duration: 50ms;
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Primary */
  .primary {
    background-color: color-mix(in srgb, var(--accent) 24%, transparent);
    border: 1px solid color-mix(in srgb, var(--line) 65%, var(--glass-border));
    border-color: color-mix(in srgb, var(--accent) 55%, var(--line));
    color: var(--primaryText);
  }

  .primary:not(:disabled):hover {
    background-color: color-mix(in srgb, var(--accent) 30%, transparent);
    border-color: color-mix(in srgb, var(--accent) 75%, var(--line));
  }

  /* Alt */
  .alt {
    background-color: color-mix(in srgb, var(--paper-soft) 60%, transparent);
    border: 1px solid color-mix(in srgb, var(--line) 70%, var(--glass-border));
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    color: var(--ink);
  }

  .alt:not(:disabled):hover {
    background-color: color-mix(in srgb, var(--paper-soft) 80%, transparent);
    border-color: color-mix(in srgb, var(--line) 95%, var(--glass-border));
  }

  /* Ghost */
  .ghost {
    background-color: color-mix(in srgb, var(--paper-soft) 46%, transparent);
    border: 1px solid color-mix(in srgb, var(--line) 65%, var(--glass-border));
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    color: var(--ink);
  }

  .ghost:not(:disabled):hover {
    background-color: color-mix(in srgb, var(--paper-soft) 60%, transparent);
    border-color: color-mix(in srgb, var(--line) 90%, var(--glass-border));
  }

  /* Danger */
  .danger {
    background-color: color-mix(in srgb, var(--error) 35%, transparent);
    border: 1px solid color-mix(in srgb, var(--error) 75%, var(--line));
    color: white;
  }

  .danger:not(:disabled):hover {
    background-color: color-mix(in srgb, var(--error) 40%, transparent);
    border-color: color-mix(in srgb, var(--error) 90%, var(--line));
  }
</style>
