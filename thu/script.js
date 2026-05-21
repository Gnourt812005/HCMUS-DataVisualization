const CONFIG = {
  csvPath: "weather.csv",
  geoPath: "vietnam-provinces.geojson",
  topN: 10,
  topLabelN: 5,
  dateParse: d3.timeParse("%Y-%m-%d"),
  monthFormat: d3.timeFormat("%Y-%m"),
  displayDate: d3.timeFormat("%d/%m/%Y"),

  metrics: [
    {
      key: "overallRisk",
      label: "Mức độ rủi ro",
      shortLabel: "Tổng hợp",
      colorMode: "sequential"
    },
    {
      key: "moistureBalanceRisk",
      label: "Cân bằng ẩm",
      shortLabel: "Khô <-> Ẩm",
      colorMode: "diverging"
    },
    {
      key: "stormPressure",
      label: "Gió bão cực đoan",
      shortLabel: "Gió bão",
      colorMode: "sequentialStorm"
    }
  ],

  riskComponents: [
    {
      key: "moistureContribution",
      metricKey: "moistureBalanceRisk",
      label: "Mất cân bằng ẩm",
      shortLabel: "Ẩm",
      color: "#3f8f83"
    },
    {
      key: "stormContribution",
      metricKey: "stormPressure",
      label: "Gió bão cực đoan",
      shortLabel: "Gió",
      color: "#7a5aa6"
    }
  ],

  riskLevels: [
    { min: 0, max: 20, label: "Bình thường" },
    { min: 20, max: 40, label: "Theo dõi" },
    { min: 40, max: 60, label: "Rủi ro vừa" },
    { min: 60, max: 80, label: "Rủi ro cao" },
    { min: 80, max: 100.01, label: "Cảnh báo" }
  ]
};

const state = {
  raw: [],
  geojson: null,
  selectedMonth: "all",
  selectedRegion: "all",
  selectedTerrain: "all",
  selectedMetric: "overallRisk",
  selectedProvince: null,
  thresholds: null
};

const els = {
  month: document.querySelector("#month-filter"),
  region: document.querySelector("#region-filter"),
  terrain: document.querySelector("#terrain-filter"),
  metricOptions: document.querySelector("#metric-options"),
  sidebarMetricLegend: document.querySelector("#sidebar-metric-legend"),
  sidebarComponentLegend: document.querySelector("#sidebar-component-legend"),
  reset: document.querySelector("#reset-btn"),
  tooltip: document.querySelector("#tooltip")
};

const COLOR = {
  overall: d3.scaleSequential()
    .domain([0, 100])
    .interpolator(interpolateThree("#fff7bc", "#fdae61", "#b2182b")),

  moisture: d3.scaleDiverging()
    .domain([-100, 0, 100])
    .interpolator(interpolateThree("#a6611a", "#fff7ec", "#018571")),

  storm: d3.scaleSequential()
    .domain([0, 100])
    .interpolator(interpolateThree("#f7fbff", "#9e9ac8", "#54278f"))
};

init();

async function init() {
  try {
    const [raw, geojson] = await Promise.all([
      d3.csv(CONFIG.csvPath, parseRow),
      d3.json(CONFIG.geoPath)
    ]);

    state.raw = prepareData(raw.filter(d => d.date && d.province));
    state.geojson = geojson;

    setupControls(state.raw);
    attachEvents();
    render();
  } catch (error) {
    console.error(error);
    document.querySelector(".main-panel").innerHTML =
      `<div class="empty-state">Không thể tải dữ liệu. Kiểm tra lại weather.csv và vietnam-provinces.geojson.</div>`;
  }
}

function interpolateThree(left, center, right) {
  const a = d3.interpolateRgb(left, center);
  const b = d3.interpolateRgb(center, right);

  return function (t) {
    return t < 0.5 ? a(t * 2) : b((t - 0.5) * 2);
  };
}

function parseRow(d) {
  const date = CONFIG.dateParse(d.date);

  return {
    province: d["location.name"],
    region: d["location.region"],
    terrain: d["location.terrain"],
    lat: +d["location.lat"],
    lon: +d["location.lon"],

    date,
    dateKey: date ? +date : null,
    month: date ? CONFIG.monthFormat(date) : "unknown",

    precip: +d["day.totalprecip_mm"],
    willRain: +d["day.daily_will_it_rain"],
    humidity: +d["day.avghumidity"],
    maxWind: +d["day.maxwind_kph"],
    visibility: +d["day.avgvis_km"],

    condition: d["day.condition.text"]
  };
}

function prepareData(data) {
  const valid = key => data
    .map(d => d[key])
    .filter(Number.isFinite)
    .sort(d3.ascending);

  state.thresholds = {
    wind75: d3.quantile(valid("maxWind"), 0.75) ?? 0,
    wind90: d3.quantile(valid("maxWind"), 0.90) ?? 0,
    wind95: d3.quantile(valid("maxWind"), 0.95) ?? 0
  };

  data.forEach(d => {
    d.rainExcessScore = getRainExcessScore(d.precip);
    d.heavyRainScore = getHeavyRainScore(d.precip);
    d.saturationProxyScore = getSaturationProxyScore(d.humidity, d.visibility);
    d.windExtremeScore = getWindExtremeScore(d.maxWind, state.thresholds);

    d.wetBaseDay =
      d.precip >= 5 ||
      d.humidity >= 90 ||
      d.visibility < 4;

    d.dryBaseDay =
      d.precip < 1;
  });

  computeMoistureSeries(data);

  data.forEach(d => {
    d.wetPressure =
      0.45 * d.wetStreakScore +
      0.35 * d.rainExcessScore +
      0.20 * d.saturationProxyScore;

    d.dryPressure =
      0.75 * d.dryStreakScore +
      0.25 * d.rainDeficitScore;

    d.moistureBalanceRisk = d.wetPressure - d.dryPressure;
    d.moistureImbalanceRisk = Math.abs(d.moistureBalanceRisk);

    d.stormPressure =
      0.60 * d.heavyRainScore +
      0.40 * d.windExtremeScore;

    d.overallRisk = combineRisks(d.moistureImbalanceRisk, d.stormPressure);

    const overlap = (d.moistureImbalanceRisk * d.stormPressure) / 100;
    d.moistureContribution = Math.max(0, d.moistureImbalanceRisk - overlap / 2);
    d.stormContribution = Math.max(0, d.stormPressure - overlap / 2);

    d.totalRisk = d.overallRisk;
    d.alertLevel = getRiskLevel(d.overallRisk).label;
  });

  return data;
}

function combineRisks(a, b) {
  const x = clamp(a, 0, 100) / 100;
  const y = clamp(b, 0, 100) / 100;
  return 100 * (1 - (1 - x) * (1 - y));
}

function getRainExcessScore(precip) {
  if (!Number.isFinite(precip) || precip < 16) return 0;
  if (precip <= 50) return 45;
  if (precip <= 100) return 80;
  return 100;
}

function getHeavyRainScore(precip) {
  if (!Number.isFinite(precip) || precip < 16) return 0;
  if (precip <= 50) return 40;
  if (precip <= 100) return 80;
  return 100;
}

function getSaturationProxyScore(humidity, visibility) {
  const h = Number.isFinite(humidity) ? humidity : 0;
  const v = Number.isFinite(visibility) ? visibility : 99;

  if (h >= 95 || v < 1) return 100;
  if (h >= 90 || v < 4) return 70;
  if (h >= 85 || v < 7) return 35;
  return 0;
}

function getRainDeficitScore(rain7d) {
  if (!Number.isFinite(rain7d)) return 0;
  if (rain7d >= 20) return 0;
  if (rain7d >= 10) return 25;
  if (rain7d >= 5) return 50;
  if (rain7d >= 1) return 75;
  return 100;
}

function getWindExtremeScore(wind, thresholds) {
  if (!Number.isFinite(wind) || wind < thresholds.wind75) return 0;
  if (wind < thresholds.wind90) return 40;
  if (wind < thresholds.wind95) return 70;
  return 100;
}

