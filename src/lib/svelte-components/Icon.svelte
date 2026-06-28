<script lang="ts">
  import Icon from "@iconify/svelte";

  export let icon: string;
  export let size = "1em";
</script>

<Icon {icon} width={size} height={size} />
