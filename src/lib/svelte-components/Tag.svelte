<script lang="ts">
  type TagVariant = "ok" | "warn" | "error" | "running" | "neutral";

  const { variant = "ok" } = $props<{ variant: TagVariant }>();
</script>

<span class="tag {variant}"><slot /></span>

<style>
  .tag {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 56px;
    border-radius: 999px;
    padding: 0.15rem 0.55rem;
    border: 1px solid var(--line);
    font-size: 0.8rem;
    font-weight: 600;
  }

  .ok {
    color: color-mix(in srgb, var(--success) 72%, #ffffff 28%);
    border-color: color-mix(in srgb, var(--success) 48%, transparent);
    background: color-mix(in srgb, var(--success) 16%, transparent);
  }

  .warn {
    color: color-mix(in srgb, var(--warning) 72%, #ffffff 28%);
    border-color: color-mix(in srgb, var(--warning) 48%, transparent);
    background: color-mix(in srgb, var(--warning) 16%, transparent);
  }

  .error {
    color: color-mix(in srgb, var(--error) 72%, #ffffff 28%);
    border-color: color-mix(in srgb, var(--error) 48%, transparent);
    background: color-mix(in srgb, var(--error) 16%, transparent);
  }

  .running {
    position: relative;
    color: color-mix(in srgb, var(--info) 72%, #ffffff 28%);
    border-color: color-mix(in srgb, var(--info) 48%, transparent);
    background: color-mix(in srgb, var(--info) 16%, transparent);
    animation: running-bubble-glow 2s ease-in-out infinite;
  }

  .neutral {
    color: var(--primaryText);
    border-color: var(--line);
    background: color-mix(in srgb, var(--line) 60%, transparent);
  }

  @keyframes running-bubble-glow {
    0%,
    100% {
      box-shadow: 0 0 6px -1px rgba(var(--info-rgb, 89 130 247), 0.2);
    }
    50% {
      box-shadow:
        0 0 12px 1px rgba(var(--info-rgb, 89 130 247), 0.4),
        0 0 24px -2px rgba(var(--info-rgb, 89 130 247), 0.25);
    }
  }
</style>