function computeMoistureSeries(data) {
  const byProvince = d3.group(data, d => d.province);

  byProvince.forEach(values => {
    values.sort((a, b) => d3.ascending(a.date, b.date));

    let wetStreak = 0;
    let dryStreak = 0;

    values.forEach((d, i) => {
      const start = Math.max(0, i - 6);
      const window = values.slice(start, i + 1);

      d.rain7d = d3.sum(window, item => item.precip || 0);
      d.rainDeficitScore = getRainDeficitScore(d.rain7d);

      wetStreak = d.wetBaseDay ? wetStreak + 1 : 0;
      dryStreak = d.dryBaseDay ? dryStreak + 1 : 0;

      d.wetStreak = wetStreak;
      d.dryStreak = dryStreak;

      d.wetStreakScore = getWetStreakScore(wetStreak);
      d.dryStreakScore = getDryStreakScore(dryStreak);
    });
  });
}

function getWetStreakScore(streak) {
  if (streak <= 1) return 0;
  if (streak === 2) return 30;
  if (streak <= 4) return 60;
  if (streak <= 7) return 80;
  return 100;
}

function getDryStreakScore(streak) {
  if (streak <= 2) return 0;
  if (streak <= 5) return 30;
  if (streak <= 9) return 55;
  if (streak <= 14) return 75;
  return 100;
}

function getRiskLevel(value) {
  const score = clamp(value, 0, 100);
  return CONFIG.riskLevels.find(level => score >= level.min && score < level.max) || CONFIG.riskLevels[0];
}

function setupControls(data) {
  const months = Array.from(new Set(data.map(d => d.month)))
    .filter(Boolean)
    .sort();

  fillSelect(els.month, [
    ["all", "Tất cả giai đoạn"],
    ...getQuarterOptions(months),
    ...months.map(m => [m, m])
  ]);

  const regions = Array.from(new Set(data.map(d => d.region)))
    .filter(Boolean)
    .sort(d3.ascending);

  fillSelect(els.region, [
    ["all", "Tất cả vùng"],
    ...regions.map(r => [r, r])
  ]);

  const terrains = Array.from(new Set(data.map(d => d.terrain)))
    .filter(Boolean)
    .sort(d3.ascending);

  fillSelect(els.terrain, [
    ["all", "Tất cả địa hình"],
    ...terrains.map(t => [t, t])
  ]);

  fillMetricChoices();
}

function getQuarterOptions(months) {
  const quarters = new Set(months.map(month => {
    const [year, monthNumber] = month.split("-").map(Number);
    return `${year}-Q${Math.ceil(monthNumber / 3)}`;
  }));

  return Array.from(quarters)
    .sort()
    .map(quarter => [`quarter:${quarter}`, quarter]);
}

function fillSelect(select, options) {
  select.innerHTML = "";

  options.forEach(([value, label]) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    select.appendChild(option);
  });
}

function fillMetricChoices() {
  els.metricOptions.innerHTML = "";

  CONFIG.metrics.forEach(metric => {
    const id = `metric-${metric.key}`;
    const label = document.createElement("label");
    label.className = "metric-option";
    label.htmlFor = id;
    label.dataset.metric = metric.key;

    const tone = getMetricOptionTone(metric);
    label.style.setProperty("--metric-accent", tone.accent);
    label.style.setProperty("--metric-soft", tone.soft);
    label.style.setProperty("--metric-swatch", tone.swatch);

    label.innerHTML = `
      <input id="${id}" type="radio" name="risk-metric" value="${metric.key}" ${metric.key === state.selectedMetric ? "checked" : ""}>
      <span class="metric-check"></span>
      <span class="metric-label">${metric.label}</span>
      <span class="metric-option-swatch" aria-hidden="true"></span>
    `;

    els.metricOptions.appendChild(label);
  });
}

function getMetricOptionTone(metric) {
  if (metric.key === "moistureBalanceRisk") {
    return {
      accent: "#018571",
      soft: "rgba(1, 133, 113, 0.12)",
      swatch: "linear-gradient(90deg, #a6611a 0%, #fff7ec 50%, #018571 100%)"
    };
  }

  if (metric.key === "stormPressure") {
    return {
      accent: "#54278f",
      soft: "rgba(84, 39, 143, 0.10)",
      swatch: "linear-gradient(90deg, #f7fbff 0%, #9e9ac8 52%, #54278f 100%)"
    };
  }

  return {
    accent: "#b2182b",
    soft: "rgba(178, 24, 43, 0.10)",
    swatch: "linear-gradient(90deg, #fff7bc 0%, #fdae61 52%, #b2182b 100%)"
  };
}

function attachEvents() {
  els.month.addEventListener("change", event => {
    state.selectedMonth = event.target.value;
    state.selectedProvince = null;
    render();
  });

  els.region.addEventListener("change", event => {
    state.selectedRegion = event.target.value;
    state.selectedProvince = null;
    render();
  });

  els.terrain.addEventListener("change", event => {
    state.selectedTerrain = event.target.value;
    state.selectedProvince = null;
    render();
  });

  els.metricOptions.addEventListener("change", event => {
    if (event.target.name !== "risk-metric") return;
    state.selectedMetric = event.target.value;
    render();
  });

  els.reset.addEventListener("click", () => {
    state.selectedMonth = "all";
    state.selectedRegion = "all";
    state.selectedTerrain = "all";
    state.selectedMetric = "overallRisk";
    state.selectedProvince = null;

    els.month.value = "all";
    els.region.value = "all";
    els.terrain.value = "all";

    const checked = els.metricOptions.querySelector('input[value="overallRisk"]');
    if (checked) checked.checked = true;

    render();
  });
}

function getMetricConfig() {
  return CONFIG.metrics.find(metric => metric.key === state.selectedMetric) || CONFIG.metrics[0];
}

function getProvinceSelectionClass(province) {
  if (!state.selectedProvince) return "";
  return province === state.selectedProvince ? "is-selected" : "is-dimmed";
}

function toggleSelectedProvince(province) {
  if (!province) return;
  state.selectedProvince = state.selectedProvince === province ? null : province;
  hideTooltip();
  render();
}

function getFilteredData() {
  return state.raw.filter(d =>
    periodMatches(d) &&
    (state.selectedRegion === "all" || d.region === state.selectedRegion) &&
    (state.selectedTerrain === "all" || d.terrain === state.selectedTerrain)
  );
}

function periodMatches(d) {
  if (state.selectedMonth === "all") return true;

  if (state.selectedMonth.startsWith("quarter:")) {
    const quarter = state.selectedMonth.slice("quarter:".length);
    const [year, quarterText] = quarter.split("-Q");
    const monthNumber = d.date.getMonth() + 1;

    return String(d.date.getFullYear()) === year &&
      Math.ceil(monthNumber / 3) === Number(quarterText);
  }

  return d.month === state.selectedMonth;
}

function getActiveData(filtered) {
  return state.selectedProvince
    ? filtered.filter(d => d.province === state.selectedProvince)
    : filtered;
}

function aggregateByProvince(data) {
  const grouped = d3.rollups(
    data,
    values => {
      const longestWetStreak = d3.max(values, d => d.wetStreak) || 0;
      const longestDryStreak = d3.max(values, d => d.dryStreak) || 0;
      const sumWetPressure = d3.sum(values, d => d.wetPressure || 0);
      const sumDryPressure = d3.sum(values, d => d.dryPressure || 0);
      const sumMoistureBalance = d3.sum(values, d => d.moistureBalanceRisk || 0);
      const sumMoistureImbalance = d3.sum(values, d => d.moistureImbalanceRisk || 0);
      const sumStormPressure = d3.sum(values, d => d.stormPressure || 0);
      const overallScore = sumMoistureImbalance + sumStormPressure;

      const result = {
        province: values[0].province,
        region: values[0].region,
        terrain: values[0].terrain,
        records: values.length,
        highDays: values.filter(d => d.overallRisk >= 60).length,
        alertDays: values.filter(d => d.overallRisk >= 80).length
      };

      result.overallRisk = overallScore;
      result.moistureBalanceRisk = sumMoistureBalance;
      result.moistureImbalanceRisk = sumMoistureImbalance;
      result.stormPressure = sumStormPressure;

      result.moistureContribution = sumMoistureImbalance;
      result.stormContribution = sumStormPressure;

      result.meanOverallRisk = d3.mean(values, d => d.overallRisk) || 0;
      result.meanMoistureBalanceRisk = d3.mean(values, d => d.moistureBalanceRisk) || 0;
      result.meanMoistureImbalanceRisk = d3.mean(values, d => d.moistureImbalanceRisk) || 0;
      result.meanStormPressure = d3.mean(values, d => d.stormPressure) || 0;

      result.wetPressure = sumWetPressure;
      result.dryPressure = sumDryPressure;

      result.wetStreak = longestWetStreak;
      result.dryStreak = longestDryStreak;
      result.rain7d = d3.mean(values, d => d.rain7d) || 0;

      result.totalRisk = result.overallRisk;
      result.metricValue = getAggregateMetricValue(result);
      result.sortValue = getAggregateSortValue(result);
      result.riskLevel = "Theo dõi";

      return result;
    },
    d => d.province
  );

  const provinces = grouped.map(([, value]) => value);
  const thresholds = getProvinceRiskThresholds(provinces);

  provinces.forEach(province => {
    province.riskLevel = getProvinceRiskLevel(province.overallRisk, thresholds);
  });

  return provinces;
}

