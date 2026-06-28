<script lang="ts">
  import "../app.css";
  import "../toasts.css";
  import { Toaster } from "svelte-sonner";
  import Navbar from "$lib/svelte-components/Navbar.svelte";
  import Icon from "$lib/svelte-components/Icon.svelte";
  import { page } from "$app/state";

  // @ts-ignore
  const version = __VERSION__;
</script>

<Navbar title="AI Proxy" {version}>
  <svelte:fragment slot="links">
    <a href="/" class:active={page.url.pathname === "/"} title="Dashboard">
      <Icon icon="solar:chart-bold-duotone" />
      Dashboard
    </a>
    <a
      href="/providers"
      class:active={page.url.pathname.startsWith("/providers")}
      title="Providers"
    >
      <Icon icon="mynaui:api-solid" />
      Providers
    </a>
    <a
      href="/model-mappings"
      class:active={page.url.pathname.startsWith("/model-mappings")}
      title="Model Mappings"
    >
      <Icon icon="weui:setting-filled" />
      Model Mappings
    </a>
    <a
      href="/virtual-keys"
      class:active={page.url.pathname.startsWith("/virtual-keys")}
      title="Virtual Keys"
    >
      <Icon icon="tabler:key-filled" />
      Virtual Keys
    </a>
    <a
      href="/docs"
      class:active={page.url.pathname.startsWith("/docs")}
      title="Get Started"
    >
      <Icon icon="material-symbols:book" />
      Get Started
    </a>
    <a
      href="https://github.com/Kellojo/ai-proxy"
      target="_blank"
      rel="noopener noreferrer"
      title="GitHub"
    >
      <Icon icon="tabler:brand-github" />
    </a>
  </svelte:fragment>
</Navbar>

<slot />
<Toaster
  position="bottom-center"
  toastOptions={{ unstyled: true, class: "toast" }}
/>
