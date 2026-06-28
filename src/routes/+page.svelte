<script lang="ts">
  import { onMount, tick } from "svelte";

  import Tag from "$lib/svelte-components/Tag.svelte";

  import {
    statusTone,
    displayModelName,
    formatCompact,
    formatTokens,
    formatCost,
    formatLatency,
    formatTimeAgo,
    shortTimeLabel,
    toFiveMinuteBucket,
    readCssVar,
  } from "$lib/helpers";

  let stats: any = null;
  let timelineCanvas: HTMLCanvasElement | null = null;
  let timelineChart: any = null;
  let ChartCtor: any = null;
  let refreshTimer: ReturnType<typeof setInterval> | null = null;
  let chartTimer: ReturnType<typeof setInterval> | null = null;
  let loadingStats = false;
  let prevRequestIds = new Set<string>();
  let prevActiveKeys = new Set<string>();

  const LIVE_REFRESH_MS = 1000;
  const MAX_BUCKETS = 50;
  const BUCKET_MS = 5 * 60 * 1000;

  function chartRows() {
    const timeline = stats?.requestsTimeline;
    if (!Array.isArray(timeline) || timeline.length === 0) return [];

    const byBucket = new Map<
      string,
      { ok: number; warn: number; error: number; total: number }
    >();

    for (const item of timeline) {
      const bucket = toFiveMinuteBucket(String(item.hour_bucket || "unknown"));
      const status = Number(item.status_code || 0);
      const count = Number(item.request_count || 0);

      const row = byBucket.get(bucket) || {
        ok: 0,
        warn: 0,
        error: 0,
        total: 0,
      };
      if (status >= 500) row.error += count;
      else if (status >= 400) row.warn += count;
      else row.ok += count;
      row.total += count;
      byBucket.set(bucket, row);
    }

    const sorted = Array.from(byBucket.entries()).sort(
      (a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime(),
    );

    if (sorted.length === 0) return [];

    const nowMs = Date.now();
    const bucketedNow = new Date(nowMs);
    bucketedNow.setUTCSeconds(0, 0);
    bucketedNow.setUTCMinutes(Math.floor(bucketedNow.getUTCMinutes() / 5) * 5);
    const endTs = bucketedNow.getTime();
    const startTs = endTs - MAX_BUCKETS * BUCKET_MS;

    const filled: Array<{
      bucket: string;
      label: string;
      ok: number;
      warn: number;
      error: number;
      total: number;
    }> = [];

    for (let ts = startTs; ts <= endTs; ts += BUCKET_MS) {
      const key = toFiveMinuteBucket(new Date(ts).toISOString());
      const data = byBucket.get(key) ?? { ok: 0, warn: 0, error: 0, total: 0 };
      filled.push({
        bucket: key,
        label: shortTimeLabel(key),
        ...data,
      });
    }

    return filled;
  }

  function totalRequests() {
    if (stats?.summary?.request_count != null) {
      return Number(stats.summary.request_count) || 0;
    }

    if (!stats?.providerUsage?.length) return 0;
    return stats.providerUsage.reduce(
      (sum: number, row: { request_count: number }) =>
        sum + (row.request_count || 0),
      0,
    );
  }

  function totalTokens() {
    return Number(stats?.summary?.total_tokens || 0);
  }

  function totalCost() {
    return stats?.summary?.total_cost;
  }

  function activeProviders() {
    return stats?.providerUsage?.length || 0;
  }

  function activeModels() {
    return stats?.modelUsage?.length || 0;
  }

  function activeKey(active: any) {
    const provider = (active.providerName ?? "").toLowerCase();
    const model = (active.model ?? "").toLowerCase();
    const started = String(active.startedAt ?? "");
    return `${provider}::${model}::${started}`;
  }

  async function ensureChartLib() {
    if (ChartCtor) return;
    const mod = await import("chart.js/auto");
    ChartCtor = mod.default;
  }

  async function renderTimelineChart() {
    if (!timelineCanvas) return;

    const points = chartRows();
    if (!points.length) {
      if (timelineChart) {
        timelineChart.destroy();
        timelineChart = null;
      }
      return;
    }

    await ensureChartLib();

    const labels = points.map((row) => row.label);
    const textMuted = readCssVar("--secondaryText", "#9ca3af");
    const textPrimary = readCssVar("--primaryText", "#f3f4f6");
    const gridColor = readCssVar("--line", "rgba(255,255,255,0.1)");
    const success = readCssVar("--success", "#6dd67f");
    const warning = readCssVar("--warning", "#f5b342");
    const error = readCssVar("--error", "#ef6b6b");

    const datasets = [
      {
        label: "2xx/3xx",
        data: points.map((row) => row.ok),
        backgroundColor: success,
        borderWidth: 0,
        borderRadius: 3,
        borderSkipped: false,
        stack: "requests",
      },
      {
        label: "4xx",
        data: points.map((row) => row.warn),
        backgroundColor: warning,
        borderWidth: 0,
        borderRadius: 3,
        borderSkipped: false,
        stack: "requests",
      },
      {
        label: "5xx",
        data: points.map((row) => row.error),
        backgroundColor: error,
        borderWidth: 0,
        borderRadius: 3,
        borderSkipped: false,
        stack: "requests",
      },
    ];

    if (timelineChart) {
      timelineChart.data = { labels, datasets };
      timelineChart.update("none");
      return;
    }

    timelineChart = new ChartCtor(timelineCanvas, {
      type: "bar",
      data: {
        labels,
        datasets,
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: "index",
          intersect: true,
        },
        plugins: {
          legend: {
            position: "top",
            labels: {
              color: textPrimary,
              usePointStyle: true,
              pointStyle: "rect",
            },
          },
          tooltip: {
            backgroundColor: "rgba(9, 13, 18, 0.95)",
            titleColor: "#ffffff",
            bodyColor: "#d1d5db",
          },
        },
        scales: {
          x: {
            stacked: true,
            maxBarThickness: 16,
            categoryPercentage: 0.3,
            ticks: {
              color: textMuted,
              autoSkip: true,
              maxTicksLimit: 10,
            },
            grid: {
              color: gridColor,
            },
          },
          y: {
            stacked: true,
            beginAtZero: true,
            ticks: {
              color: textMuted,
              precision: 0,
            },
            grid: {
              color: gridColor,
            },
          },
        },
      },
    });
  }

  async function loadStats() {
    if (loadingStats) return;
    loadingStats = true;

    try {
      const statsRes = await fetch("/api/stats");
      if (!statsRes.ok) return;

      const newStats = await statsRes.json();
      const currentIds = new Set<string>();
      for (const row of newStats.recentRequests ?? []) {
        if (row.id) currentIds.add(row.id);
      }
      const newlyAdded = new Set<string>();
      for (const id of currentIds) {
        if (!prevRequestIds.has(id)) newlyAdded.add(id);
      }
      prevRequestIds = currentIds;

      stats = newStats;
      await tick();
      await renderTimelineChart();

      // Remove the "new" highlight once the animation has finished.
      setTimeout(() => {
        for (const id of newlyAdded) prevRequestIds.add(id + "_done");
      }, 400);
    } finally {
      loadingStats = false;
    }
  }

  function isNewRow(id: string): boolean {
    return !prevRequestIds.has(id) && !prevRequestIds.has(id + "_done");
  }

  function startTimers() {
    refreshTimer = setInterval(() => {
      void loadStats();
    }, LIVE_REFRESH_MS);

    // Continuously re-render the chart so the time window slides to "now"
    // even when no new data has arrived.
    chartTimer = setInterval(() => {
      void renderTimelineChart();
    }, LIVE_REFRESH_MS);
  }

  function stopTimers() {
    if (refreshTimer) {
      clearInterval(refreshTimer);
      refreshTimer = null;
    }
    if (chartTimer) {
      clearInterval(chartTimer);
      chartTimer = null;
    }
  }

  onMount(() => {
    void loadStats();
    startTimers();

    // Pause intervals when the tab is hidden, resume when visible again.
    const handleVisibility = () => {
      if (document.hidden) {
        stopTimers();
      } else {
        void loadStats();
        startTimers();
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      stopTimers();

      if (timelineChart) {
        timelineChart.destroy();
        timelineChart = null;
      }
    };
  });
</script>

<main>
  <div class="stack" style="margin-bottom: 1rem;">
    <h1>Dashboard</h1>
  </div>

  <div class="grid">
    {#if !stats}
      <section class="card span-12 stack">
        <p class="muted">Loading...</p>
      </section>
    {:else}
      <section class="span-12 top-stats" aria-label="Summary statistics">
        <article class="card stack">
          <div class="muted">Total Requests</div>
          <div class="stat-value">{formatCompact(totalRequests())}</div>
        </article>
        <article class="card stack">
          <div class="muted">Total Tokens</div>
          <div class="stat-value">{formatTokens(totalTokens())}</div>
        </article>
        <article class="card stack">
          <div class="muted">Total Cost</div>
          <div class="stat-value">{formatCost(totalCost())}</div>
        </article>
        <article class="card stack">
          <div class="muted">Providers in Use</div>
          <div class="stat-value">{activeProviders()}</div>
        </article>
        <article class="card stack">
          <div class="muted">Models Seen</div>
          <div class="stat-value">{activeModels()}</div>
        </article>
      </section>
    {/if}

    <div class="span-12" style="display:flex;flex-direction:column;gap:1rem">
      <h2>Request Trends</h2>

      {#if !chartRows().length}
        <p class="muted">No timeline data yet.</p>
      {:else}
        <div class="chart-panel card">
          <canvas bind:this={timelineCanvas} class="timeline-chart"></canvas>
        </div>
      {/if}
    </div>

    <div class="span-12" style="display:flex;flex-direction:column;gap:1rem">
      <h2>Request Logs</h2>
      {#if !stats?.recentRequests?.length && !stats?.activeRequests?.length}
        <p class="muted">No request logs yet.</p>
      {:else}
        <div class="table-wrap card">
          <table class="logs-table">
            <thead>
              <tr>
                <th>Key / Time</th>
                <th>Provider / Model</th>
                <th>Status</th>
                <th>Latency</th>
                <th>Tokens / Cost</th>
              </tr>
            </thead>
            <tbody>
              {#each stats.activeRequests as active (activeKey(active))}
                <tr class="running-row" data-new={isNewRow(String(active.startedAt + active.providerName + active.model))}>
                  <td class="active-cell">
                    <div class="cell-stack">
                      <div>{active.virtualKey || "—"}</div>
                      <div class="muted">now</div>
                    </div>
                  </td>
                  <td>
                    <div class="cell-stack">
                      <div>{active.providerName || "—"}</div>
                      <div class="muted">{displayModelName(active.model)}</div>
                    </div>
                  </td>
                  <td style="width: 120px;">
                    <div class="cell-stack">
                      <Tag variant="running">
                        <span class="running-spinner"></span>
                        Running
                      </Tag>
                      <div></div>
                    </div>
                  </td>
                  <td>
                    <div class="cell-stack">
                      <div>
                        <span class="running-latency"
                          >{formatLatency(Date.now() - active.startedAt)}</span
                        >
                      </div>
                      <div class="muted"></div>
                    </div>
                  </td>
                  <td style="width:160px">
                    <div class="cell-stack">
                      <div>— <span class="muted">tokens</span></div>
                      <div class="muted">—</div>
                    </div>
                  </td>
                </tr>
              {/each}
              {#each stats.recentRequests as row (row.id)}
                <tr data-new={isNewRow(row.id)}>
                  <td>
                    <div class="cell-stack">
                      <div>{row.key_name}</div>
                      <div class="muted">{formatTimeAgo(row.created_at)}</div>
                    </div>
                  </td>
                  <td>
                    <div class="cell-stack">
                      <div>{row.provider_name}</div>
                      {#if row.remapped_model && row.remapped_model !== row.model}
                        <span style="font-size:.85rem;white-space:nowrap" class="muted">{displayModelName(row.model)} &gt; {displayModelName(row.remapped_model)}</span>
                      {:else}
                        <div class="muted">{displayModelName(row.model)}</div>
                      {/if}
                    </div>
                  </td>
                  <td>
                    <div class="cell-stack">
                      <Tag variant={statusTone(row.status_code)}>
                        {row.status_code}
                      </Tag>
                      <div></div>
                    </div>
                  </td>
                  <td>
                    <div class="cell-stack">
                      <div>{formatLatency(row.duration_ms)}</div>
                      <div class="muted"></div>
                    </div>
                  </td>
                  <td style="width:160px">
                    <div class="cell-stack">
                      <div>{formatTokens(row.total_tokens)} <span class="muted">tokens</span></div>
                      <div class="muted">{formatCost(row.cost)}</div>
                    </div>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </div>
  </div>
</main>

<style>
  @keyframes row-in {
    from {
      opacity: 0;
      transform: scaleY(0.6);
    }
    to {
      opacity: 1;
      transform: scaleY(1);
    }
  }

  tr[data-new] {
    animation: row-in 300ms ease-out forwards;
    transform-origin: top center;
  }
</style>