function getHighDayRate(values, accessor, threshold = 60) {
  if (!values.length) return 0;

  const highDays = values.filter(d => {
    const value = accessor(d);
    return Number.isFinite(value) && value >= threshold;
  }).length;

  return (highDays / values.length) * 100;
}

function getAggregateStreakScore(streak) {
  if (!Number.isFinite(streak) || streak <= 2) return 0;
  if (streak <= 5) return 40;
  if (streak <= 10) return 65;
  if (streak <= 20) return 85;
  return 100;
}

function getSignedMoisturePriority(meanMoistureBalance, moisturePriority, values) {
  if (Math.abs(meanMoistureBalance) > 0.5) {
    return Math.sign(meanMoistureBalance) * moisturePriority;
  }

  const meanWetPressure = d3.mean(values, d => d.wetPressure) || 0;
  const meanDryPressure = d3.mean(values, d => d.dryPressure) || 0;
  const direction = meanWetPressure >= meanDryPressure ? 1 : -1;

  return direction * moisturePriority;
}

function getAggregateMetricValue(d) {
  return d[state.selectedMetric] || 0;
}

function getAggregateSortValue(d) {
  if (state.selectedMetric === "moistureBalanceRisk") {
    return Math.abs(d.moistureBalanceRisk || 0);
  }

  return d[state.selectedMetric] || 0;
}

function getRowMetricValue(d) {
  return d[state.selectedMetric] || 0;
}

function getProvinceRiskThresholds(provinces) {
  const scores = provinces
    .map(d => d.overallRisk)
    .filter(Number.isFinite)
    .sort(d3.ascending);

  return {
    q60: d3.quantile(scores, 0.60) || 0,
    q80: d3.quantile(scores, 0.80) || 0,
    q95: d3.quantile(scores, 0.95) || 0
  };
}

function getProvinceRiskLevel(score, thresholds) {
  if (score >= thresholds.q95) return "Cảnh báo";
  if (score >= thresholds.q80) return "Rủi ro cao";
  if (score >= thresholds.q60) return "Rủi ro vừa";
  return "Theo dõi";
}

function render() {
  const filtered = getFilteredData();
  const activeData = getActiveData(filtered);
  const byProvince = aggregateByProvince(filtered);

  const allProvincesSorted = [...byProvince].sort((a, b) =>
    d3.descending(a.sortValue, b.sortValue)
  );

  renderSidebarLegends(byProvince);
  updateSubtitles();
  renderKpis(activeData, byProvince);
  renderDonut(activeData);
  renderMap(byProvince);
  renderRankedBar(allProvincesSorted);
  renderCalendarHeatmap(activeData);
}

