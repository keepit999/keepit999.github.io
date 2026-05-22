const endpointProfiles = {
  standard: {
    label: "Cloudflare Edge",
    latency: "https://speed.cloudflare.com/cdn-cgi/trace",
    download: "https://speed.cloudflare.com/__down",
    upload: "https://speed.cloudflare.com/__up",
    quickDownBytes: 25000000,
    deepDownBytes: 12000000,
    quickUpBytes: 6000000,
    deepUpBytes: 3500000
  },
  accuracy: {
    label: "Cloudflare Edge - Accuracy",
    latency: "https://speed.cloudflare.com/cdn-cgi/trace",
    download: "https://speed.cloudflare.com/__down",
    upload: "https://speed.cloudflare.com/__up",
    quickDownBytes: 25000000,
    deepDownBytes: 18000000,
    quickUpBytes: 6000000,
    deepUpBytes: 4500000
  }
};

const testModes = {
  instant: {
    label: "Quick Test",
    latencySamples: 3,
    latencyDelay: 0,
    downloadBursts: 1,
    uploadBursts: 1,
    downloadDuration: 2000,
    uploadDuration: 2000
  },

  quick: {
    label: "Start Test",
    latencySamples: 8,
    latencyDelay: 0,
    downloadBursts: 1,
    uploadBursts: 1,
    downloadDuration: 8000,
    uploadDuration: 8000
  },

  deep: {
    label: "Deep Test",
    latencySamples: 40,
    latencyDelay: 120,
    downloadBursts: 4,
    uploadBursts: 3,
    downloadDuration: 12000,
    uploadDuration: 10000
  }
};

const state = {
  running: false,
  mode: "quick",
  ping: null,
  jitter: null,
  download: null,
  upload: null,
  score: null,
  stability: null,
  loss: null,
  grade: null,
  gradeText: null,
  pingSamples: [],
  failedSamples: 0,
  downloadBursts: [],
  uploadBursts: [],
  loadedPing: null,
  bufferbloat: null,
  useCases: {},
  radarTick: 0
};

const els = {
  start: document.querySelector("#startTest"),
  quick: document.querySelector("#quickTest"),
  deep: document.querySelector("#deepTest"),
  reset: document.querySelector("#resetTest"),
  endpointDisplay: document.querySelector("#currentEndpoint"),
  status: document.querySelector("#testStatus"),
  fit: document.querySelector("#fitLabel"),
  score: document.querySelector("#overallScore"),
  log: document.querySelector("#logList"),
  canvas: document.querySelector("#radarCanvas"),
  graph: document.querySelector("#latencyGraph"),
  grade: document.querySelector("#gradeValue"),
  gradeText: document.querySelector("#gradeText"),
  stability: document.querySelector("#stabilityValue"),
  loss: document.querySelector("#lossValue"),
  range: document.querySelector("#rangeValue"),
  sampleCount: document.querySelector("#sampleCount"),
  recommendations: document.querySelector("#recommendationsList"),
  copy: document.querySelector("#copyResults"),
  weatherBadge: document.querySelector("#weatherBadge"),
  weatherValue: document.querySelector("#weatherValue"),
  problemText: document.querySelector("#problemText"),
  loadedPing: document.querySelector("#loadedPingValue"),
  bufferbloat: document.querySelector("#bufferbloatValue"),
  achievements: document.querySelector("#achievementList"),
  useCaseLabel: document.querySelector("#useCaseLabel"),
  history: document.querySelector("#historyList"),
  comparison: document.querySelector("#comparisonText"),
  copySupport: document.querySelector("#copySupport"),
  useCases: {
    streaming: document.querySelector("#caseStreaming"),
    calls: document.querySelector("#caseCalls"),
    gaming: document.querySelector("#caseGaming"),
    cloud: document.querySelector("#caseCloud"),
    work: document.querySelector("#caseWork"),
    downloads: document.querySelector("#caseDownloads")
  }
};

const ctx = els.canvas.getContext("2d");
const graphCtx = els.graph.getContext("2d");

function setText(id, value) {
  document.querySelector(`#${id}`).textContent = value;
}

function setBar(id, percent) {
  document.querySelector(`#${id}`).style.width = `${Math.max(0, Math.min(100, percent))}%`;
}

function badge(id, label, tone) {
  const el = document.querySelector(`#${id}`);
  el.textContent = label;
  el.style.color = tone;
}