function renderSidebarLegends(byProvince) {
  const metric = getMetricConfig();
  const scaleInfo = getMetricScaleInfo(byProvince.map(d => d.metricValue), metric, { scope: "province" });
  const tone = getMetricOptionTone(metric);

  els.sidebarMetricLegend.innerHTML = `
    <div class="sidebar-legend-group">
      <div class="sidebar-legend-name">${metric.label}</div>
      <div class="sidebar-gradient" style="background:${tone.swatch}"></div>
      <div class="sidebar-legend-labels">${getSidebarMetricLabels(metric, scaleInfo)}</div>
    </div>
  `;

  els.sidebarComponentLegend.innerHTML = `
    <div class="sidebar-legend-group">
      <div class="sidebar-legend-title">Thành phần rủi ro</div>
      <div class="sidebar-component-list">
        ${CONFIG.riskComponents.map(component => `
          <div class="sidebar-component-item ${state.selectedMetric !== "overallRisk" && component.metricKey !== state.selectedMetric ? "is-muted" : ""}">
            <span class="sidebar-component-swatch" style="background:${component.color}"></span>
            <span class="sidebar-component-text">${component.label}</span>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

function getSidebarMetricLabels(metric, scaleInfo) {
  if (metric.key === "moistureBalanceRisk") {
    return `
      <span>Khô ${d3.format(".1f")(Math.abs(scaleInfo.domain[0]))}</span>
      <span>Cân bằng</span>
      <span>Ẩm ${d3.format(".1f")(scaleInfo.domain[2])}</span>
    `;
  }

  return `
    <span>${d3.format(".1f")(scaleInfo.domain[0])}</span>
    <span>Cao dan</span>
    <span>${d3.format(".1f")(scaleInfo.domain[1])}</span>
  `;
}

function updateSubtitles() {
  const metric = getMetricConfig();
  const period = state.selectedMonth === "all"
    ? "toàn bộ giai đoạn"
    : state.selectedMonth.replace("quarter:", "");

  const scope = state.selectedProvince
    ? `tỉnh ${state.selectedProvince}`
    : "trung bình toàn bộ tỉnh đang lọc";

  d3.select("#map-subtitle").text(`${metric.label} · ${period}`);
  d3.select("#bar-subtitle").text(`Score xếp hạng theo ${metric.label}`);
  d3.select("#streak-subtitle").text(`${metric.label} từng ngày · ${scope}`);
}

function renderKpis(activeData, byProvince) {
  const provinceCount = new Set(activeData.map(d => d.province)).size;
  const longestHighRiskStreak = getLongestHighRiskStreak(activeData);
  const highDays = countHighRiskDays(activeData);

  const top = state.selectedProvince
    ? byProvince.find(d => d.province === state.selectedProvince)
    : [...byProvince].sort((a, b) => d3.descending(a.sortValue, b.sortValue))[0];

  d3.select("#kpi-provinces").text(provinceCount || "-");
  d3.select("#kpi-days").text(longestHighRiskStreak || "-");
  d3.select("#kpi-high-days").text(highDays || "-");
  d3.select("#kpi-top-province").text(top ? top.province : "-");
}

function countHighRiskDays(data) {
  const grouped = d3.rollups(
    data,
    values => values.some(d => d.overallRisk >= 60),
    d => +d.date
  );

  return grouped.filter(([, hasRisk]) => hasRisk).length;
}

function getLongestHighRiskStreak(data) {
  const values = aggregateByDate(data);
  return d3.max(values, d => d.highRiskStreak) || 0;
}

function clearChart(selector) {
  d3.select(selector).selectAll("*").remove();
}

function createSvg(selector, margin = { top: 18, right: 24, bottom: 30, left: 42 }) {
  clearChart(selector);

  const container = document.querySelector(selector);
  const width = Math.max(1, container.clientWidth || 680);
  const height = Math.max(1, container.clientHeight || 360);

  const svg = d3.select(selector)
    .append("svg")
    .attr("viewBox", [0, 0, width, height]);

  return {
    svg,
    width,
    height,
    innerWidth: Math.max(1, width - margin.left - margin.right),
    innerHeight: Math.max(1, height - margin.top - margin.bottom),
    margin
  };
}

function getColor(value, metric = getMetricConfig()) {
  return getScaledColor(value, metric, getMetricScaleInfo([value], metric));
}

function getMetricScaleInfo(values, metric = getMetricConfig(), options = {}) {
  const referenceValues = getMetricScaleReferenceValues(metric, options.scope);
  const cleanValues = (referenceValues.length ? referenceValues : values)
    .map(Number)
    .filter(Number.isFinite);

  if (metric.key === "moistureBalanceRisk") {
    const maxAbs = d3.max(cleanValues, value => Math.abs(value)) || 1;
    return {
      mode: "diverging",
      domain: [-maxAbs, 0, maxAbs],
      maxAbs
    };
  }

  if (metric.key === "stormPressure") {
    const max = d3.max(cleanValues) || 1;
    return {
      mode: "sequential",
      domain: [0, max],
      max
    };
  }

  if (metric.key === "overallRisk") {
    const max = d3.max(cleanValues) || 1;
    return {
      mode: "sequential",
      domain: [0, max],
      max
    };
  }
}

function getMetricScaleReferenceValues(metric, scope) {
  if (!scope || !state.raw.length) return [];

  const referenceData = state.raw.filter(d => periodMatches(d));
  if (!referenceData.length) return [];

  if (scope === "province") {
    return d3.rollups(
      referenceData,
      values => getProvinceReferenceMetricValue(values, metric),
      d => d.province
    ).map(([, value]) => value);
  }

  if (scope === "date") {
    return metric.key === "moistureBalanceRisk"
      ? [-100, 0, 100]
      : [0, 100];
  }

  return referenceData.map(d => getDailyReferenceMetricValue(d, metric));
}

function getProvinceReferenceMetricValue(values, metric) {
  if (metric.key === "overallRisk") {
    return d3.sum(values, d => d.moistureImbalanceRisk || 0) +
      d3.sum(values, d => d.stormPressure || 0);
  }

  if (metric.key === "moistureBalanceRisk") {
    return d3.sum(values, d => d.moistureBalanceRisk || 0);
  }

  if (metric.key === "stormPressure") {
    return d3.sum(values, d => d.stormPressure || 0);
  }

  return d3.sum(values, d => d[metric.key] || 0);
}

function getDailyReferenceMetricValue(d, metric) {
  if (metric.key === "moistureBalanceRisk") {
    return d.moistureBalanceRisk || 0;
  }

  return d[metric.key] || 0;
}

function getScaledColor(value, metric = getMetricConfig(), scaleInfo = getMetricScaleInfo([value], metric)) {
  const v = Number.isFinite(value) ? value : 0;

  if (metric.key === "moistureBalanceRisk") {
    return d3.scaleDiverging()
      .domain(scaleInfo.domain)
      .interpolator(interpolateThree("#a6611a", "#fff7ec", "#018571"))(clamp(v, scaleInfo.domain[0], scaleInfo.domain[2]));
  }

  if (metric.key === "stormPressure") {
    return d3.scaleSequential()
      .domain(scaleInfo.domain)
      .interpolator(interpolateThree("#f7fbff", "#9e9ac8", "#54278f"))(clamp(v, scaleInfo.domain[0], scaleInfo.domain[1]));
  }

  if (metric.key === "overallRisk") {
    return d3.scaleSequential()
      .domain(scaleInfo.domain)
      .interpolator(interpolateThree("#fff7bc", "#fdae61", "#b2182b"))(clamp(v, scaleInfo.domain[0], scaleInfo.domain[1]));
  }

  return COLOR.overall(clamp(v, 0, 100));
}

function getMetricTicks(scaleInfo, metric = getMetricConfig()) {
  if (metric.key === "moistureBalanceRisk") {
    const maxAbs = scaleInfo.maxAbs || Math.abs(scaleInfo.domain[2]) || 1;
    return [-maxAbs, -maxAbs / 2, 0, maxAbs / 2, maxAbs];
  }

  const [min, max] = scaleInfo.domain;
  if (max <= 5) {
    return d3.ticks(min, max, 4);
  }

  return d3.ticks(min, max, 5);
}

function renderMap(byProvince) {
  const { svg, width, height, margin } = createSvg("#map-chart", {
    top: 10,
    right: 14,
    bottom: 42,
    left: 14
  });

  if (!state.geojson || !state.geojson.features?.length) {
    renderEmpty(svg, width, height, "Không có dữ liệu bản đồ.");
    return;
  }

  const dataByName = new Map(byProvince.map(d => [normalizeProvinceName(d.province), d]));
  const topNames = new Set(
    [...byProvince]
      .sort((a, b) => d3.descending(a.sortValue, b.sortValue))
      .slice(0, CONFIG.topLabelN)
      .map(d => d.province)
  );

  const expandedGeo = {
    type: "FeatureCollection",
    features: [
      ...state.geojson.features,
      { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [112.0, 16.5] } },
      { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [111.9, 8.6] } }
    ]
  };

  const projection = d3.geoMercator()
    .fitExtent(
      [[margin.left, margin.top], [width - margin.right, height - margin.bottom]],
      expandedGeo
    );

  const path = d3.geoPath(projection);
  const metric = getMetricConfig();
  const scaleInfo = getMetricScaleInfo(byProvince.map(d => d.metricValue), metric, { scope: "province" });

  svg.append("g")
    .selectAll("path")
    .data(state.geojson.features)
    .join("path")
    .attr("class", feature => {
      const data = getProvinceData(feature, dataByName);

      return [
        "province-shape",
        data ? "" : "is-muted",
        data && state.selectedProvince === data.province ? "is-selected" : ""
      ].join(" ");
    })
    .attr("d", path)
    .attr("fill", feature => {
      const data = getProvinceData(feature, dataByName);
      return data ? getScaledColor(data.metricValue, metric, scaleInfo) : "#ebe1d0";
    })
    .attr("opacity", feature => {
      const data = getProvinceData(feature, dataByName);
      if (!data) return 0.46;
      return state.selectedProvince && state.selectedProvince !== data.province ? 0.52 : 1;
    })
    .on("click", (event, feature) => {
      const data = getProvinceData(feature, dataByName);
      if (!data) return;

      toggleSelectedProvince(data.province);
    })
    .on("mousemove", (event, feature) => {
      const data = getProvinceData(feature, dataByName);
      showTooltip(event, mapTooltip(feature, data));
    })
    .on("mouseleave", hideTooltip);

  svg.append("g")
    .selectAll("text")
    .data(state.geojson.features.filter(feature => {
      const data = getProvinceData(feature, dataByName);
      return data && (topNames.has(data.province) || state.selectedProvince === data.province);
    }))
    .join("text")
    .attr("class", "province-label")
    .attr("x", feature => path.centroid(feature)[0])
    .attr("y", feature => path.centroid(feature)[1])
    .attr("text-anchor", "middle")
    .text(feature => getProvinceData(feature, dataByName).province);

  drawIslandGroup(svg, projection, {
    name: "Quần đảo\nHoàng Sa",
    center: [112.0, 16.5],
    islands: [
      [111.90, 16.55], [112.00, 16.60], [112.10, 16.52],
      [111.95, 16.45], [112.05, 16.42], [112.15, 16.48],
      [111.88, 16.50], [112.08, 16.55]
    ]
  });

  drawIslandGroup(svg, projection, {
    name: "Quần đảo\nTrường Sa",
    center: [111.9, 8.6],
    islands: [
      [111.80, 8.65], [111.90, 8.70], [112.00, 8.62],
      [111.85, 8.55], [111.95, 8.50], [112.05, 8.58],
      [111.88, 8.60], [112.02, 8.68], [111.92, 8.45],
      [112.08, 8.52]
    ]
  });

}

function drawIslandGroup(svg, projection, config) {
  const g = svg.append("g").attr("class", "island-group");

  config.islands.forEach(coords => {
    const [ix, iy] = projection(coords);

    g.append("ellipse")
      .attr("cx", ix)
      .attr("cy", iy)
      .attr("rx", 2.5)
      .attr("ry", 1.8)
      .attr("fill", "#c4b8a5")
      .attr("stroke", "#a89880")
      .attr("stroke-width", 0.5)
      .attr("opacity", 0.85);
  });

  const allPts = config.islands.map(c => projection(c));
  const xMin = d3.min(allPts, p => p[0]) - 8;
  const xMax = d3.max(allPts, p => p[0]) + 8;
  const yMin = d3.min(allPts, p => p[1]) - 8;
  const yMax = d3.max(allPts, p => p[1]) + 8;

  g.append("rect")
    .attr("x", xMin)
    .attr("y", yMin)
    .attr("width", xMax - xMin)
    .attr("height", yMax - yMin)
    .attr("fill", "none")
    .attr("stroke", "#a89880")
    .attr("stroke-width", 0.8)
    .attr("stroke-dasharray", "3,2")
    .attr("rx", 3);

  const label = g.append("text")
    .attr("text-anchor", "middle")
    .attr("class", "island-label")
    .attr("x", (xMin + xMax) / 2)
    .attr("y", yMax + 10);

  config.name.split("\n").forEach((line, i) => {
    label.append("tspan")
      .attr("x", (xMin + xMax) / 2)
      .attr("dy", i === 0 ? 0 : 11)
      .text(line);
  });
}

function getProvinceData(feature, dataByName) {
  const values = Object.values(feature.properties || {});

  for (const value of values) {
    const data = dataByName.get(normalizeProvinceName(value));
    if (data) return data;
  }

  return null;
}

function normalizeProvinceName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/^tp\.?\s*/, "")
    .replace(/^thanh\s*pho\s*/, "")
    .replace(/^tinh\s*/, "")
    .replace(/[^a-z0-9]/g, "");
}

function drawMetricLegend(svg, width, height, metric, options, scaleInfo = getMetricScaleInfo([0, 100], metric)) {
  const x = Math.max(12, options.x);
  const y = options.y;
  const w = options.w;
  const h = 8;

  const gradientId = `legend-gradient-${metric.key}-${Math.random().toString(36).slice(2)}`;
  const defs = svg.append("defs");

  const gradient = defs.append("linearGradient")
    .attr("id", gradientId)
    .attr("x1", "0%")
    .attr("x2", "100%");

  const stops = metric.key === "moistureBalanceRisk"
    ? [
        { offset: "0%", color: getScaledColor(scaleInfo.domain[0], metric, scaleInfo) },
        { offset: "50%", color: getScaledColor(0, metric, scaleInfo) },
        { offset: "100%", color: getScaledColor(scaleInfo.domain[2], metric, scaleInfo) }
      ]
    : d3.range(0, 1.01, 0.1).map(t => ({
        offset: `${t * 100}%`,
        color: getScaledColor(scaleInfo.domain[0] + t * (scaleInfo.domain[1] - scaleInfo.domain[0]), metric, scaleInfo)
      }));

  stops.forEach(stop => {
    gradient.append("stop")
      .attr("offset", stop.offset)
      .attr("stop-color", stop.color);
  });

  svg.append("text")
    .attr("x", x)
    .attr("y", y - 8)
    .attr("class", "legend-label")
    .text(metric.label);

  svg.append("rect")
    .attr("x", x)
    .attr("y", y)
    .attr("width", w)
    .attr("height", h)
    .attr("rx", 4)
    .attr("fill", `url(#${gradientId})`);

  if (metric.key === "moistureBalanceRisk") {
    svg.append("text")
      .attr("x", x)
      .attr("y", y + 22)
      .attr("class", "legend-label")
      .text(`Khô ${d3.format(".1f")(Math.abs(scaleInfo.domain[0]))}`);

    svg.append("text")
      .attr("x", x + w / 2)
      .attr("y", y + 22)
      .attr("text-anchor", "middle")
      .attr("class", "legend-label")
      .text("Cân bằng");

    svg.append("text")
      .attr("x", x + w)
      .attr("y", y + 22)
      .attr("text-anchor", "end")
      .attr("class", "legend-label")
      .text(`Ẩm ${d3.format(".1f")(scaleInfo.domain[2])}`);
  } else {
    svg.append("text")
      .attr("x", x)
      .attr("y", y + 22)
      .attr("class", "legend-label")
      .text(d3.format(".1f")(scaleInfo.domain[0]));

    svg.append("text")
      .attr("x", x + w)
      .attr("y", y + 22)
      .attr("text-anchor", "end")
      .attr("class", "legend-label")
      .text(d3.format(".1f")(scaleInfo.domain[1]));
  }
}

function mapTooltip(feature, data) {
  const metric = getMetricConfig();
  return data
    ? tooltipCard(data.province, [
      tooltipRow(metric.label, formatMetricValue(data.metricValue, metric), getMetricAccent(metric, data.metricValue)),
      tooltipRow("Mức cảnh báo", data.riskLevel, getMetricAccent(CONFIG.metrics[0], data.overallRisk)),
      tooltipRow("Vùng", data.region),
      tooltipRow("Địa hình", data.terrain)
    ])
    : tooltipCard(feature.properties?.NAME_1 || "Tỉnh", [
      tooltipRow("Trạng thái", "Không có dữ liệu")
    ]);

  if (!data) {
    return `<strong>${feature.properties?.NAME_1 || "Tỉnh"}</strong>Không có dữ liệu với bộ lọc hiện tại.`;
  }

  return `
    <strong>${data.province}</strong>
    Vùng: ${data.region}<br/>
    Địa hình: ${data.terrain}<br/>
    ${metric.label} TB: ${formatMetricValue(data.metricValue, metric)}<br/>
    Rủi ro tổng hợp TB: ${d3.format(".1f")(data.overallRisk)} · ${data.riskLevel}<br/>
    Cân bằng ẩm: ${formatMoistureValue(data.moistureBalanceRisk)}<br/>
    Áp lực ẩm: ${d3.format(".1f")(data.wetPressure)}<br/>
    Áp lực khô: ${d3.format(".1f")(data.dryPressure)}<br/>
    Gió bão cực đoan: ${d3.format(".1f")(data.stormPressure)}<br/>
    Mưa 7 ngày TB: ${d3.format(".1f")(data.rain7d)} mm<br/>
    Chuỗi ẩm cao nhất: ${data.wetStreak} ngày<br/>
    Chuỗi khô cao nhất: ${data.dryStreak} ngày<br/>
    Ngày rủi ro cao: ${data.highDays}
  `;
}