function log(message) {
  if (els.log.children.length === 1 && els.log.children[0].textContent.includes("Waiting")) {
    els.log.innerHTML = "";
  }
  const item = document.createElement("li");
  item.textContent = message;
  els.log.prepend(item);
  while (els.log.children.length > 8) {
    els.log.lastElementChild.remove();
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function standardDeviation(values) {
  if (values.length < 2) return 0;
  const avg = average(values);
  const variance = average(values.map((value) => (value - avg) ** 2));
  return Math.sqrt(variance);
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function quality(value, good, okay, lowerIsBetter = true) {
  if (value == null || Number.isNaN(value)) return { label: "blocked", tone: "var(--steel)", className: "bad" };
  const isGood = lowerIsBetter ? value <= good : value >= good;
  const isOkay = lowerIsBetter ? value <= okay : value >= okay;
  if (isGood) return { label: "elite", tone: "var(--green)", className: "good" };
  if (isOkay) return { label: "doable", tone: "var(--amber)", className: "warn" };
  return { label: "rough", tone: "var(--red)", className: "bad" };
}

function clampScore(value, best, worst, lowerIsBetter = true) {
  if (value == null || Number.isNaN(value)) return 0;
  const raw = lowerIsBetter
    ? (worst - value) / (worst - best)
    : (value - worst) / (best - worst);
  return Math.max(0, Math.min(100, raw * 100));
}

function getProfileForMode(mode) {
  return mode === "deep" ? endpointProfiles.accuracy : endpointProfiles.standard;
}

function cacheBust(url) {
  return `${url}${url.includes("?") ? "&" : "?"}cacheBust=${Date.now()}-${Math.random()}`;
}

async function timedFetch(url, options = {}) {
  const start = performance.now();
  const response = await fetch(cacheBust(url), { cache: "no-store", ...options });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  await response.arrayBuffer();
  return performance.now() - start;
}

function updateUI() {
  if (state.ping != null) {
    const q = quality(state.ping, 35, 75);
    setText("pingValue", Math.round(state.ping));
    setBar("pingBar", clampScore(state.ping, 10, 150));
    badge("pingBadge", q.label, q.tone);
  }
  if (state.jitter != null) {
    const q = quality(state.jitter, 8, 22);
    setText("jitterValue", Math.round(state.jitter));
    setBar("jitterBar", clampScore(state.jitter, 1, 60));
    badge("jitterBadge", q.label, q.tone);
  }
  if (state.download != null) {
    const q = quality(state.download, 75, 25, false);
    setText("downloadValue", state.download.toFixed(1));
    setBar("downloadBar", clampScore(state.download, 150, 5, false));
    badge("downloadBadge", q.label, q.tone);
  }
  if (state.upload != null) {
    const q = quality(state.upload, 20, 8, false);
    setText("uploadValue", state.upload.toFixed(1));
    setBar("uploadBar", clampScore(state.upload, 60, 1, false));
    badge("uploadBadge", q.label, q.tone);
  }
  updateReadiness();
  updateDiagnostics();
  drawLatencyGraph();
}

function updateReadiness() {
  const pingScore = clampScore(state.ping, 12, 140);
  const jitterScore = clampScore(state.jitter, 2, 55);
  const downScore = clampScore(state.download, 120, 8, false);
  const upScore = clampScore(state.upload, 40, 2, false);
  const stabilityScore = state.stability ?? 0;
  
  const available = [];
  if (state.ping != null) available.push(pingScore);
  if (state.jitter != null) available.push(jitterScore);
  if (state.download != null) available.push(downScore);
  if (state.upload != null) available.push(upScore);
  if (state.stability != null) available.push(stabilityScore);

  state.score = available.length ? Math.round(available.reduce((a, b) => a + b, 0) / available.length) : null;
  els.score.textContent = state.score ?? "--";

  if (state.score == null) return;

  const fps = Math.round(pingScore * 0.48 + jitterScore * 0.28 + stabilityScore * 0.16 + upScore * 0.08);
  const battle = Math.round(pingScore * 0.3 + jitterScore * 0.22 + stabilityScore * 0.2 + downScore * 0.16 + upScore * 0.12);
  const stream = Math.round(downScore * 0.3 + upScore * 0.28 + jitterScore * 0.18 + stabilityScore * 0.16 + pingScore * 0.08);
  const watch = Math.round(downScore * 0.56 + stabilityScore * 0.18 + jitterScore * 0.14 + pingScore * 0.08 + upScore * 0.04);
  const uhd = Math.round(downScore * 0.68 + stabilityScore * 0.18 + jitterScore * 0.1 + pingScore * 0.04);
  const call = Math.round(upScore * 0.38 + jitterScore * 0.25 + stabilityScore * 0.2 + pingScore * 0.12 + downScore * 0.05);

  setReadiness("watch", watch, "HD video streaming");
  setReadiness("uhd", uhd, "4K movies and shows");
  setReadiness("call", call, "Clear video calls");
  setReadiness("fps", fps, "Low-latency duels and ranked lobbies");
  setReadiness("battle", battle, "Large lobbies and voice chat stability");
  setReadiness("stream", stream, "Co-op, party chat, and stream sharing");

  els.fit.textContent = state.score >= 82 ? "Everything" : state.score >= 62 ? "Most things" : "Needs tuning";
}

function setReadiness(prefix, score, label) {
  const dot = document.querySelector(`#${prefix}Dot`);
  const text = document.querySelector(`#${prefix}Text`);
  dot.className = "dot";
  if (score >= 78) {
    dot.classList.add("good");
    text.textContent = `${label}: Strong (${score}/100).`;
  } else if (score >= 55) {
    dot.classList.add("warn");
    text.textContent = `${label}: Doable with possible spikes (${score}/100).`;
  } else {
    dot.classList.add("bad");
    text.textContent = `${label}: Likely to feel unstable (${score}/100).`;
  }
}

function updateDiagnostics() {
  els.sampleCount.textContent = `${state.pingSamples.length} samples`;
  if (!state.pingSamples.length) return;

  const best = Math.min(...state.pingSamples);
  const worst = Math.max(...state.pingSamples);
  els.stability.textContent = state.stability == null ? "--" : `${Math.round(state.stability)}/100`;
  els.loss.textContent = state.loss == null ? "--" : `${state.loss.toFixed(1)}%`;
  els.range.textContent = `${Math.round(best)} / ${Math.round(worst)} ms`;

  const score = state.score ?? 0;
  if (score >= 90) {
    state.grade = "A+";
    state.gradeText = "Excellent connection quality.";
  } else if (score >= 82) {
    state.grade = "A";
    state.gradeText = "Great for streaming, calls, and gaming.";
  } else if (score >= 70) {
    state.grade = "B";
    state.gradeText = "Good, with occasional limits possible.";
  } else if (score >= 55) {
    state.grade = "C";
    state.gradeText = "Usable, but stability may vary.";
  } else {
    state.grade = "D";
    state.gradeText = "Likely to feel unreliable.";
  }
  els.grade.textContent = state.grade;
  els.gradeText.textContent = state.gradeText;
  updateInsights();
  renderRecommendations();
}

function updateInsights() {
  const loaded = state.loadedPing;
  const bloat = state.bufferbloat;
  els.loadedPing.textContent = loaded == null ? "--" : `${Math.round(loaded)} ms`;
  els.bufferbloat.textContent = bloat == null ? "--" : `${bloat >= 0 ? "+" : ""}${Math.round(bloat)} ms`;

  const weather = networkWeather();
  els.weatherBadge.textContent = weather.badge;
  els.weatherValue.textContent = weather.title;
  els.problemText.textContent = weather.problem;

  const scores = useCaseScores();
  state.useCases = scores;
  let readyCount = 0;
  Object.entries(scores).forEach(([key, value]) => {
    if (value >= 78) readyCount += 1;
    els.useCases[key].textContent = Math.round(value);
    els.useCases[key].style.color = value >= 78 ? "var(--green)" : value >= 55 ? "var(--amber)" : "var(--red)";
  });
  els.useCaseLabel.textContent = `${readyCount} ready`;
  renderAchievements();
}

function renderAchievements() {
  const badges = [];
  if ((state.loss ?? 1) === 0 && state.pingSamples.length) badges.push("Zero Loss");
  if ((state.score ?? 0) >= 90) badges.push("Fiber Feeling");
  if ((state.useCases.streaming ?? 0) >= 82) badges.push("Streamer Ready");
  if ((state.useCases.gaming ?? 0) >= 82) badges.push("No Lag Detected");
  if (state.mode === "deep" && state.score != null) badges.push("Deep Scan Complete");
  if ((state.bufferbloat ?? 999) <= 25) badges.push("Low Load Lag");
  els.achievements.innerHTML = badges.length
    ? badges.map((badgeName) => `<span>${badgeName}</span>`).join("")
    : "<span>Badges appear after a scan</span>";
}

function networkWeather() {
  if ((state.loss ?? 0) > 5) {
    return {
      badge: "Stormy",
      title: "Stormy Connection",
      problem: "Likely packet loss or request failures. Wi-Fi, VPNs, or router congestion may be involved."
    };
  }
  if ((state.bufferbloat ?? 0) > 80) {
    return {
      badge: "Heavy Load",
      title: "Bufferbloat Detected",
      problem: "Latency rises sharply while the line is busy. Calls and games may lag during downloads."
    };
  }
  if ((state.jitter ?? 0) > 28) {
    return {
      badge: "Static",
      title: "Light Static",
      problem: "Speed may be fine, but ping is moving around enough to affect real-time apps."
    };
  }
  if ((state.score ?? 0) >= 85) {
    return {
      badge: "Clear",
      title: "Clear Skies",
      problem: "No major issues detected in this scan."
    };
  }
  return {
    badge: "Mixed",
    title: "Mixed Conditions",
    problem: "Connection is usable, but at least one metric may limit heavier tasks."
  };
}

function useCaseScores() {
  const pingScore = clampScore(state.ping, 12, 140);
  const jitterScore = clampScore(state.jitter, 2, 55);
  const downScore = clampScore(state.download, 120, 8, false);
  const upScore = clampScore(state.upload, 40, 2, false);
  const stabilityScore = state.stability ?? 0;
  const bloatScore = state.bufferbloat == null ? 75 : clampScore(state.bufferbloat, 5, 130);

  return {
    streaming: downScore * 0.62 + stabilityScore * 0.22 + jitterScore * 0.16,
    calls: upScore * 0.35 + jitterScore * 0.25 + pingScore * 0.2 + stabilityScore * 0.2,
    gaming: pingScore * 0.42 + jitterScore * 0.28 + stabilityScore * 0.2 + bloatScore * 0.1,
    cloud: pingScore * 0.3 + jitterScore * 0.22 + downScore * 0.22 + stabilityScore * 0.16 + bloatScore * 0.1,
    work: stabilityScore * 0.32 + downScore * 0.24 + upScore * 0.22 + jitterScore * 0.22,
    downloads: downScore * 0.86 + stabilityScore * 0.14
  };
}

function renderRecommendations() {
  const advice = [];
  if ((state.loss ?? 0) > 2) {
    advice.push("Packet loss estimate is elevated. Check Wi-Fi signal, VPNs, or router congestion.");
  }
  if ((state.jitter ?? 0) > 22) {
    advice.push("Jitter is high. Real-time calls and games may feel inconsistent.");
  }
  if ((state.ping ?? 0) > 80) {
    advice.push("Ping is high. Try a closer network endpoint or reduce background traffic.");
  }
  if ((state.download ?? 0) < 25) {
    advice.push("Download speed may limit 4K streaming or large downloads.");
  }
  if ((state.upload ?? 0) < 8) {
    advice.push("Upload speed may affect video calls, livestreaming, and file sharing.");
  }
  if ((state.bufferbloat ?? 0) > 80) {
    advice.push("Loaded ping is much higher than idle ping. Router quality-of-service settings may help.");
  }
  if ((state.loadedPing ?? 0) > 120) {
    advice.push("Connection may feel slow while downloads are active, even if raw speed looks good.");
  }
  if ((state.stability ?? 0) >= 82 && (state.score ?? 0) >= 82) {
    advice.push("Connection looks strong and stable across the measured samples.");
  }
  if (!advice.length) {
    advice.push("No major issues detected. Deep Test can still reveal short connection spikes.");
  }
  els.recommendations.innerHTML = advice.map((item) => `<li>${item}</li>`).join("");
}

async function measureLatency(config, profile) {
  const results = [];
  let failed = 0;
  for (let i = 0; i < config.latencySamples; i += 1) {
    els.status.textContent = `Checking ping ${i + 1}/${config.latencySamples}`;
    try {
      const sample = await timedFetch(profile.latency);
      results.push(sample);
      state.pingSamples = [...results];
      drawLatencyGraph();
    } catch {
      failed += 1;
      log(`Ping sample ${i + 1} was blocked.`);
    }
    if (config.latencyDelay) {
      await sleep(config.latencyDelay);
    }
  }
  if (!results.length) {
    throw new Error("Latency endpoint blocked");
  }

  const jitter = results.reduce((sum, value, index) => {
    if (index === 0) return 0;
    return sum + Math.abs(value - results[index - 1]);
  }, 0) / Math.max(1, results.length - 1);
  const deviation = standardDeviation(results);
  state.ping = median(results);
  state.jitter = jitter;
  state.failedSamples = failed;
  state.loss = (failed / config.latencySamples) * 100;
  state.stability = Math.round(
    clampScore(jitter, 2, 55) * 0.55 +
    clampScore(deviation, 3, 75) * 0.3 +
    clampScore(state.loss, 0, 12) * 0.15
  );
  log(`Ping settled at ${Math.round(state.ping)} ms with ${Math.round(jitter)} ms jitter.`);
}

async function measureDownload(config, profile) {
  els.status.textContent = "Testing download...";
  const concurrentStreams = state.mode === "deep" ? 6 : 4;
  const testDuration = config.downloadDuration;
  const bytes = 25000000; 
  
  const start = performance.now();
  let keepRunning = true;
  let lastUIUpdate = 0;
  
  const permanentLoaded = new Array(concurrentStreams).fill(0);
  const streamLoaded = new Array(concurrentStreams).fill(0);
  const activeXHRs = [];

  const fetchStream = (i) => {
    return new Promise((resolve) => {
      if (!keepRunning) return resolve();
      
      const xhr = new XMLHttpRequest();
      activeXHRs[i] = xhr;
      xhr.open("GET", cacheBust(`${profile.download}?bytes=${bytes}`));
      xhr.responseType = "arraybuffer"; 
      
      xhr.onprogress = (e) => {
        streamLoaded[i] = e.loaded;
        
        const now = performance.now();
        if (now - lastUIUpdate > 100) { 
          lastUIUpdate = now;
          const elapsed = (now - start) / 1000;
          if (elapsed > 0.5) {
            const current = streamLoaded.reduce((a, b) => a + b, 0);
            const permanent = permanentLoaded.reduce((a, b) => a + b, 0);
            state.download = ((current + permanent) * 8) / elapsed / 1000000;
            updateUI();
          }
        }
      };
      
      xhr.onload = xhr.onerror = () => {
        permanentLoaded[i] += streamLoaded[i];
        streamLoaded[i] = 0;
        if (keepRunning) {
          fetchStream(i).then(resolve);
        } else {
          resolve();
        }
      };
      
      xhr.onabort = resolve;
      xhr.send();
    });
  };

  const tasks = Array.from({ length: concurrentStreams }, (_, i) => fetchStream(i));

  await new Promise(resolve => setTimeout(resolve, testDuration));
  
  keepRunning = false;
  activeXHRs.forEach(xhr => xhr && xhr.abort());
  await Promise.allSettled(tasks);

  const finalElapsed = (performance.now() - start) / 1000;
  const current = streamLoaded.reduce((a, b) => a + b, 0);
  const permanent = permanentLoaded.reduce((a, b) => a + b, 0);
  state.download = ((current + permanent) * 8) / finalElapsed / 1000000;
  updateUI();
  
  log(`Download average: ${state.download.toFixed(1)} Mbps.`);
}

async function measureUpload(config, profile) {
  els.status.textContent = "Testing upload...";
  const concurrentStreams = state.mode === "deep" ? 8 : 6;
  const testDuration = config.uploadDuration;
  
  const payloadSize = 1000000; 
  const payload = new Uint8Array(payloadSize);
  for(let i=0; i<payloadSize; i+=10000) payload[i] = Math.random() * 255;
  
  let totalUploaded = 0;
  const start = performance.now();
  let keepRunning = true;
  let lastUIUpdate = 0;

  const pushStream = async () => {
    while (keepRunning) {
      try {
        const response = await fetch(cacheBust(profile.upload), {
          method: "POST",
          cache: "no-store",
          body: payload
        });
        
        if (response.ok) {
          totalUploaded += payloadSize;

          const now = performance.now();
          if (now - lastUIUpdate > 100) {
            lastUIUpdate = now;
            const elapsed = (now - start) / 1000;
            if (elapsed > 0.5) {
              state.upload = (totalUploaded * 8) / elapsed / 1000000;
              updateUI();
            }
          }
        }
      } catch (e) {
      }
    }
  };

  const tasks = Array.from({ length: concurrentStreams }, () => pushStream());

  await new Promise(resolve => setTimeout(resolve, testDuration));
  
  keepRunning = false; 
  await Promise.allSettled(tasks);

  const finalElapsed = (performance.now() - start) / 1000;
  state.upload = (totalUploaded * 8) / finalElapsed / 1000000;
  updateUI();
  
  log(`Upload average: ${state.upload.toFixed(1)} Mbps.`);
}

async function measureLoadedPing(profile) {
  els.status.textContent = "Testing loaded ping";
  const bytes = Math.max(profile.deepDownBytes, 14000000);
  let downloading = true;
  const downloadTask = fetch(cacheBust(`${profile.download}?bytes=${bytes}`), { cache: "no-store" })
    .then(async (response) => {
      if (!response.ok) throw new Error("Loaded download blocked");
      const reader = response.body?.getReader();
      if (!reader) {
        await response.arrayBuffer();
        return;
      }
      while (true) {
        const { done } = await reader.read();
        if (done) break;
      }
    })
    .finally(() => {
      downloading = false;
    });

  const loadedSamples = [];
  for (let i = 0; i < 10; i += 1) {
    if (!downloading && loadedSamples.length >= 4) break;
    try {
      loadedSamples.push(await timedFetch(profile.latency));
    } catch {
      state.failedSamples += 1;
    }
    await sleep(140);
  }
  await downloadTask.catch(() => {});
  if (!loadedSamples.length) {
    log("Loaded ping check was blocked.");
    return;
  }
  state.loadedPing = median(loadedSamples);
  state.bufferbloat = state.ping == null ? null : state.loadedPing - state.ping;
  log(`Loaded ping measured at ${Math.round(state.loadedPing)} ms.`);
}

async function runTest(mode = "quick") {
  if (state.running) return;
  const config = testModes[mode];
  const profile = getProfileForMode(mode);
  
  state.running = true;
  state.mode = mode;
  window.dispatchEvent(new CustomEvent("wrld-scan-state", { detail: { running: true } }));
  els.start.disabled = true;
  els.quick.disabled = true;
  els.deep.disabled = true;
  
  if (els.endpointDisplay) {
    els.endpointDisplay.textContent = `${profile.label}`;
  }
  
  els.status.textContent = `Starting ${config.label.toLowerCase()}`;
  log(`${config.label} started using ${profile.label}.`);

  clearRunResults();
  try {
    await measureLatency(config, profile);
    updateUI();
    await measureDownload(config, profile);
    updateUI();
    try {
      await measureUpload(config, profile);
    } catch {
      state.upload = null;
      badge("uploadBadge", "blocked", "var(--steel)");
      log("Upload test was blocked by the browser or endpoint.");
    }
    if (mode === "deep") {
      await measureLoadedPing(profile);
    }
    updateUI();
    els.status.textContent = `${config.label} complete`;
    log(`Overall connection score: ${state.score ?? "--"}/100.`);
    saveHistory();
  } catch {
    els.status.textContent = "Scan partially blocked";
    log("One or more network checks were blocked. Try again with extensions disabled.");
    updateUI();
  } finally {
    state.running = false;
    window.dispatchEvent(new CustomEvent("wrld-scan-state", { detail: { running: false } }));
	els.start.disabled = false;
	els.quick.disabled = false;
	els.deep.disabled = false;
  }
}

function clearRunResults() {
  Object.assign(state, {
    ping: null,
    jitter: null,
    download: null,
    upload: null,
    score: null,
    stability: null,
    loss: null,
    grade: null,
    gradeText: null,
    pingSamples: [],
    failedSamples: 0,
    downloadBursts: [],
    uploadBursts: [],
    loadedPing: null,
    bufferbloat: null,
    useCases: {}
  });
  ["ping", "jitter", "download", "upload"].forEach((name) => {
    setText(`${name}Value`, "--");
    setBar(`${name}Bar`, 0);
    badge(`${name}Badge`, "waiting", "var(--steel)");
  });
  els.score.textContent = "--";
  els.grade.textContent = "--";
  els.gradeText.textContent = "Run a test for a full grade.";
  els.stability.textContent = "--";
  els.loss.textContent = "--";
  els.range.textContent = "--";
  els.loadedPing.textContent = "--";
  els.bufferbloat.textContent = "--";
  els.weatherBadge.textContent = "Awaiting scan";
  els.weatherValue.textContent = "Clear reading pending";
  els.problemText.textContent = "Run a test to detect likely connection issues.";
  els.achievements.innerHTML = "<span>Badges appear after a scan</span>";
  els.useCaseLabel.textContent = "0 ready";
  Object.values(els.useCases).forEach((el) => {
    el.textContent = "--";
    el.style.color = "";
  });
  els.sampleCount.textContent = "0 samples";
  els.recommendations.innerHTML = "<li>Run a test for tailored connection advice.</li>";
  drawLatencyGraph();
}

function reset() {
  state.running = false;
  clearRunResults();
  els.start.disabled = false;
  els.quick.disabled = false;
  els.deep.disabled = false;
  els.status.textContent = "Ready to scan";
  els.fit.textContent = "Unknown";
  els.log.innerHTML = "<li>Waiting for the first scan.</li>";
  
  if (els.endpointDisplay) {
    els.endpointDisplay.textContent = "Ready to connect...";
  }

  ["watch", "uhd", "call", "fps", "battle", "stream"].forEach((prefix) => {
    document.querySelector(`#${prefix}Dot`).className = "dot";
  });
  setText("watchText", "Run a test for advice.");
  setText("uhdText", "Run a test for advice.");
  setText("callText", "Run a test for advice.");
  setText("fpsText", "Run a test for advice.");
  setText("battleText", "Run a test for advice.");
  setText("streamText", "Run a test for advice.");
}

function resultSummary() {
  return [
    "WRLD connection result",
    `Mode: ${testModes[state.mode].label}`,
    `Endpoint: ${getProfileForMode(state.mode).label}`,
    `Score: ${state.score ?? "--"}/100`,
    `Grade: ${state.grade ?? "--"}`,
    `Ping: ${state.ping == null ? "--" : Math.round(state.ping)} ms`,
    `Jitter: ${state.jitter == null ? "--" : Math.round(state.jitter)} ms`,
    `Download: ${state.download == null ? "--" : state.download.toFixed(1)} Mbps`,
    `Upload: ${state.upload == null ? "--" : state.upload.toFixed(1)} Mbps`,
    `Stability: ${state.stability == null ? "--" : `${Math.round(state.stability)}/100`}`,
    `Packet loss estimate: ${state.loss == null ? "--" : `${state.loss.toFixed(1)}%`}`,
    `Loaded ping: ${state.loadedPing == null ? "--" : `${Math.round(state.loadedPing)} ms`}`,
    `Bufferbloat: ${state.bufferbloat == null ? "--" : `${Math.round(state.bufferbloat)} ms`}`
  ].join("\n");
}

function supportSummary() {
  return [
    "WRLD ISP support summary",
    `Test mode: ${testModes[state.mode].label}`,
    `Samples: ${state.pingSamples.length}`,
    `Median ping: ${state.ping == null ? "--" : Math.round(state.ping)} ms`,
    `Jitter: ${state.jitter == null ? "--" : Math.round(state.jitter)} ms`,
    `Best/worst ping: ${state.pingSamples.length ? `${Math.round(Math.min(...state.pingSamples))}/${Math.round(Math.max(...state.pingSamples))} ms` : "--"}`,
    `Estimated packet loss: ${state.loss == null ? "--" : `${state.loss.toFixed(1)}%`}`,
    `Loaded ping: ${state.loadedPing == null ? "--" : `${Math.round(state.loadedPing)} ms`}`,
    `Bufferbloat delta: ${state.bufferbloat == null ? "--" : `${Math.round(state.bufferbloat)} ms`}`,
    `Download average: ${state.download == null ? "--" : `${state.download.toFixed(1)} Mbps`}`,
    `Upload average: ${state.upload == null ? "--" : `${state.upload.toFixed(1)} Mbps`}`,
    `Connection grade: ${state.grade ?? "--"}`
  ].join("\n");
}

async function copyResults() {
  const text = resultSummary();
  try {
    await navigator.clipboard.writeText(text);
    els.copy.textContent = "Copied";
  } catch {
    els.copy.textContent = "Copy failed";
  }
  window.setTimeout(() => {
    els.copy.textContent = "Copy";
  }, 1400);
}

async function copySupportSummary() {
  try {
    await navigator.clipboard.writeText(supportSummary());
    els.copySupport.textContent = "Copied";
  } catch {
    els.copySupport.textContent = "Copy failed";
  }
  window.setTimeout(() => {
    els.copySupport.textContent = "Support Copy";
  }, 1400);
}

function readHistory() {
  try {
    return JSON.parse(localStorage.getItem("wrldHistory") || "[]");
  } catch {
    return [];
  }
}

function saveHistory() {
  if (state.score == null) return;
  const history = readHistory();
  const entry = {
    date: new Date().toISOString(),
    mode: state.mode,
    score: state.score,
    grade: state.grade,
    ping: state.ping,
    jitter: state.jitter,
    download: state.download,
    upload: state.upload,
    stability: state.stability,
    bufferbloat: state.bufferbloat
  };
  const previous = history[0];
  localStorage.setItem("wrldHistory", JSON.stringify([entry, ...history].slice(0, 8)));
  renderHistory(previous);
}

function renderHistory(previous = null) {
  const history = readHistory();
  if (!history.length) {
    els.history.innerHTML = "<li>No saved tests yet.</li>";
    els.comparison.textContent = "Your next result will be compared here.";
    return;
  }
  els.history.innerHTML = history.slice(0, 5).map((item) => {
    const date = new Date(item.date).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
    return `<li>${date}: ${item.grade ?? "--"} · ${item.score}/100 · ${Math.round(item.ping ?? 0)} ms</li>`;
  }).join("");

  if (previous && state.score != null) {
    const scoreDelta = state.score - previous.score;
    const pingDelta = Math.round((state.ping ?? 0) - (previous.ping ?? 0));
    const scoreText = scoreDelta === 0 ? "Score unchanged" : `Score ${scoreDelta > 0 ? "up" : "down"} ${Math.abs(scoreDelta)}`;
    const pingText = pingDelta === 0 ? "ping unchanged" : `ping ${pingDelta < 0 ? "improved" : "increased"} by ${Math.abs(pingDelta)} ms`;
    els.comparison.textContent = `${scoreText}; ${pingText} versus your previous saved test.`;
  }
}

function drawLatencyGraph() {
  const rect = els.graph.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(320, Math.round(rect.width || 720));
  const height = Math.max(220, Math.round(rect.height || 240));
  const pixelWidth = Math.round(width * dpr);
  const pixelHeight = Math.round(height * dpr);

  if (els.graph.width !== pixelWidth || els.graph.height !== pixelHeight) {
    els.graph.width = pixelWidth;
    els.graph.height = pixelHeight;
  }

  graphCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  graphCtx.clearRect(0, 0, width, height);
  graphCtx.fillStyle = "rgba(3, 8, 18, 0.65)";
  graphCtx.fillRect(0, 0, width, height);

  graphCtx.strokeStyle = "rgba(255,255,255,0.08)";
  graphCtx.lineWidth = 1;
  for (let i = 1; i < 4; i += 1) {
    const y = (height / 4) * i;
    graphCtx.beginPath();
    graphCtx.moveTo(0, y);
    graphCtx.lineTo(width, y);
    graphCtx.stroke();
  }

  if (state.pingSamples.length < 2) {
    graphCtx.fillStyle = "rgba(154, 168, 188, 0.9)";
    graphCtx.font = "600 16px system-ui";
    graphCtx.textAlign = "center";
    graphCtx.textBaseline = "middle";
    const message = width < 580
      ? ["Ping samples will appear here", "during the test."]
      : ["Ping samples will appear here during the test."];
    message.forEach((line, index) => {
      const offset = (index - (message.length - 1) / 2) * 30;
      graphCtx.fillText(line, width / 2, height / 2 + offset);
    });
    graphCtx.textAlign = "start";
    graphCtx.textBaseline = "alphabetic";
    return;
  }

  const max = Math.max(80, ...state.pingSamples) * 1.15;
  const min = Math.max(0, Math.min(...state.pingSamples) - 8);
  graphCtx.strokeStyle = "rgba(53, 229, 154, 0.92)";
  graphCtx.lineWidth = 3;
  graphCtx.beginPath();
  state.pingSamples.forEach((sample, index) => {
    const x = (index / Math.max(1, state.pingSamples.length - 1)) * (width - 32) + 16;
    const y = height - 22 - ((sample - min) / (max - min)) * (height - 44);
    if (index === 0) graphCtx.moveTo(x, y);
    else graphCtx.lineTo(x, y);
  });
  graphCtx.stroke();

  graphCtx.fillStyle = "rgba(40, 215, 255, 0.9)";
  graphCtx.font = "600 14px system-ui";
  graphCtx.textAlign = "left";
  graphCtx.textBaseline = "top";
  graphCtx.fillText(`${Math.round(max)} ms`, 18, 16);
  graphCtx.textBaseline = "bottom";
  graphCtx.fillText(`${Math.round(min)} ms`, 18, height - 14);
  graphCtx.textBaseline = "alphabetic";
}

function drawRadar() {
  const { width, height } = els.canvas;
  const center = width / 2;
  const tick = state.radarTick;
  ctx.clearRect(0, 0, width, height);

  ctx.save();
  ctx.translate(center, center);
  ctx.strokeStyle = "rgba(40, 215, 255, 0.24)";
  ctx.lineWidth = 1;
  for (let r = 70; r <= 240; r += 42) {
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  for (let i = 0; i < 18; i += 1) {
    const angle = (Math.PI * 2 * i) / 18;
    ctx.beginPath();
    ctx.moveTo(Math.cos(angle) * 48, Math.sin(angle) * 48);
    ctx.lineTo(Math.cos(angle) * 246, Math.sin(angle) * 246);
    ctx.stroke();
  }

  const sweep = tick * 0.018;
  const gradient = ctx.createRadialGradient(0, 0, 20, 0, 0, 250);
  gradient.addColorStop(0, "rgba(53, 229, 154, 0.75)");
  gradient.addColorStop(1, "rgba(40, 215, 255, 0)");
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, 250, sweep - 0.45, sweep);
  ctx.closePath();
  ctx.fill();

  const pulse = state.running ? 1 + Math.sin(tick * 0.08) * 0.08 : 1;
  ctx.strokeStyle = state.running ? "rgba(53, 229, 154, 0.9)" : "rgba(111, 127, 150, 0.65)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, 0, 212 * pulse, 0, Math.PI * 2);
  ctx.stroke();

  const scoreRadius = Math.max(30, (state.score ?? 44) * 1.75);
  ctx.strokeStyle = "rgba(255, 203, 86, 0.8)";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(0, 0, scoreRadius, -Math.PI / 2, (Math.PI * 2 * (state.score ?? 44)) / 100 - Math.PI / 2);
  ctx.stroke();
  ctx.restore();

  state.radarTick += 1;
  requestAnimationFrame(drawRadar);
}

els.start.addEventListener("click", () => runTest("quick"));
els.quick.addEventListener("click", () => runTest("instant"));
els.deep.addEventListener("click", () => runTest("deep"));
els.reset.addEventListener("click", reset);
els.copy.addEventListener("click", copyResults);
els.copySupport.addEventListener("click", copySupportSummary);
window.addEventListener("resize", drawLatencyGraph);
renderHistory();
drawLatencyGraph();
drawRadar();