function renderRankedBar(allProvinces) {
  const container = document.querySelector("#bar-chart");
  clearChart("#bar-chart");

  if (!allProvinces.length) {
    const w = container.clientWidth || 400;
    const h = container.clientHeight || 300;
    const emptySvg = d3.select("#bar-chart")
      .append("svg")
      .attr("viewBox", [0, 0, w, h]);

    renderEmpty(emptySvg, w, h);
    return;
  }

  const margin = { top: 50, right: 58, bottom: 28, left: 100 };
  const containerWidth = Math.max(1, container.clientWidth || 400);
  const rowHeight = 25;
  const plotHeight = allProvinces.length * rowHeight;
  const svgHeight = margin.top + plotHeight + margin.bottom;
  const innerWidth = Math.max(1, containerWidth - margin.left - margin.right);

  container.style.overflowY = "auto";
  container.style.overflowX = "hidden";

  const svg = d3.select("#bar-chart")
    .append("svg")
    .attr("width", containerWidth)
    .attr("height", svgHeight)
    .style("display", "block")
    .style("min-height", svgHeight + "px");

  const metric = getMetricConfig();
  const isOverall = metric.key === "overallRisk";
  const isDiverging = metric.key === "moistureBalanceRisk";
  const scaleInfo = getMetricScaleInfo(allProvinces.map(d => d.metricValue), metric, { scope: "province" });

  const x = isDiverging
    ? d3.scaleLinear().domain([scaleInfo.domain[0], scaleInfo.domain[2]]).range([0, innerWidth])
    : d3.scaleLinear().domain(scaleInfo.domain).range([0, innerWidth]);

  const y = d3.scaleBand()
    .domain(allProvinces.map(d => d.province))
    .range([0, plotHeight])
    .paddingInner(0.24)
    .paddingOuter(0.12);

  const barHeight = Math.min(17, y.bandwidth());
  const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  g.append("g")
    .attr("class", "grid")
    .call(
      d3.axisBottom(x)
        .tickValues(getMetricTicks(scaleInfo, metric))
        .tickSize(plotHeight)
        .tickFormat("")
    )
    .call(axis => axis.select(".domain").remove());

  if (isDiverging) {
    g.append("line")
      .attr("x1", x(0))
      .attr("x2", x(0))
      .attr("y1", 0)
      .attr("y2", plotHeight)
      .attr("stroke", "var(--dash-muted)")
      .attr("stroke-width", 1)
      .attr("stroke-dasharray", "3,3");
  }

  if (isOverall) {
    const stack = d3.stack()
      .keys(CONFIG.riskComponents.map(d => d.key))
      .value((d, key) => d[key]);

    const stacked = stack(allProvinces);

    g.append("g")
      .selectAll("g")
      .data(stacked)
      .join("g")
      .attr("fill", series => CONFIG.riskComponents.find(d => d.key === series.key).color)
      .selectAll("rect")
      .data(series => series.map(d => ({ ...d, key: series.key })))
      .join("rect")
      .attr("class", d => `bar-segment ${getProvinceSelectionClass(d.data.province)}`)
      .attr("x", d => x(d[0]))
      .attr("y", d => y(d.data.province) + (y.bandwidth() - barHeight) / 2)
      .attr("width", d => Math.max(0, x(d[1]) - x(d[0])))
      .attr("height", barHeight)
      .on("click", (event, d) => toggleSelectedProvince(d.data.province))
      .on("mousemove", (event, d) => showTooltip(event, barTooltip(d)))
      .on("mouseleave", hideTooltip);

    g.append("g")
      .selectAll("text.bar-segment-label")
      .data(stacked.flatMap(series => series.map(d => ({ ...d, key: series.key }))))
      .join("text")
      .attr("class", d => `bar-value-label ${getProvinceSelectionClass(d.data.province)}`)
      .attr("x", d => x(d[0]) + ((x(d[1]) - x(d[0])) / 2))
      .attr("y", d => y(d.data.province) + y.bandwidth() / 2 + 0.5)
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "middle")
      .attr("fill", d => {
        const component = CONFIG.riskComponents.find(item => item.key === d.key);
        return getContrastText(component?.color || "#3f8f83");
      })
      .text(d => {
        const width = Math.max(0, x(d[1]) - x(d[0]));
        const value = d.data[d.key];
        if (width >= 34) return d3.format(".1f")(value);
        return "";
      });
  } else {
    g.selectAll("rect.bar-single")
      .data(allProvinces)
      .join("rect")
      .attr("class", d => `bar-single ${getProvinceSelectionClass(d.province)}`)
      .attr("x", d => isDiverging ? Math.min(x(0), x(d.metricValue)) : 0)
      .attr("y", d => y(d.province) + (y.bandwidth() - barHeight) / 2)
      .attr("width", d => isDiverging ? Math.abs(x(d.metricValue) - x(0)) : x(d.metricValue))
      .attr("height", barHeight)
      .attr("fill", d => getScaledColor(d.metricValue, metric, scaleInfo))
      .on("click", (event, d) => toggleSelectedProvince(d.province))
      .on("mousemove", (event, d) => showTooltip(event, singleBarTooltip(d)))
      .on("mouseleave", hideTooltip);

    g.append("g")
      .selectAll("text.bar-metric-label")
      .data(allProvinces)
      .join("text")
      .attr("class", d => `bar-value-label ${getProvinceSelectionClass(d.province)}`)
      .attr("x", d => {
        const start = isDiverging ? Math.min(x(0), x(d.metricValue)) : 0;
        const end = isDiverging ? Math.max(x(0), x(d.metricValue)) : x(d.metricValue);
        return start + ((end - start) / 2);
      })
      .attr("y", d => y(d.province) + y.bandwidth() / 2 + 0.5)
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "middle")
      .attr("fill", d => getContrastText(getScaledColor(d.metricValue, metric, scaleInfo)))
      .text(d => {
        const width = isDiverging ? Math.abs(x(d.metricValue) - x(0)) : x(d.metricValue);
        return width >= 44 ? formatMetricValue(d.metricValue, metric) : "";
      });
  }

  g.append("g")
    .attr("class", "axis")
    .call(d3.axisLeft(y).tickSize(0))
    .call(axis => axis.selectAll("text")
      .attr("class", d => `bar-row-label ${getProvinceSelectionClass(d)}`)
      .style("cursor", "pointer")
      .on("click", (event, d) => toggleSelectedProvince(d)))
    .call(axis => axis.select(".domain").remove());

  g.append("g")
    .attr("class", "axis")
    .call(
      d3.axisTop(x)
        .tickValues(getMetricTicks(scaleInfo, metric))
    )
    .call(axis => axis.select(".domain").remove());

  g.selectAll(".total-label")
    .data(allProvinces)
    .join("text")
    .attr("class", d => `bar-total-label ${getProvinceSelectionClass(d.province)}`)
    .attr("x", d => {
      if (isDiverging) {
        return d.metricValue >= 0
          ? Math.min(innerWidth - 2, x(d.metricValue) + 5)
          : Math.max(2, x(d.metricValue) - 5);
      }

      return Math.min(innerWidth - 2, x(isOverall ? d.overallRisk : d.metricValue) + 5);
    })
    .attr("text-anchor", d => isDiverging && d.metricValue < 0 ? "end" : "start")
    .attr("y", d => y(d.province) + y.bandwidth() / 2 + 4)
    .text(d => isDiverging ? formatMoistureValue(d.metricValue) : d3.format(".1f")(isOverall ? d.overallRisk : d.metricValue));

}

function drawComponentLegend(svg, x, y) {
  const itemWidth = 138;

  const item = svg.append("g")
    .selectAll("g")
    .data(CONFIG.riskComponents)
    .join("g")
    .attr("transform", (_, i) => `translate(${x + i * itemWidth},${y})`);

  item.append("rect")
    .attr("width", 9)
    .attr("height", 9)
    .attr("rx", 2)
    .attr("fill", d => d.color);

  item.append("text")
    .attr("x", 13)
    .attr("y", 8)
    .attr("class", "legend-label")
    .text(d => d.label);
}

function drawBarMetricLegend(svg, x, y, metric, scaleInfo = getMetricScaleInfo([0, 100], metric)) {
  if (metric.key === "moistureBalanceRisk") {
    svg.append("g")
      .attr("transform", `translate(${x},${y})`)
      .append("text")
      .attr("class", "legend-label")
      .attr("x", 0)
      .attr("y", 8)
      // .text(`Scale theo mức hiện tại: ${formatMoistureValue(scaleInfo.domain[0])} → ${formatMoistureValue(scaleInfo.domain[2])}`);
    return;
  }

  if (metric.key === "stormPressure") {
    svg.append("g")
      .attr("transform", `translate(${x},${y})`)
      .append("text")
      .attr("class", "legend-label")
      .attr("x", 0)
      .attr("y", 8)
      // .text(`${metric.label} scale 0 -> ${d3.format(".1f")(scaleInfo.domain[1])}`);
    return;
  }

  const g = svg.append("g").attr("transform", `translate(${x},${y})`);

  if (metric.key === "moistureBalanceRisk") {
    g.append("text")
      .attr("class", "legend-label")
      .attr("x", 0)
      .attr("y", 8)
      .text("Âm = khô · 0 = cân bằng · Dương = ẩm");
    return;
  }

  g.append("text")
    .attr("class", "legend-label")
    .attr("x", 0)
    .attr("y", 8)
    .text(`${metric.label} · thấp → cao`);
}

function barTooltip(d) {
  const component = CONFIG.riskComponents.find(item => item.key === d.key);
  const value = d.data[d.key];
  const pct = d.data.overallRisk ? (value / d.data.overallRisk) * 100 : 0;
  return tooltipCard(d.data.province, [
    tooltipRow("Thành phần", component.label, component.color),
    tooltipRow("Score", d3.format(".1f")(value), component.color),
    tooltipRow("Tỷ trọng", `${d3.format(".1f")(pct)}%`, component.color),
    tooltipRow("Tổng risk", d3.format(".1f")(d.data.overallRisk), getMetricAccent(CONFIG.metrics[0], d.data.overallRisk))
  ]);

  return `
    <strong>${d.data.province}</strong>
    Thành phần: ${component.label}<br/>
    Đóng góp vào tổng risk: ${d3.format(".1f")(value)}<br/>
    Tỷ trọng: ${d3.format(".1f")(pct)}%<br/>
    Rủi ro tổng hợp TB: ${d3.format(".1f")(d.data.overallRisk)}
  `;
}

function singleBarTooltip(d) {
  const metric = getMetricConfig();
  const rows = [
    tooltipRow(metric.label, formatMetricValue(d.metricValue, metric), getMetricAccent(metric, d.metricValue))
  ];

  if (metric.key !== "overallRisk") {
    rows.push(tooltipRow("Tổng risk", d3.format(".1f")(d.overallRisk), getMetricAccent(CONFIG.metrics[0], d.overallRisk)));
  }

  rows.push(tooltipRow("Mức cảnh báo", d.riskLevel, getMetricAccent(CONFIG.metrics[0], d.overallRisk)));
  return tooltipCard(d.province, rows);

  return `
    <strong>${d.province}</strong>
    ${metric.label} TB: ${formatMetricValue(d.metricValue, metric)}<br/>
    Rủi ro tổng hợp TB: ${d3.format(".1f")(d.overallRisk)} · ${d.riskLevel}<br/>
    Cân bằng ẩm: ${formatMoistureValue(d.moistureBalanceRisk)}<br/>
    Gió bão cực đoan: ${d3.format(".1f")(d.stormPressure)}<br/>
    Ngày rủi ro cao: ${d.highDays}
  `;
}

function renderDonut(data) {
  const { svg, width, height } = createSvg("#donut-chart", {
    top: 0,
    right: 8,
    bottom: 8,
    left: 8
  });

  if (!data.length) {
    renderEmpty(svg, width, height);
    return;
  }

  const componentData = CONFIG.riskComponents
    .map(component => ({
      ...component,
      value: d3.sum(data, d => d[component.key])
    }))
    .filter(d => d.value > 0);

  if (!componentData.length) {
    renderEmpty(svg, width, height, "Chưa có thành phần rủi ro.");
    return;
  }

  const availH = height;
  const radius = Math.max(30, Math.min(width, availH) / 2 - 12);
  const innerRadius = radius * 0.58;
  const centerY = availH / 2;

  const g = svg.append("g")
    .attr("transform", `translate(${width / 2},${centerY})`);

  const pie = d3.pie()
    .value(d => d.value)
    .sort(null);

  const arc = d3.arc()
    .innerRadius(innerRadius)
    .outerRadius(radius);

  const total = d3.sum(componentData, d => d.value);
  const pieData = pie(componentData);

  g.selectAll("path")
    .data(pieData)
    .join("path")
    .attr("class", d => `donut-slice ${state.selectedMetric !== "overallRisk" && d.data.metricKey !== state.selectedMetric ? "is-muted" : ""}`)
    .attr("d", arc)
    .attr("fill", d => d.data.color)
    .on("mousemove", (event, d) => {
      const pct = total ? (d.data.value / total) * 100 : 0;
      showTooltip(event, tooltipCard(d.data.label, [
        tooltipRow("Đóng góp", d3.format(".1f")(d.data.value), d.data.color),
        tooltipRow("Tỷ trọng", `${d3.format(".1f")(pct)}%`, d.data.color)
      ]));
      return;

      showTooltip(event, `
        <strong>${d.data.label}</strong>
        Đóng góp: ${d3.format(".1f")(d.data.value)}<br/>
        Tỷ trọng: ${d3.format(".1f")(pct)}%
      `);
    })
    .on("mouseleave", hideTooltip);

  const labelArc = d3.arc()
    .innerRadius(innerRadius + (radius - innerRadius) * 0.5)
    .outerRadius(innerRadius + (radius - innerRadius) * 0.5);

  g.selectAll("text.donut-score")
    .data(pieData)
    .join("text")
    .attr("class", "donut-score")
    .attr("transform", d => `translate(${labelArc.centroid(d)})`)
    .attr("text-anchor", "middle")
    .attr("dominant-baseline", "central")
    .attr("fill", "#fffaf0")
    .attr("font-size", d => (d.endAngle - d.startAngle) > 0.34 ? 9 : 0)
    .attr("font-weight", 800)
    .attr("pointer-events", "none")
    .text(d => {
      const angle = d.endAngle - d.startAngle;
      if (angle < 0.34) return "";
      const pct = total ? (d.data.value / total) * 100 : 0;
      return d3.format(".0f")(pct) + "%";
    });

  g.append("text")
    .attr("text-anchor", "middle")
    .attr("y", -2)
    .attr("font-size", 22)
    .attr("font-weight", 880)
    .attr("fill", "var(--dash-ink)")
    .text(d3.format(".1f")(d3.mean(data, d => d.overallRisk) || 0));

  g.append("text")
    .attr("text-anchor", "middle")
    .attr("y", 15)
    .attr("class", "donut-label")
    .text("Rủi ro TB");

}

function renderCalendarHeatmap(data) {
  const container = document.querySelector("#timeline-chart");
  container.style.width = "95%";
  container.style.height = "95%";
  container.style.minHeight = "150px";

  const margin = { top: 20, right: 18, bottom: 18, left: 50 };
  const { svg, width, height, innerWidth, innerHeight } = createSvg("#timeline-chart", margin);

  svg
    .attr("width", "100%")
    .attr("height", "100%")
    .attr("preserveAspectRatio", "xMidYMid meet")
    .style("display", "block");

  if (!data.length) {
    renderEmpty(svg, width, height);
    return;
  }

  const metric = getMetricConfig();
  const values = aggregateByDate(data);
  const valueByDate = new Map(values.map(d => [+d.date, d]));
  const scaleInfo = getMetricScaleInfo(values.map(d => d.metricValue), metric, { scope: "date" });

  const minDate = d3.timeDay.floor(d3.min(values, d => d.date));
  const maxDate = d3.timeDay.floor(d3.max(values, d => d.date));
  const start = d3.timeSunday.floor(minDate);
  const end = d3.timeSunday.ceil(d3.timeDay.offset(maxDate, 1));

  const dates = d3.timeDay.range(start, end);
  const weekCount = d3.timeSunday.count(start, end);

  const gap = 2;
  const cellWidth = Math.max(7, Math.floor(innerWidth / Math.max(weekCount, 1)));
  const cellHeight = Math.max(7, Math.floor((innerHeight - 10) / 7));
  const cellRadius = Math.max(1, Math.min(cellWidth, cellHeight) * 0.14);
  const labelFontSize = clamp(Math.min(cellWidth, cellHeight) * 0.62, 9, 12);

  const calendarWidth = weekCount * cellWidth;
  const calendarHeight = 7 * cellHeight;

  const offsetX = margin.left + Math.max(0, (innerWidth - calendarWidth) / 2);
  const offsetY = margin.top + Math.max(0, (innerHeight - calendarHeight) / 2);

  const g = svg.append("g")
    .attr("transform", `translate(${offsetX},${offsetY})`);

  const dayLabels = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

  g.selectAll("text.day-label")
    .data(dayLabels)
    .join("text")
    .attr("class", "day-label")
    .attr("x", -8)
    .attr("y", (_, i) => i * cellHeight + cellHeight * 0.68)
    .attr("text-anchor", "end")
    .attr("font-size", labelFontSize)
    .attr("fill", "var(--dash-muted)")
    .text(d => d);

  g.selectAll("rect.calendar-cell")
    .data(dates)
    .join("rect")
    .attr("class", "calendar-cell")
    .attr("x", d => d3.timeSunday.count(start, d) * cellWidth)
    .attr("y", d => d.getDay() * cellHeight)
    .attr("width", Math.max(1, cellWidth - gap))
    .attr("height", Math.max(1, cellHeight - gap))
    .attr("rx", cellRadius)
    .attr("fill", d => {
      const item = valueByDate.get(+d);
      return item ? getScaledColor(item.metricValue, metric, scaleInfo) : "#eee4d3";
    })
    .attr("stroke", "#fffaf0")
    .attr("stroke-width", 0.45)
    .attr("opacity", d => {
      const item = valueByDate.get(+d);
      if (!item) return 0.28;
      if (metric.key === "moistureBalanceRisk") return Math.abs(item.metricValue) < 1 ? 0.5 : 1;
      return item.metricValue > 0 ? 1 : 0.45;
    })
    .on("mousemove", (event, d) => {
      const item = valueByDate.get(+d);
      if (item) showTooltip(event, calendarTooltip(item));
    })
    .on("mouseleave", hideTooltip);

  const monthStarts = d3.timeMonth.range(
    d3.timeMonth.floor(minDate),
    d3.timeMonth.offset(maxDate, 1)
  );

  g.selectAll("text.calendar-month")
    .data(monthStarts)
    .join("text")
    .attr("class", "calendar-month")
    .attr("x", d => d3.timeSunday.count(start, d3.timeSunday.floor(d)) * cellWidth)
    .attr("y", -10)
    .attr("font-size", labelFontSize)
    .attr("font-weight", 700)
    .attr("fill", "var(--dash-muted)")
    .text(d3.timeFormat("%m/%y"));

  g.selectAll("path.month-boundary")
    .data(monthStarts)
    .join("path")
    .attr("class", "month-boundary")
    .attr("fill", "none")
    .attr("stroke", "rgba(102, 74, 44, 0.22)")
    .attr("stroke-width", 0.8)
    .attr("d", d => monthPath(d, start, cellWidth, cellHeight));
}

function monthPath(t0, start, cellWidth, cellHeight = cellWidth) {
  const t1 = d3.timeMonth.offset(t0, 1);
  const d0 = t0.getDay();
  const w0 = d3.timeSunday.count(start, t0);
  const d1 = t1.getDay();
  const w1 = d3.timeSunday.count(start, t1);

  return `
    M${w0 * cellWidth},${d0 * cellHeight}
    H${w0 * cellWidth}
    V${7 * cellHeight}
    H${w1 * cellWidth}
    V${d1 * cellHeight}
    H${w1 * cellWidth}
    V0
    H${w0 * cellWidth}
    Z
  `;
}

function aggregateByDate(data) {
  const metric = getMetricConfig();

  const grouped = d3.rollups(
    data,
    values => {
      const result = {
        date: new Date(+values[0].date),
        records: values.length,
        overallRisk: d3.mean(values, d => d.overallRisk) || 0,
        moistureBalanceRisk: d3.mean(values, d => d.moistureBalanceRisk) || 0,
        moistureImbalanceRisk: d3.mean(values, d => d.moistureImbalanceRisk) || 0,
        stormPressure: d3.mean(values, d => d.stormPressure) || 0,
        wetPressure: d3.mean(values, d => d.wetPressure) || 0,
        dryPressure: d3.mean(values, d => d.dryPressure) || 0,
        rain7d: d3.mean(values, d => d.rain7d) || 0,
        wetStreak: d3.max(values, d => d.wetStreak) || 0,
        dryStreak: d3.max(values, d => d.dryStreak) || 0,
        precip: d3.mean(values, d => d.precip) || 0,
        humidity: d3.mean(values, d => d.humidity) || 0,
        maxWind: d3.mean(values, d => d.maxWind) || 0,
        visibility: d3.mean(values, d => d.visibility) || 0
      };

      result.metricValue = result[metric.key] || 0;
      return result;
    },
    d => +d.date
  );

  const values = grouped
    .map(([, value]) => value)
    .sort((a, b) => d3.ascending(a.date, b.date));

  annotateHighRiskStreaks(values);
  return values;
}

function annotateHighRiskStreaks(values) {
  let streak = 0;
  let previousDate = null;

  values.forEach(d => {
    const isHighRisk = d.overallRisk >= 60;
    const isNextDay = previousDate &&
      d3.timeDay.count(d3.timeDay.floor(previousDate), d3.timeDay.floor(d.date)) === 1;

    streak = isHighRisk
      ? (isNextDay ? streak + 1 : 1)
      : 0;

    d.highRiskStreak = streak;
    previousDate = d.date;
  });
}

function calendarTooltip(d) {
  const metric = getMetricConfig();
  const rows = [
    tooltipRow(metric.label, formatMetricValue(d.metricValue, metric), getMetricAccent(metric, d.metricValue)),
    tooltipRow("Tổng risk", d3.format(".1f")(d.overallRisk), getMetricAccent(CONFIG.metrics[0], d.overallRisk)),
    tooltipRow("Mức cảnh báo", getRiskLevel(d.overallRisk).label, getMetricAccent(CONFIG.metrics[0], d.overallRisk)),
    tooltipRow("Chuỗi rủi ro cao", `${d.highRiskStreak || 0} ngày`, getMetricAccent(CONFIG.metrics[0], d.overallRisk))
  ];

  if (metric.key === "moistureBalanceRisk") {
    rows.push(tooltipRow("Cân bằng ẩm", formatMoistureValue(d.moistureBalanceRisk), getMetricAccent(metric, d.moistureBalanceRisk)));
  } else if (metric.key === "stormPressure") {
    rows.push(tooltipRow("Gió bão", d3.format(".1f")(d.stormPressure), getMetricAccent(metric, d.stormPressure)));
  }

  return tooltipCard(CONFIG.displayDate(d.date), rows);

  return `
    <strong>${CONFIG.displayDate(d.date)}</strong>
    ${metric.label}: ${formatMetricValue(d.metricValue, metric)}<br/>
    Rủi ro tổng hợp: ${d3.format(".1f")(d.overallRisk)} · ${getRiskLevel(d.overallRisk).label}<br/>
    Cân bằng ẩm: ${formatMoistureValue(d.moistureBalanceRisk)}<br/>
    Áp lực ẩm: ${d3.format(".1f")(d.wetPressure)}<br/>
    Áp lực khô: ${d3.format(".1f")(d.dryPressure)}<br/>
    Gió bão cực đoan: ${d3.format(".1f")(d.stormPressure)}<br/>
    Mưa 7 ngày: ${d3.format(".1f")(d.rain7d)} mm<br/>
    Chuỗi ẩm: ${d.wetStreak} ngày<br/>
    Chuỗi khô: ${d.dryStreak} ngày<br/><br/>
    Mưa TB: ${d3.format(".1f")(d.precip)} mm<br/>
    Độ ẩm TB: ${d3.format(".0f")(d.humidity)}%<br/>
    Gió lớn nhất TB: ${d3.format(".1f")(d.maxWind)} km/h<br/>
    Tầm nhìn TB: ${d3.format(".1f")(d.visibility)} km
  `;
}

function formatMetricValue(value, metric = getMetricConfig()) {
  if (metric.key === "moistureBalanceRisk") {
    return formatMoistureValue(value);
  }

  return d3.format(".1f")(value);
}

function formatMoistureValue(value) {
  if (!Number.isFinite(value)) return "-";
  if (value < -0.5) return `${d3.format(".1f")(Math.abs(value))}`;
  if (value > 0.5) return `${d3.format(".1f")(value)}`;
  return "Cân bằng";
}

function renderEmpty(svg, width, height, message = "Không có dữ liệu với bộ lọc hiện tại.") {
  svg.append("foreignObject")
    .attr("width", width)
    .attr("height", height)
    .append("xhtml:div")
    .attr("class", "empty-state")
    .text(message);
}

function showTooltip(event, html) {
  els.tooltip.hidden = false;
  els.tooltip.innerHTML = html;

  const pad = 16;
  const rect = els.tooltip.getBoundingClientRect();

  const x = Math.min(event.clientX + pad, window.innerWidth - rect.width - pad);
  const y = Math.min(event.clientY + pad, window.innerHeight - rect.height - pad);

  els.tooltip.style.left = `${x}px`;
  els.tooltip.style.top = `${y}px`;
}

function hideTooltip() {
  els.tooltip.hidden = true;
}

function clamp(value, min, max) {
  const v = Number.isFinite(value) ? value : 0;
  return Math.max(min, Math.min(max, v));
}

function tooltipCard(title, rows) {
  return `
    <div class="tooltip-card">
      <strong class="tooltip-title">${title}</strong>
      <div class="tooltip-rows">${rows.join("")}</div>
    </div>
  `;
}

function tooltipRow(label, value, color = "var(--dash-ink)") {
  return `
    <div class="tooltip-row">
      <span class="tooltip-key">${label}</span>
      <span class="tooltip-value" style="color:${color}">${value}</span>
    </div>
  `;
}

function getMetricAccent(metric, value) {
  if (metric.key === "overallRisk") {
    return "#b2182b";
  }

  if (metric.key === "moistureBalanceRisk") {
    if (value < -0.5) return "#a6611a";
    if (value > 0.5) return "#018571";
    return "#756b5d";
  }

  if (metric.key === "stormPressure") {
    return "#54278f";
  }

  return "var(--dash-ink)";
}

function getContrastText(color) {
  const hex = color.replace("#", "");

  if (hex.length !== 6) {
    return "#fffaf0";
  }

  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;
  const luminance = (0.2126 * r) + (0.7152 * g) + (0.0722 * b);

  return luminance > 0.6 ? "#1f1a16" : "#fffaf0";
}

