"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/shared/polling_schedule.ts
var polling_schedule_exports = {};
__export(polling_schedule_exports, {
  DEFAULT_FAST_POLL_CRON: () => DEFAULT_FAST_POLL_CRON,
  DEFAULT_FUNDS_HISTORY_CRON: () => DEFAULT_FUNDS_HISTORY_CRON,
  DEFAULT_POLL_CRON: () => DEFAULT_POLL_CRON,
  MINIMUM_INTERVAL_SECONDS: () => MINIMUM_INTERVAL_SECONDS,
  computeNextRunAt: () => computeNextRunAt,
  getPollingCronIntervalSeconds: () => getPollingCronIntervalSeconds,
  normalizePollingCron: () => normalizePollingCron,
  validatePollingCron: () => validatePollingCron
});
function normalizePollingCron(value, fallback = DEFAULT_POLL_CRON) {
  const schedule = String(value || fallback).trim();
  validatePollingCron(schedule);
  return schedule;
}
function validatePollingCron(schedule) {
  const seconds = getPollingCronIntervalSeconds(schedule);
  if (seconds < MINIMUM_INTERVAL_SECONDS) {
    throw new Error(`Polling cron must be at least ${MINIMUM_INTERVAL_SECONDS} seconds; received "${schedule}"`);
  }
}
function getPollingCronIntervalSeconds(schedule) {
  const fields = String(schedule || "").trim().split(/\s+/);
  if (fields.length === 5) {
    assertSimpleCron(fields, 5);
    return stepToSeconds(fields[0], 60);
  }
  if (fields.length === 6) {
    assertSimpleCron(fields, 6);
    return stepToSeconds(fields[0], 1);
  }
  throw new Error(`Unsupported cron schedule "${schedule}". Use a simple pattern like "*/5 * * * *" or "*/30 * * * * *".`);
}
function computeNextRunAt(schedule, from = /* @__PURE__ */ new Date()) {
  const date = normalizeDate(from);
  if (!date) {
    return null;
  }
  const fields = String(schedule || "").trim().split(/\s+/);
  if (fields.length === 5) {
    assertSimpleCron(fields, 5);
    const stepMinutes = stepToSeconds(fields[0], 60) / 60;
    return nextMinuteBoundary(date, stepMinutes).toISOString();
  }
  if (fields.length === 6) {
    assertSimpleCron(fields, 6);
    const stepSeconds = stepToSeconds(fields[0], 1);
    return nextSecondBoundary(date, stepSeconds).toISOString();
  }
  throw new Error(`Unsupported cron schedule "${schedule}". Use a simple pattern like "*/5 * * * *" or "*/30 * * * * *".`);
}
function assertSimpleCron(fields, expectedLength) {
  if (fields.length !== expectedLength) {
    throw new Error(`Unsupported cron schedule. Expected ${expectedLength} fields.`);
  }
  for (let index = 1; index < fields.length; index += 1) {
    if (fields[index] !== "*") {
      throw new Error(`Unsupported cron schedule "${fields.join(" ")}". Only step-based schedules with wildcard trailing fields are supported.`);
    }
  }
}
function stepToSeconds(field, unitSeconds) {
  if (field === "*") {
    return unitSeconds;
  }
  const match = String(field).match(/^\*\/(\d+)$/);
  if (!match) {
    throw new Error(`Unsupported cron step "${field}". Use "*" or "*/N".`);
  }
  const value = Number(match[1]);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Unsupported cron step "${field}". Use "*" or "*/N".`);
  }
  return value * unitSeconds;
}
function nextMinuteBoundary(date, stepMinutes) {
  const currentMinute = date.getMinutes();
  const currentHour = date.getHours();
  const currentSecond = date.getSeconds();
  const currentMs = date.getMilliseconds();
  const elapsedUnits = Math.floor(currentMinute / stepMinutes) + 1;
  const totalMinutes = elapsedUnits * stepMinutes;
  const next = new Date(date);
  next.setSeconds(0, 0);
  next.setMinutes(totalMinutes);
  if (currentSecond === 0 && currentMs === 0 && currentMinute % stepMinutes === 0 && next.getHours() === currentHour && next.getMinutes() === currentMinute) {
    next.setMinutes(next.getMinutes() + stepMinutes);
  }
  return next;
}
function nextSecondBoundary(date, stepSeconds) {
  const currentSecond = date.getSeconds();
  const currentMs = date.getMilliseconds();
  const elapsedUnits = Math.floor(currentSecond / stepSeconds) + 1;
  const totalSeconds = elapsedUnits * stepSeconds;
  const next = new Date(date);
  next.setMilliseconds(0);
  next.setSeconds(totalSeconds);
  if (currentSecond % stepSeconds === 0 && currentMs === 0 && next.getSeconds() === currentSecond) {
    next.setSeconds(next.getSeconds() + stepSeconds);
  }
  return next;
}
function normalizeDate(value) {
  if (!value) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
var DEFAULT_POLL_CRON, DEFAULT_FAST_POLL_CRON, DEFAULT_FUNDS_HISTORY_CRON, MINIMUM_INTERVAL_SECONDS;
var init_polling_schedule = __esm({
  "src/shared/polling_schedule.ts"() {
    "use strict";
    DEFAULT_POLL_CRON = "*/5 * * * *";
    DEFAULT_FAST_POLL_CRON = "*/30 * * * * *";
    DEFAULT_FUNDS_HISTORY_CRON = "*/30 * * * *";
    MINIMUM_INTERVAL_SECONDS = 5;
  }
});

// src/projects/project_filters.ts
var project_filters_exports = {};
__export(project_filters_exports, {
  filterExcludedProjects: () => filterExcludedProjects,
  parseExcludedProjectPatterns: () => parseExcludedProjectPatterns,
  projectMatchesAnyPattern: () => projectMatchesAnyPattern
});
function parseExcludedProjectPatterns(value) {
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.map(normalizePattern).filter(Boolean);
  }
  return String(value).split(/[\r\n,]+/).map(normalizePattern).filter(Boolean);
}
function filterExcludedProjects(projects, patterns) {
  const normalizedPatterns = parseExcludedProjectPatterns(patterns);
  if (normalizedPatterns.length === 0) {
    return {
      projects: Array.isArray(projects) ? projects : [],
      excludedProjects: []
    };
  }
  const includedProjects = [];
  const excludedProjects = [];
  for (const project of Array.isArray(projects) ? projects : []) {
    if (projectMatchesAnyPattern(project, normalizedPatterns)) {
      excludedProjects.push(project);
    } else {
      includedProjects.push(project);
    }
  }
  return {
    projects: includedProjects,
    excludedProjects
  };
}
function projectMatchesAnyPattern(project, patterns) {
  const haystack = [project?.name, project?.slug, project?.id, project?.url].filter(Boolean).map((value) => String(value).toLowerCase()).join(" \0 ");
  return patterns.some((pattern) => haystack.includes(pattern.toLowerCase()));
}
function normalizePattern(value) {
  if (value === void 0 || value === null) {
    return "";
  }
  const text = String(value).trim();
  if (!text || text.startsWith("#")) {
    return "";
  }
  return text;
}
var init_project_filters = __esm({
  "src/projects/project_filters.ts"() {
    "use strict";
  }
});

// src/config/config.ts
var config_exports = {};
__export(config_exports, {
  configureLogging: () => configureLogging,
  normalizeLogLevel: () => normalizeLogLevel,
  normalizeSlug: () => normalizeSlug,
  readConfig: () => readConfig
});
async function readConfig() {
  const config = { ...DEFAULT_CONFIG };
  const optionsPath = "/data/options.json";
  if (import_fs.default.existsSync(optionsPath)) {
    const options = JSON.parse(import_fs.default.readFileSync(optionsPath, "utf8"));
    config.profile = stringOrDefault(options.profile ?? options.profile_name, config.profile);
    config.email = stringOrDefault(options.email ?? options.dataannotation_email, config.email);
    config.password = stringOrDefault(options.password ?? options.dataannotation_password, config.password);
    if (options.poll_cron !== void 0) {
      config.poll_cron = stringOrDefault(options.poll_cron, config.poll_cron);
    }
    config.fast_poll_cron = stringOrDefault(options.fast_poll_cron, config.fast_poll_cron);
    config.funds_history_cron = stringOrDefault(options.funds_history_cron, config.funds_history_cron);
    if (options.funds_history_after_task_delay_minutes !== void 0) {
      config.funds_history_after_task_delay_minutes = integerOrDefault(
        options.funds_history_after_task_delay_minutes,
        config.funds_history_after_task_delay_minutes,
        0,
        1440
      );
    }
    config.excluded_project_patterns = stringOrDefault(options.excluded_project_patterns ?? options.excluded_projects, "");
    config.mqtt_topic_prefix = stringOrDefault(options.mqtt_topic_prefix, config.mqtt_topic_prefix);
    config.log_level = stringOrDefault(options.log_level, config.log_level);
    if (options.wallet_write_enabled !== void 0) {
      config.wallet_write_enabled = booleanOrDefault(options.wallet_write_enabled, config.wallet_write_enabled);
    }
    config.wallet_token = stringOrDefault(options.wallet_token, config.wallet_token);
    config.wallet_data_annotation_account_name = stringOrDefault(options.wallet_data_annotation_account_name, config.wallet_data_annotation_account_name);
    config.wallet_gotyme_account_name = stringOrDefault(options.wallet_gotyme_account_name, config.wallet_gotyme_account_name);
    config.wallet_income_category_name = stringOrDefault(options.wallet_income_category_name, config.wallet_income_category_name);
    config.wallet_fee_category_name = stringOrDefault(options.wallet_fee_category_name, config.wallet_fee_category_name);
    config.wallet_paypal_fee_rate = decimalOrDefault(options.wallet_paypal_fee_rate, config.wallet_paypal_fee_rate, 0, 1);
    config.wallet_paypal_fee_min_usd = decimalOrDefault(options.wallet_paypal_fee_min_usd, config.wallet_paypal_fee_min_usd, 0, Number.MAX_SAFE_INTEGER);
    config.wallet_paypal_fee_max_usd = decimalOrDefault(options.wallet_paypal_fee_max_usd, config.wallet_paypal_fee_max_usd, 0, Number.MAX_SAFE_INTEGER);
    config.wallet_settlement_adjustment = decimalOrDefault(options.wallet_settlement_adjustment, config.wallet_settlement_adjustment, 0, 1);
  }
  if (process.env.EMAIL || process.env.DATAANNOTATION_EMAIL) {
    config.email = process.env.EMAIL || process.env.DATAANNOTATION_EMAIL || config.email;
  }
  if (process.env.PASSWORD || process.env.DATAANNOTATION_PASSWORD) {
    config.password = process.env.PASSWORD || process.env.DATAANNOTATION_PASSWORD || config.password;
  }
  if (process.env.PROFILE || process.env.DATAANNOTATION_PROFILE_NAME) {
    config.profile = process.env.PROFILE || process.env.DATAANNOTATION_PROFILE_NAME || config.profile;
  }
  if (process.env.MQTT_TOPIC_PREFIX) {
    config.mqtt_topic_prefix = process.env.MQTT_TOPIC_PREFIX;
  }
  if (process.env.POLL_CRON) {
    config.poll_cron = process.env.POLL_CRON;
  }
  if (process.env.FAST_POLL_CRON) {
    config.fast_poll_cron = process.env.FAST_POLL_CRON;
  }
  if (process.env.FUNDS_HISTORY_CRON) {
    config.funds_history_cron = process.env.FUNDS_HISTORY_CRON;
  }
  if (process.env.EXCLUDED_PROJECT_PATTERNS) {
    config.excluded_project_patterns = process.env.EXCLUDED_PROJECT_PATTERNS;
  }
  if (process.env.WALLET_TOKEN) {
    config.wallet_token = process.env.WALLET_TOKEN;
  }
  config.profile = stringOrDefault(config.profile, DEFAULT_CONFIG.profile);
  config.email = stringOrDefault(config.email, "");
  config.password = stringOrDefault(config.password, "");
  config.mqtt_topic_prefix = normalizeSlug(config.mqtt_topic_prefix || DEFAULT_CONFIG.mqtt_topic_prefix);
  config.log_level = normalizeLogLevel(config.log_level);
  config.poll_cron = normalizePollingCron(config.poll_cron, DEFAULT_POLL_CRON);
  config.fast_poll_cron = normalizePollingCron(config.fast_poll_cron, DEFAULT_FAST_POLL_CRON);
  config.funds_history_cron = normalizePollingCron(config.funds_history_cron, DEFAULT_FUNDS_HISTORY_CRON);
  config.excluded_project_patterns = parseExcludedProjectPatterns(config.excluded_project_patterns);
  config.browser_profile_dir = "/data/chrome-profile";
  config.wallet_data_annotation_account_name = stringOrDefault(config.wallet_data_annotation_account_name, DEFAULT_CONFIG.wallet_data_annotation_account_name);
  config.wallet_gotyme_account_name = stringOrDefault(config.wallet_gotyme_account_name, DEFAULT_CONFIG.wallet_gotyme_account_name);
  config.wallet_income_category_name = stringOrDefault(config.wallet_income_category_name, DEFAULT_CONFIG.wallet_income_category_name);
  config.wallet_fee_category_name = stringOrDefault(config.wallet_fee_category_name, DEFAULT_CONFIG.wallet_fee_category_name);
  config.wallet_paypal_fee_rate = decimalOrDefault(config.wallet_paypal_fee_rate, DEFAULT_CONFIG.wallet_paypal_fee_rate, 0, 1);
  config.wallet_paypal_fee_min_usd = decimalOrDefault(config.wallet_paypal_fee_min_usd, DEFAULT_CONFIG.wallet_paypal_fee_min_usd, 0, Number.MAX_SAFE_INTEGER);
  config.wallet_paypal_fee_max_usd = decimalOrDefault(config.wallet_paypal_fee_max_usd, DEFAULT_CONFIG.wallet_paypal_fee_max_usd, 0, Number.MAX_SAFE_INTEGER);
  config.wallet_settlement_adjustment = decimalOrDefault(config.wallet_settlement_adjustment, DEFAULT_CONFIG.wallet_settlement_adjustment, 0, 1);
  config.wallet_token = stringOrDefault(config.wallet_token, DEFAULT_CONFIG.wallet_token);
  Object.assign(config, await getMqttFromSupervisor());
  config.mqtt_host = stringOrDefault(process.env.MQTT_HOST || config.mqtt_host, "");
  config.mqtt_port = integerOrDefault(process.env.MQTT_PORT || config.mqtt_port, 1883, 1, 65535);
  config.mqtt_username = stringOrDefault(process.env.MQTT_USERNAME || config.mqtt_username, "");
  config.mqtt_password = stringOrDefault(process.env.MQTT_PASSWORD || config.mqtt_password, "");
  if (!config.email) {
    throw new Error("Configuration value 'email' is required");
  }
  if (!config.password) {
    throw new Error("Configuration value 'password' is required");
  }
  if (config.wallet_write_enabled && !config.wallet_token) {
    throw new Error("Configuration value 'wallet_token' is required when wallet_write_enabled is true");
  }
  if (!config.mqtt_host) {
    throw new Error("No MQTT broker configured. Install Mosquitto or expose MQTT_HOST variables.");
  }
  return config;
}
function configureLogging(logLevel) {
  const levels = /* @__PURE__ */ new Set(["debug", "info", "warning", "error"]);
  const level = levels.has(String(logLevel).toLowerCase()) ? String(logLevel).toLowerCase() : "info";
  process.env.BASHIO_LOG_LEVEL = level;
}
function normalizeSlug(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "dataannotation";
}
function normalizeLogLevel(value) {
  const allowed = ["debug", "info", "warning", "error"];
  const normalized = String(value || "info").toLowerCase();
  return allowed.includes(normalized) ? normalized : "info";
}
function stringOrDefault(value, fallback) {
  if (value === void 0 || value === null) {
    return fallback;
  }
  const text = String(value).trim();
  return text || fallback;
}
function integerOrDefault(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  const rounded = Math.trunc(parsed);
  return Math.min(max, Math.max(min, rounded));
}
function decimalOrDefault(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
}
function booleanOrDefault(value, fallback) {
  if (value === void 0 || value === null) {
    return fallback;
  }
  if (typeof value === "boolean") {
    return value;
  }
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
}
async function getMqttFromSupervisor() {
  const fallback = {
    mqtt_host: null,
    mqtt_port: 1883,
    mqtt_username: null,
    mqtt_password: null
  };
  const token = process.env.SUPERVISOR_TOKEN;
  if (!token) {
    return fallback;
  }
  return new Promise((resolve) => {
    const request = import_http.default.request(
      {
        hostname: "supervisor",
        path: "/services/mqtt",
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      },
      (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => {
          try {
            const payload = JSON.parse(body);
            const data = payload.data || payload;
            resolve({
              mqtt_host: data.host || fallback.mqtt_host,
              mqtt_port: Number(data.port || fallback.mqtt_port),
              mqtt_username: data.username || fallback.mqtt_username,
              mqtt_password: data.password || fallback.mqtt_password
            });
          } catch {
            resolve(fallback);
          }
        });
      }
    );
    request.on("error", () => resolve(fallback));
    request.setTimeout(1e4, () => {
      request.destroy();
      resolve(fallback);
    });
    request.end();
  });
}
var import_fs, import_http, DEFAULT_CONFIG;
var init_config = __esm({
  "src/config/config.ts"() {
    "use strict";
    import_fs = __toESM(require("fs"));
    import_http = __toESM(require("http"));
    init_polling_schedule();
    init_project_filters();
    DEFAULT_CONFIG = {
      profile: "",
      email: "",
      password: "",
      poll_cron: DEFAULT_POLL_CRON,
      fast_poll_cron: DEFAULT_FAST_POLL_CRON,
      funds_history_cron: DEFAULT_FUNDS_HISTORY_CRON,
      funds_history_after_task_delay_minutes: 2,
      excluded_project_patterns: [],
      mqtt_topic_prefix: "dataannotation",
      log_level: "info",
      wallet_write_enabled: false,
      wallet_token: "",
      wallet_data_annotation_account_name: "Data Annotation",
      wallet_gotyme_account_name: "GoTyme",
      wallet_income_category_name: "Income",
      wallet_fee_category_name: "Charges, Fees",
      wallet_paypal_fee_rate: 0.01,
      wallet_paypal_fee_min_usd: 0.25,
      wallet_paypal_fee_max_usd: 10,
      wallet_settlement_adjustment: 0.99856
    };
  }
});

// src/projects/project_claim.ts
var require_project_claim = __commonJS({
  "src/projects/project_claim.ts"(exports2, module2) {
    "use strict";
    var crypto2 = require("node:crypto");
    var CLAIM_WORK_SCREEN_METRICS = {
      width: 2560,
      height: 1440,
      deviceScaleFactor: 1,
      mobile: false,
      hasTouch: false,
      screenWidth: 2560,
      screenHeight: 1440,
      positionX: 0,
      positionY: 0,
      dontSetVisibleSize: false
    };
    function formatClaimProjectEntityName(name) {
      return `Claim Project - ${shortenProjectName(name, 40)}`;
    }
    function buildClaimProjectTarget(project) {
      return {
        slug: String(project?.slug || "").trim(),
        name: String(project?.name || "").trim(),
        id: String(project?.id || "").trim()
      };
    }
    function claimProjectTargetMatchesRowText(rowText, target) {
      const normalizedRowText = normalizeClaimText(rowText);
      const normalizedTarget = buildClaimProjectTarget(target);
      return [normalizedTarget.name, normalizedTarget.slug, normalizedTarget.id].filter(Boolean).some((needle) => normalizedRowText.includes(normalizeClaimText(needle)));
    }
    function shortenProjectName(name, maxLength = 40) {
      const cleaned = normalizeProjectName(name);
      if (cleaned.length <= maxLength) {
        return cleaned;
      }
      return `${cleaned.slice(0, Math.max(0, maxLength - 1)).trimEnd()}\u2026`;
    }
    function normalizeProjectName(name) {
      return String(name || "Unknown project").replace(/^(?:\[[^\]]+\]\s*)+/, "").replace(/\s+-\s+\d{2}\/\d{2}\/\d{2}\s*$/, "").replace(/\s+/g, " ").trim();
    }
    function normalizeClaimText(value) {
      return String(value || "").trim().replace(/\s+/g, " ");
    }
    module2.exports = {
      CLAIM_WORK_SCREEN_METRICS,
      buildClaimProjectTarget,
      claimProjectTargetMatchesRowText,
      formatClaimProjectEntityName,
      normalizeProjectName,
      shortenProjectName
    };
  }
});

// src/integrations/mqtt_discovery.ts
var require_mqtt_discovery = __commonJS({
  "src/integrations/mqtt_discovery.ts"(exports2, module2) {
    "use strict";
    function normalizeProjectName(name) {
      return String(name || "Unknown project").trim().replace(/^(?:\[[^\]]+\]\s*)+/, "").replace(/\s+-\s+\d{2}\/\d{2}\/\d{2}\s*$/, "").replace(/\s+/g, " ").trim();
    }
    function shortenProjectName(name, maxLength = 40) {
      const cleaned = normalizeProjectName(name);
      if (cleaned.length <= maxLength) {
        return cleaned;
      }
      return `${cleaned.slice(0, Math.max(0, maxLength - 1)).trimEnd()}\u2026`;
    }
    function formatProjectEntityName(name) {
      return `Project - ${shortenProjectName(name, 40)}`;
    }
    function buildDiscoveryNames() {
      return {
        button: "Sync Now",
        profile: "Profile",
        project_count: "Project Count",
        total_tasks: "Total Tasks",
        in_progress_task: "In Progress Task",
        withdraw_locked: "Withdraw Locked",
        claim_projects_locked: "Claim Projects Locked",
        fast_polling: "Fast Polling",
        auto_accept: "Auto Accept",
        currency_mode: "Currency to PHP",
        usd_php_rate: "USD to PHP Rate",
        withdraw_funds: "Withdraw Funds",
        rebuild_discovery: "Rebuild Discovery",
        next_payout: "Next Payout"
      };
    }
    function buildDeviceInfo(profileName, version2) {
      return {
        identifiers: [`dataannotation_${slugify(profileName)}`],
        name: "Data Annotation",
        manufacturer: "Data Annotation",
        model: "Worker Projects Scraper",
        sw_version: version2
      };
    }
    function slugify(value) {
      const normalized = String(value || "dataannotation").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
      return normalized || "dataannotation";
    }
    module2.exports = {
      buildDeviceInfo,
      buildDiscoveryNames,
      formatProjectEntityName,
      normalizeProjectName,
      shortenProjectName,
      slugify
    };
  }
});

// src/integrations/mqtt_topics.ts
var require_mqtt_topics = __commonJS({
  "src/integrations/mqtt_topics.ts"(exports2, module2) {
    "use strict";
    function buildTopicHelpers(topicPrefix) {
      return {
        topic: (suffix) => `${topicPrefix}/${suffix}`,
        projectStateTopic: (slug) => `${topicPrefix}/projects/${slug}/state`,
        projectAvailabilityTopic: (slug) => `${topicPrefix}/projects/${slug}/availability`
      };
    }
    module2.exports = {
      buildTopicHelpers
    };
  }
});

// src/integrations/mqtt_bridge.ts
var require_mqtt_bridge = __commonJS({
  "src/integrations/mqtt_bridge.ts"(exports2, module2) {
    "use strict";
    var NULL_LOGGER = {
      debug() {
      },
      info() {
      },
      warning() {
      },
      error() {
      }
    };
    var { formatClaimProjectEntityName } = require_project_claim();
    var { buildDeviceInfo, buildDiscoveryNames, formatProjectEntityName, shortenProjectName, slugify } = require_mqtt_discovery();
    var { buildTopicHelpers } = require_mqtt_topics();
    function numberOrZero3(value) {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    var DataAnnotationMqttBridge = class {
      constructor(options) {
        const mqtt = require("mqtt");
        this.topicPrefix = options.topicPrefix;
        this.topics = buildTopicHelpers(this.topicPrefix);
        this.profileName = options.profileName;
        this.version = options.version;
        this.logger = options.logger || NULL_LOGGER;
        this.scanRequested = { value: false };
        this.withdrawRequested = { value: false };
        this.withdrawLockChange = { value: null };
        this.claimProjectsLockChange = { value: null };
        this.fastPollingChange = { value: null };
        this.autoAcceptChange = { value: null };
        this.currencyModeChange = { value: null };
        this.rebuildDiscoveryRequested = { value: false };
        this.claimRequested = { value: null };
        this.publishedProjectSlugs = /* @__PURE__ */ new Set();
        this.publishedClaimProjectSlugs = /* @__PURE__ */ new Set();
        this.connected = false;
        this._availabilityState = "offline";
        this.client = mqtt.connect({
          host: options.host,
          port: options.port,
          username: options.username,
          password: options.password,
          protocol: "mqtt",
          reconnectPeriod: 5e3,
          clientId: `${this.topicPrefix}_${slugify(this.profileName)}`,
          will: {
            topic: this._topic("availability"),
            payload: "offline",
            retain: true,
            qos: 1
          }
        });
        this.device = buildDeviceInfo(this.profileName, this.version);
        this.client.on("connect", () => {
          this.connected = true;
          this.logger.info("Connected to MQTT broker");
          this.client.subscribe(
            [this._topic("command/sync"), this._topic("command/withdraw"), this._topic("command/rebuild_discovery"), this._topic("withdraw/lock/set"), this._topic("fast/poll/set"), this._topic("claim/lock/set"), this._topic("auto_accept/set"), this._topic("currency/mode/set"), this._topic("claim/+")],
            { qos: 1 }
          );
          this.logger.debug(`Subscribed to ${this._topic("command/sync")}`);
          this.logger.debug(`Subscribed to ${this._topic("command/withdraw")}`);
          this.logger.debug(`Subscribed to ${this._topic("command/rebuild_discovery")}`);
          this.logger.debug(`Subscribed to ${this._topic("withdraw/lock/set")}`);
          this.logger.debug(`Subscribed to ${this._topic("fast/poll/set")}`);
          this.logger.debug(`Subscribed to ${this._topic("claim/lock/set")}`);
          this.logger.debug(`Subscribed to ${this._topic("auto_accept/set")}`);
          this.logger.debug(`Subscribed to ${this._topic("currency/mode/set")}`);
          this.logger.debug(`Subscribed to ${this._topic("claim/+")}`);
        });
        this.client.on("close", () => {
          this.connected = false;
          this.logger.warning("MQTT connection closed");
        });
        this.client.on("error", (error) => {
          this.logger.warning(`MQTT error: ${error.message}`);
        });
        this.client.on("message", (topic, payload) => {
          const message = String(payload || "").trim().toLowerCase();
          if (topic === this._topic("command/sync") && message === "now") {
            this.logger.info("Received manual sync request via MQTT");
            this.scanRequested.value = true;
          } else if (topic === this._topic("command/withdraw") && message === "withdraw") {
            this.logger.info("Received withdraw request via MQTT");
            this.withdrawRequested.value = true;
          } else if (topic === this._topic("command/rebuild_discovery") && message === "rebuild") {
            this.logger.info("Received discovery rebuild request via MQTT");
            this.rebuildDiscoveryRequested.value = true;
          } else if (topic === this._topic("withdraw/lock/set") && message === "on") {
            this.logger.info("Received withdraw lock request: ON");
            this.withdrawLockChange.value = true;
            this.logger.debug("Publishing optimistic withdraw lock state: ON");
            this.publishWithdrawLockState(true);
          } else if (topic === this._topic("withdraw/lock/set") && message === "off") {
            this.logger.info("Received withdraw lock request: OFF");
            this.withdrawLockChange.value = false;
            this.logger.debug("Publishing optimistic withdraw lock state: OFF");
            this.publishWithdrawLockState(false);
          } else if (topic === this._topic("fast/poll/set") && message === "on") {
            this.logger.info("Received fast polling request: ON");
            this.fastPollingChange.value = true;
            this.logger.debug("Publishing optimistic fast polling state: ON");
            this.publishFastPollingState(true);
          } else if (topic === this._topic("fast/poll/set") && message === "off") {
            this.logger.info("Received fast polling request: OFF");
            this.fastPollingChange.value = false;
            this.logger.debug("Publishing optimistic fast polling state: OFF");
            this.publishFastPollingState(false);
          } else if (topic === this._topic("claim/lock/set") && message === "on") {
            this.logger.info("Received claim projects lock request: ON");
            this.claimProjectsLockChange.value = true;
            this.logger.debug("Publishing optimistic claim projects lock state: ON");
            this.publishClaimProjectsLockState(true);
          } else if (topic === this._topic("claim/lock/set") && message === "off") {
            this.logger.info("Received claim projects lock request: OFF");
            this.claimProjectsLockChange.value = false;
            this.logger.debug("Publishing optimistic claim projects lock state: OFF");
            this.publishClaimProjectsLockState(false);
          } else if (topic === this._topic("auto_accept/set") && message === "on") {
            this.logger.info("Received auto accept request: ON");
            this.autoAcceptChange.value = true;
            this.logger.debug("Publishing optimistic auto accept state: ON");
            this.publishAutoAcceptState(true);
          } else if (topic === this._topic("auto_accept/set") && message === "off") {
            this.logger.info("Received auto accept request: OFF");
            this.autoAcceptChange.value = false;
            this.logger.debug("Publishing optimistic auto accept state: OFF");
            this.publishAutoAcceptState(false);
          } else if (topic === this._topic("currency/mode/set") && message === "on") {
            this.logger.info("Received currency mode request: PHP");
            this.currencyModeChange.value = true;
            this.logger.debug("Publishing optimistic currency mode state: PHP");
            this.publishCurrencyModeState(true);
          } else if (topic === this._topic("currency/mode/set") && message === "off") {
            this.logger.info("Received currency mode request: USD");
            this.currencyModeChange.value = false;
            this.logger.debug("Publishing optimistic currency mode state: USD");
            this.publishCurrencyModeState(false);
          } else if (topic.startsWith(this._topic("claim/")) && topic !== this._topic("claim/lock/set") && message === "claim") {
            const slug = topic.slice(this._topic("claim/").length);
            if (slug) {
              this.logger.info(`Received claim project request via MQTT for ${slug}`);
              this.claimRequested.value = { slug };
            }
          }
        });
      }
      async waitForConnection(timeoutMs = 1e4) {
        if (this.connected) {
          return true;
        }
        await new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error("MQTT connection timeout")), timeoutMs);
          this.client.once("connect", () => {
            clearTimeout(timer);
            resolve();
          });
          this.client.once("error", (error) => {
            clearTimeout(timer);
            reject(error);
          });
        });
        return true;
      }
      publishDiscovery({ currencyUnit = "USD" } = {}) {
        this.logger.debug("Publishing MQTT discovery payloads");
        const discoveryEntries = this._buildStaticDiscoveryEntries(currencyUnit);
        discoveryEntries.forEach((entry) => this._publishDiscovery(entry.component, entry.objectId, entry.payload));
      }
      rebuildDiscovery({ currencyUnit = "USD" } = {}) {
        this.logger.info("Rebuilding MQTT discovery payloads");
        const discoveryEntries = this._buildStaticDiscoveryEntries(currencyUnit);
        discoveryEntries.forEach((entry) => this._publish(`homeassistant/${entry.component}/${this.topicPrefix}_${entry.objectId}/config`, "", true));
        discoveryEntries.forEach((entry) => this._publishDiscovery(entry.component, entry.objectId, entry.payload));
      }
      _buildStaticDiscoveryEntries(currencyUnit) {
        const names = buildDiscoveryNames();
        return [
          {
            component: "button",
            objectId: "sync_now",
            payload: {
              name: names.button,
              unique_id: `${this.topicPrefix}_sync_now`,
              command_topic: this._topic("command/sync"),
              payload_press: "now",
              availability_topic: this._topic("availability"),
              payload_available: "online",
              payload_not_available: "offline",
              icon: "mdi:refresh",
              device: this.device
            }
          },
          {
            component: "button",
            objectId: "rebuild_discovery",
            payload: {
              name: names.rebuild_discovery,
              unique_id: `${this.topicPrefix}_rebuild_discovery`,
              entity_category: "config",
              command_topic: this._topic("command/rebuild_discovery"),
              payload_press: "rebuild",
              availability_topic: this._topic("availability"),
              payload_available: "online",
              payload_not_available: "offline",
              icon: "mdi:database-refresh",
              device: this.device
            }
          },
          {
            component: "switch",
            objectId: "withdraw_locked",
            payload: {
              name: names.withdraw_locked,
              unique_id: `${this.topicPrefix}_withdraw_locked`,
              entity_category: "config",
              state_topic: this._topic("withdraw/lock/state"),
              command_topic: this._topic("withdraw/lock/set"),
              payload_on: "ON",
              payload_off: "OFF",
              state_on: "ON",
              state_off: "OFF",
              availability_topic: this._topic("availability"),
              payload_available: "online",
              payload_not_available: "offline",
              icon: "mdi:lock",
              device: this.device
            }
          },
          {
            component: "switch",
            objectId: "claim_projects_locked",
            payload: {
              name: names.claim_projects_locked,
              unique_id: `${this.topicPrefix}_claim_projects_locked`,
              entity_category: "config",
              state_topic: this._topic("claim/lock/state"),
              command_topic: this._topic("claim/lock/set"),
              payload_on: "ON",
              payload_off: "OFF",
              state_on: "ON",
              state_off: "OFF",
              availability_topic: this._topic("availability"),
              payload_available: "online",
              payload_not_available: "offline",
              icon: "mdi:briefcase-lock",
              device: this.device
            }
          },
          {
            component: "switch",
            objectId: "fast_polling",
            payload: {
              name: names.fast_polling,
              unique_id: `${this.topicPrefix}_fast_polling`,
              entity_category: "config",
              state_topic: this._topic("fast/poll/state"),
              command_topic: this._topic("fast/poll/set"),
              payload_on: "ON",
              payload_off: "OFF",
              state_on: "ON",
              state_off: "OFF",
              availability_topic: this._topic("availability"),
              payload_available: "online",
              payload_not_available: "offline",
              icon: "mdi:flash",
              device: this.device
            }
          },
          {
            component: "switch",
            objectId: "currency_mode",
            payload: {
              name: names.currency_mode,
              unique_id: `${this.topicPrefix}_currency_mode`,
              entity_category: "config",
              state_topic: this._topic("currency/mode/state"),
              command_topic: this._topic("currency/mode/set"),
              payload_on: "ON",
              payload_off: "OFF",
              state_on: "ON",
              state_off: "OFF",
              availability_topic: this._topic("availability"),
              payload_available: "online",
              payload_not_available: "offline",
              icon: "mdi:currency-php",
              device: this.device
            }
          },
          {
            component: "switch",
            objectId: "auto_accept",
            payload: {
              name: names.auto_accept,
              unique_id: `${this.topicPrefix}_auto_accept`,
              entity_category: "config",
              state_topic: this._topic("auto_accept/state"),
              command_topic: this._topic("auto_accept/set"),
              payload_on: "ON",
              payload_off: "OFF",
              state_on: "ON",
              state_off: "OFF",
              availability_topic: this._topic("availability"),
              payload_available: "online",
              payload_not_available: "offline",
              icon: "mdi:robot",
              device: this.device
            }
          },
          {
            component: "button",
            objectId: "withdraw_funds",
            payload: {
              name: names.withdraw_funds,
              unique_id: `${this.topicPrefix}_withdraw_funds`,
              command_topic: this._topic("command/withdraw"),
              payload_press: "withdraw",
              availability_topic: this._topic("availability"),
              payload_available: "online",
              payload_not_available: "offline",
              icon: "mdi:cash-sync",
              device: this.device
            }
          },
          {
            component: "sensor",
            objectId: "profile_name",
            payload: {
              name: names.profile,
              unique_id: `${this.topicPrefix}_profile_name`,
              entity_category: "diagnostic",
              state_topic: this._topic("profile/state"),
              force_update: true,
              availability_topic: this._topic("availability"),
              payload_available: "online",
              payload_not_available: "offline",
              icon: "mdi:account",
              device: this.device
            }
          },
          {
            component: "sensor",
            objectId: "project_count",
            payload: {
              name: names.project_count,
              unique_id: `${this.topicPrefix}_project_count`,
              state_topic: this._topic("projects/summary"),
              value_template: "{{ value_json.count }}",
              force_update: true,
              availability_topic: this._topic("availability"),
              payload_available: "online",
              payload_not_available: "offline",
              icon: "mdi:counter",
              device: this.device
            }
          },
          {
            component: "sensor",
            objectId: "total_tasks",
            payload: {
              name: names.total_tasks,
              unique_id: `${this.topicPrefix}_total_tasks`,
              state_topic: this._topic("projects/summary"),
              value_template: "{{ value_json.total_tasks }}",
              json_attributes_topic: this._topic("projects/summary"),
              json_attributes_template: "{{ {'excluded_project_count': value_json.excluded_project_count, 'excluded_project_names': value_json.excluded_project_names, 'new_task_detected': value_json.new_task_detected, 'new_task_count': value_json.new_task_count, 'new_task_project_name': value_json.new_task_project_name, 'new_task_project_url': value_json.new_task_project_url, 'new_task_detected_at': value_json.new_task_detected_at, 'new_tasks': value_json.new_tasks} | tojson }}",
              force_update: true,
              availability_topic: this._topic("availability"),
              payload_available: "online",
              payload_not_available: "offline",
              unit_of_measurement: "tasks",
              icon: "mdi:counter-plus",
              device: this.device
            }
          },
          {
            component: "binary_sensor",
            objectId: "in_progress_task",
            payload: {
              name: names.in_progress_task,
              unique_id: `${this.topicPrefix}_in_progress_task`,
              state_topic: this._topic("tasks/status"),
              value_template: "{{ 'ON' if value_json.in_progress_task else 'OFF' }}",
              json_attributes_topic: this._topic("tasks/status"),
              force_update: true,
              availability_topic: this._topic("availability"),
              payload_available: "online",
              payload_not_available: "offline",
              icon: "mdi:briefcase-clock",
              device: this.device
            }
          },
          {
            component: "sensor",
            objectId: "available_funds",
            payload: {
              name: "Available Funds",
              unique_id: `${this.topicPrefix}_available_funds`,
              state_topic: this._topic("payments/summary"),
              value_template: "{{ value_json.available_amount }}",
              unit_of_measurement: currencyUnit,
              force_update: true,
              availability_topic: this._topic("availability"),
              payload_available: "online",
              payload_not_available: "offline",
              icon: "mdi:cash",
              device: this.device
            }
          },
          {
            component: "binary_sensor",
            objectId: "can_withdraw",
            payload: {
              name: "Can Withdraw",
              unique_id: `${this.topicPrefix}_can_withdraw`,
              state_topic: this._topic("payments/summary"),
              value_template: "{{ 'ON' if value_json.can_withdraw else 'OFF' }}",
              payload_on: "ON",
              payload_off: "OFF",
              force_update: true,
              availability_topic: this._topic("availability"),
              payload_available: "online",
              payload_not_available: "offline",
              icon: "mdi:cash-check",
              device: this.device
            }
          },
          {
            component: "sensor",
            objectId: "next_withdrawal",
            payload: {
              name: "Next Withdrawal",
              unique_id: `${this.topicPrefix}_next_withdrawal`,
              state_topic: this._topic("payments/summary"),
              value_template: "{{ value_json.next_withdrawal_at if value_json.next_withdrawal_at else 'unknown' }}",
              json_attributes_topic: this._topic("payments/summary"),
              json_attributes_template: "{{ {'next_withdrawal_amount': value_json.next_withdrawal_amount, 'next_withdrawal_amount_cents': value_json.next_withdrawal_amount_cents, 'next_withdrawal_amount_formatted': value_json.next_withdrawal_amount_formatted} | tojson }}",
              force_update: true,
              availability_topic: this._topic("availability"),
              payload_available: "online",
              payload_not_available: "offline",
              device_class: "timestamp",
              icon: "mdi:calendar-clock",
              device: this.device
            }
          },
          {
            component: "sensor",
            objectId: "next_payout",
            payload: {
              name: names.next_payout,
              unique_id: `${this.topicPrefix}_next_payout`,
              state_topic: this._topic("payments/summary"),
              value_template: "{{ value_json.next_payout_at if value_json.next_payout_at else 'unknown' }}",
              json_attributes_topic: this._topic("payments/summary"),
              json_attributes_template: "{{ {'next_payout_at_human': value_json.next_payout_at_human, 'next_payout_entries': value_json.next_payout_entries_public, 'next_payout_entries_count': value_json.next_payout_entries_count, 'next_payout_amount': value_json.next_payout_amount, 'next_payout_source': value_json.next_payout_source, 'next_payout_confidence': value_json.next_payout_confidence, 'next_withdrawal_at': value_json.next_withdrawal_at} | tojson }}",
              force_update: true,
              availability_topic: this._topic("availability"),
              payload_available: "online",
              payload_not_available: "offline",
              device_class: "timestamp",
              icon: "mdi:calendar-arrow-right",
              device: this.device
            }
          },
          {
            component: "sensor",
            objectId: "total_earnings",
            payload: {
              name: "Total Earnings",
              unique_id: `${this.topicPrefix}_total_earnings`,
              entity_category: "diagnostic",
              state_topic: this._topic("payments/summary"),
              value_template: "{{ value_json.total_earnings }}",
              unit_of_measurement: currencyUnit,
              force_update: true,
              availability_topic: this._topic("availability"),
              payload_available: "online",
              payload_not_available: "offline",
              icon: "mdi:wallet",
              device: this.device
            }
          },
          {
            component: "sensor",
            objectId: "total_paid_out",
            payload: {
              name: "Total Paid Out",
              unique_id: `${this.topicPrefix}_total_paid_out`,
              entity_category: "diagnostic",
              state_topic: this._topic("payments/summary"),
              value_template: "{{ value_json.total_paid_out }}",
              unit_of_measurement: currencyUnit,
              force_update: true,
              availability_topic: this._topic("availability"),
              payload_available: "online",
              payload_not_available: "offline",
              icon: "mdi:cash-multiple",
              device: this.device
            }
          },
          {
            component: "sensor",
            objectId: "this_month",
            payload: {
              name: "This Month",
              unique_id: `${this.topicPrefix}_this_month`,
              entity_category: "diagnostic",
              state_topic: this._topic("payments/summary"),
              value_template: "{{ value_json.this_month }}",
              unit_of_measurement: currencyUnit,
              force_update: true,
              availability_topic: this._topic("availability"),
              payload_available: "online",
              payload_not_available: "offline",
              icon: "mdi:calendar-month",
              device: this.device
            }
          },
          {
            component: "sensor",
            objectId: "best_month",
            payload: {
              name: "Best Month",
              unique_id: `${this.topicPrefix}_best_month`,
              entity_category: "diagnostic",
              state_topic: this._topic("payments/summary"),
              value_template: "{{ value_json.best_month }}",
              unit_of_measurement: currencyUnit,
              force_update: true,
              availability_topic: this._topic("availability"),
              payload_available: "online",
              payload_not_available: "offline",
              icon: "mdi:trophy",
              device: this.device
            }
          },
          {
            component: "sensor",
            objectId: "pending_approval",
            payload: {
              name: "Pending Approval",
              unique_id: `${this.topicPrefix}_pending_approval`,
              state_topic: this._topic("payments/summary"),
              value_template: "{{ value_json.pending_approval }}",
              json_attributes_topic: this._topic("payments/summary"),
              json_attributes_template: "{{ {'pending_payout_entries': value_json.pending_payout_entries_public, 'next_withdrawal_at': value_json.next_withdrawal_at} | tojson }}",
              unit_of_measurement: currencyUnit,
              force_update: true,
              availability_topic: this._topic("availability"),
              payload_available: "online",
              payload_not_available: "offline",
              icon: "mdi:progress-clock",
              device: this.device
            }
          },
          {
            component: "sensor",
            objectId: "last_payout",
            payload: {
              name: "Last Payout",
              unique_id: `${this.topicPrefix}_last_payout`,
              entity_category: "diagnostic",
              state_topic: this._topic("payments/summary"),
              value_template: '{{ value_json.last_payout_at if value_json.last_payout_at else "unknown" }}',
              json_attributes_topic: this._topic("payments/summary"),
              json_attributes_template: "{{ {'last_payout_amount': value_json.last_payout_amount, 'last_payout_amount_cents': value_json.last_payout_amount_cents, 'last_payout_amount_formatted': value_json.last_payout_amount_formatted} | tojson }}",
              force_update: true,
              availability_topic: this._topic("availability"),
              payload_available: "online",
              payload_not_available: "offline",
              device_class: "timestamp",
              icon: "mdi:cash-check",
              device: this.device
            }
          },
          {
            component: "sensor",
            objectId: "usd_php_rate",
            payload: {
              name: names.usd_php_rate,
              unique_id: `${this.topicPrefix}_usd_php_rate`,
              entity_category: "diagnostic",
              state_topic: this._topic("currency/rate"),
              value_template: "{{ value_json.rate }}",
              json_attributes_topic: this._topic("currency/rate"),
              force_update: true,
              availability_topic: this._topic("availability"),
              payload_available: "online",
              payload_not_available: "offline",
              unit_of_measurement: "PHP/USD",
              state_class: "measurement",
              icon: "mdi:cash-sync",
              device: this.device
            }
          }
        ];
      }
      publishOnline() {
        this._availabilityState = "online";
        this._publish(this._topic("availability"), "online", true);
      }
      publishOffline() {
        this._availabilityState = "offline";
        this._publish(this._topic("availability"), "offline", true);
      }
      publishProfile(profileName) {
        this.logger.debug(`Publishing profile name: ${profileName || ""}`);
        this._publish(this._topic("profile/state"), profileName || "", true);
      }
      publishWithdrawLockState(locked) {
        const state = locked ? "ON" : "OFF";
        this.logger.debug(`Publishing withdraw lock state: ${state}`);
        this._publish(this._topic("withdraw/lock/state"), state, true);
      }
      publishClaimProjectsLockState(locked) {
        const state = locked ? "ON" : "OFF";
        this.logger.debug(`Publishing claim projects lock state: ${state}`);
        this._publish(this._topic("claim/lock/state"), state, true);
      }
      publishFastPollingState(enabled) {
        const state = enabled ? "ON" : "OFF";
        this.logger.debug(`Publishing fast polling state: ${state}`);
        this._publish(this._topic("fast/poll/state"), state, true);
      }
      publishAutoAcceptState(enabled) {
        const state = enabled ? "ON" : "OFF";
        this.logger.debug(`Publishing auto accept state: ${state}`);
        this._publish(this._topic("auto_accept/state"), state, true);
      }
      publishCurrencyModeState(enabled) {
        const state = enabled ? "ON" : "OFF";
        this.logger.debug(`Publishing currency mode state: ${state}`);
        this._publish(this._topic("currency/mode/state"), state, true);
      }
      publishCurrencyRate(rateState, scrapedAt = (/* @__PURE__ */ new Date()).toISOString()) {
        const payload = { ...rateState || {}, scraped_at: rateState?.scraped_at || scrapedAt };
        this.logger.debug(`Publishing currency rate: ${payload.rate || "unknown"}`);
        this._publishJson(this._topic("currency/rate"), payload, true);
      }
      publishSummary(summary) {
        this.logger.debug(`Publishing project summary: ${summary.count} projects, ${summary.total_tasks || 0} total tasks`);
        this._publishJson(this._topic("projects/summary"), summary, true);
      }
      publishStatusSuccess(attributes) {
        this.logger.debug("Publishing status success");
      }
      publishStatusError(attributes) {
        this.logger.debug("Publishing status error");
      }
      publishTaskStatus(taskStatus, scrapedAt = (/* @__PURE__ */ new Date()).toISOString()) {
        const payload = { ...taskStatus || {}, scraped_at: taskStatus?.scraped_at || scrapedAt };
        this.logger.debug(`Publishing task status: inProgress=${Boolean(payload.in_progress_task)}, count=${payload.in_progress_task_count || 0}`);
        this._publishJson(this._topic("tasks/status"), payload, true);
      }
      publishProjects(projects, scrapedAt = (/* @__PURE__ */ new Date()).toISOString()) {
        this.logger.debug(`Publishing ${projects.length} project entities`);
        const currentSlugs = /* @__PURE__ */ new Set();
        const currentClaimSlugs = /* @__PURE__ */ new Set();
        for (const project of projects) {
          if (numberOrZero3(project.tasks) > 0) {
            currentSlugs.add(project.slug);
            this._publishProjectDiscovery(project);
            this._publishProjectState(project, scrapedAt);
            this._publish(this._projectAvailabilityTopic(project.slug), "online", true);
            this.publishedProjectSlugs.add(project.slug);
            currentClaimSlugs.add(project.slug);
            this._publishProjectClaimDiscovery(project);
            this.publishedClaimProjectSlugs.add(project.slug);
          } else {
            this._deleteProjectEntity(project.slug);
            this._deleteProjectClaimEntity(project.slug);
          }
        }
        for (const publishedSlug of this.publishedProjectSlugs) {
          if (!currentSlugs.has(publishedSlug)) {
            this._deleteProjectEntity(publishedSlug);
          }
        }
        for (const publishedSlug of this.publishedClaimProjectSlugs) {
          if (!currentClaimSlugs.has(publishedSlug)) {
            this._deleteProjectClaimEntity(publishedSlug);
          }
        }
        this.publishedProjectSlugs = currentSlugs;
        this.publishedClaimProjectSlugs = currentClaimSlugs;
      }
      publishPublishedProjectAvailability(available) {
        const state = available ? "online" : "offline";
        for (const slug of this.publishedProjectSlugs) {
          this._publish(this._projectAvailabilityTopic(slug), state, true);
        }
      }
      publishPayments(payments, scrapedAt = (/* @__PURE__ */ new Date()).toISOString()) {
        this.logger.debug(`Publishing payments summary: available=${payments.available_amount_formatted}, canWithdraw=${payments.can_withdraw}`);
        this._publishJson(this._topic("payments/summary"), { ...payments, scraped_at: payments.scraped_at || scrapedAt }, true);
      }
      async close() {
        this.logger.info("Shutting down MQTT bridge");
        this.publishOffline();
        await new Promise((resolve) => this.client.end(false, {}, resolve));
      }
      _publishProjectDiscovery(project) {
        this._publishDiscovery("sensor", project.slug, {
          name: formatProjectEntityName(project.name),
          unique_id: `${this.topicPrefix}_${project.slug}`,
          state_topic: this._projectStateTopic(project.slug),
          value_template: "{{ value_json.tasks if value_json.tasks is not none else 0 }}",
          force_update: true,
          json_attributes_topic: this._projectStateTopic(project.slug),
          availability_topic: this._projectAvailabilityTopic(project.slug),
          payload_available: "online",
          payload_not_available: "offline",
          icon: "mdi:briefcase-outline",
          device: this.device
        });
      }
      _publishProjectState(project, scrapedAt) {
        const payload = { ...project, scraped_at: scrapedAt };
        delete payload.slug;
        this._publishJson(this._projectStateTopic(project.slug), payload, true);
      }
      _publishProjectClaimDiscovery(project) {
        this._publishDiscovery("button", `claim_project_${project.slug}`, {
          name: formatClaimProjectEntityName(project.name),
          unique_id: `${this.topicPrefix}_claim_project_${project.slug}`,
          command_topic: this._topic(`claim/${project.slug}`),
          payload_press: "claim",
          availability_topic: this._projectAvailabilityTopic(project.slug),
          payload_available: "online",
          payload_not_available: "offline",
          icon: "mdi:briefcase-check",
          device: this.device
        });
      }
      _publishDiscovery(component, objectId, payload) {
        this._publishJson(`homeassistant/${component}/${this.topicPrefix}_${objectId}/config`, payload, true);
      }
      _deleteProjectEntity(slug) {
        this._publish(`homeassistant/sensor/${this.topicPrefix}_${slug}/config`, "", true);
        this._publish(this._projectAvailabilityTopic(slug), "offline", true);
      }
      _deleteProjectClaimEntity(slug) {
        this._publish(`homeassistant/button/${this.topicPrefix}_claim_project_${slug}/config`, "", true);
      }
      _publishJson(topic, payload, retain) {
        this._publish(topic, JSON.stringify(payload), retain);
      }
      _publish(topic, payload, retain) {
        this.client.publish(topic, payload, { qos: 1, retain });
      }
      _topic(suffix) {
        return this.topics.topic(suffix);
      }
      _projectStateTopic(slug) {
        return this.topics.projectStateTopic(slug);
      }
      _projectAvailabilityTopic(slug) {
        return this.topics.projectAvailabilityTopic(slug);
      }
    };
    module2.exports = {
      DataAnnotationMqttBridge,
      buildDeviceInfo,
      buildDiscoveryNames,
      formatProjectEntityName,
      shortenProjectName
    };
  }
});

// src/scrapers/projects.ts
var projects_exports = {};
__export(projects_exports, {
  buildProjectUrl: () => buildProjectUrl,
  classifyCategory: () => classifyCategory,
  extractProjects: () => extractProjects,
  formatCreated: () => formatCreated,
  formatCurrencyPerHour: () => formatCurrencyPerHour,
  normalizeBadgeTag: () => normalizeBadgeTag,
  normalizeProject: () => normalizeProject,
  stableSlug: () => stableSlug,
  summarizeProjects: () => summarizeProjects
});
function extractProjects(props) {
  const data = props;
  const dashboardProjects = Array.isArray(data?.dashboardMerchTargeting?.projects) ? data.dashboardMerchTargeting.projects : [];
  const easyProjects = Array.isArray(data?.dashboardMerchTargeting?.easyProjects) ? data.dashboardMerchTargeting.easyProjects : [];
  const list = [...dashboardProjects, ...easyProjects];
  const seen = /* @__PURE__ */ new Set();
  const projects = [];
  for (const rawProject of list) {
    const project = normalizeProject(rawProject);
    if (!project || numberOrZero(project.tasks) <= 0) {
      continue;
    }
    if (seen.has(String(project.slug))) {
      continue;
    }
    seen.add(String(project.slug));
    projects.push(project);
  }
  return projects;
}
function summarizeProjects(projects) {
  return {
    count: Array.isArray(projects) ? projects.length : 0,
    total_tasks: Array.isArray(projects) ? projects.reduce((sum, project) => sum + numberOrZero(project?.tasks), 0) : 0
  };
}
function normalizeProject(project) {
  const name = stringOrEmpty(project?.name) || stringOrEmpty(project?.workerSubtitle) || "Unknown project";
  const tasks = numberOrZero(project?.availableTasksFor);
  const payPerHourInCents = numberOrZero(project?.payPerHourInCents);
  const priorityPayPerHourInCents = numberOrZero(project?.priorityPayPerHourInCents);
  const basePayPerHourInCents = Math.max(0, payPerHourInCents - priorityPayPerHourInCents);
  const created = formatCreated(project?.created);
  const id = stringOrEmpty(project?.id) || null;
  const tags = buildTags(project);
  return {
    id,
    url: buildProjectUrl(id),
    slug: stableSlug(name, id, created),
    name,
    tasks,
    pay: formatCurrencyPerHour(payPerHourInCents),
    base_pay: formatCurrencyPerHour(basePayPerHourInCents),
    priority_pay: formatCurrencyPerHour(priorityPayPerHourInCents),
    tags,
    category: classifyCategory(project),
    created
  };
}
function buildTags(project) {
  const tags = [];
  for (const badge of Array.isArray(project?.badges) ? project.badges : []) {
    const normalized = normalizeBadgeTag(badge);
    if (normalized) {
      tags.push(normalized);
    }
  }
  if (project?.isCoding && !tags.includes("Coding")) {
    tags.push("Coding");
  }
  if (project?.qualification && !tags.includes("Qualification")) {
    tags.push("Qualification");
  }
  return [...new Set(tags)].filter(Boolean);
}
function normalizeBadgeTag(badge) {
  if (!badge) {
    return null;
  }
  switch (badge.kind) {
    case "priority_pay":
      return "Priority Pay";
    case "domain_coding":
      return "Coding";
    case "qualification":
      return "Qualification";
    default:
      return badge.label ? String(badge.label) : badge.kind ? String(badge.kind) : null;
  }
}
function classifyCategory(project) {
  if (project?.qualification) {
    return "qualification";
  }
  if (project?.isCoding) {
    return "coding";
  }
  return "project";
}
function formatCreated(value) {
  if (!value) {
    return null;
  }
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    timeZone: "UTC"
  }).format(date).replace(/^([A-Z][a-z]{2})\s0?/, "$1 ");
}
function formatCurrencyPerHour(valueInCents) {
  return `$${(Number(valueInCents) / 100).toFixed(2)}/hr`;
}
function buildProjectUrl(id) {
  const projectId = stringOrEmpty(id);
  if (!projectId) {
    return null;
  }
  return `https://app.dataannotation.tech/workers/projects/${encodeURIComponent(projectId)}`;
}
function stableSlug(name, id, created) {
  const hash = import_crypto.default.createHash("sha1").update([name, id || "", created || ""].join("|")).digest("hex").slice(0, 12);
  return `project_${hash}`;
}
function stringOrEmpty(value) {
  if (value === void 0 || value === null) {
    return "";
  }
  return String(value).trim();
}
function numberOrZero(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
var import_crypto;
var init_projects = __esm({
  "src/scrapers/projects.ts"() {
    "use strict";
    import_crypto = __toESM(require("crypto"));
  }
});

// src/scrapers/task_status.ts
var require_task_status = __commonJS({
  "src/scrapers/task_status.ts"(exports2, module2) {
    "use strict";
    function extractTaskStatus(props, pageUrl = null, scrapedAt = null) {
      const inProgressTasks = Array.isArray(props?.inProgressTasksInfo) ? props.inProgressTasksInfo : [];
      return {
        in_progress_task: inProgressTasks.length > 0,
        in_progress_task_count: inProgressTasks.length,
        in_progress_tasks: inProgressTasks.map(normalizeInProgressTask).filter(Boolean),
        in_progress_task_source: pageUrl && /\/workers\/projects(?:\/|$)/.test(pageUrl) ? "projects_page" : "unknown",
        page_url: pageUrl,
        scraped_at: scrapedAt
      };
    }
    function normalizeInProgressTask(task) {
      if (!task || typeof task !== "object") {
        return null;
      }
      return {
        id: stringOrNull2(task.id),
        project_id: stringOrNull2(task.projectId),
        project_name: stringOrNull2(task.projectName),
        task_id: stringOrNull2(task.taskId),
        started_at: stringOrNull2(task.startedAt),
        expires_at: stringOrNull2(task.expiresAt)
      };
    }
    function stringOrNull2(value) {
      if (value === void 0 || value === null || value === "") {
        return null;
      }
      return String(value);
    }
    module2.exports = {
      extractTaskStatus,
      normalizeInProgressTask
    };
  }
});

// src/state/funds_history_observations.ts
var require_funds_history_observations = __commonJS({
  "src/state/funds_history_observations.ts"(exports2, module2) {
    "use strict";
    var path6 = require("node:path");
    var fs7 = require("node:fs");
    var DAY_MS = 24 * 60 * 60 * 1e3;
    var DEFAULT_OBSERVATIONS = {
      version: 1,
      entries: {},
      updated_at: null
    };
    function loadFundsHistoryObservations(filePath) {
      if (!filePath || !fs7.existsSync(filePath)) {
        return cloneObservations(DEFAULT_OBSERVATIONS);
      }
      try {
        return normalizeObservations(JSON.parse(fs7.readFileSync(filePath, "utf8")));
      } catch {
        return cloneObservations(DEFAULT_OBSERVATIONS);
      }
    }
    function saveFundsHistoryObservations(filePath, observations) {
      if (!filePath) {
        return;
      }
      const normalized = normalizeObservations(observations);
      fs7.mkdirSync(path6.dirname(filePath), { recursive: true });
      fs7.writeFileSync(filePath, JSON.stringify(normalized, null, 2));
    }
    function applyFundsHistoryObservations(entries, observations = null, now = /* @__PURE__ */ new Date()) {
      const current = normalizeDate2(now) || /* @__PURE__ */ new Date();
      const state = normalizeObservations(observations);
      const seenFingerprints = /* @__PURE__ */ new Set();
      const mergedEntries = [];
      for (const entry of Array.isArray(entries) ? entries : []) {
        if (!entry || !entry.status) {
          continue;
        }
        const fingerprint = buildFundsHistoryEntryFingerprint(entry);
        const existing = fingerprint ? state.entries[fingerprint] || null : null;
        if (entry.status === "paid") {
          if (fingerprint) {
            delete state.entries[fingerprint];
            seenFingerprints.add(fingerprint);
          }
          continue;
        }
        if (fingerprint) {
          seenFingerprints.add(fingerprint);
        }
        const estimate = existing ? {
          estimated_work_at: existing.estimated_work_at || null,
          estimated_payout_at: existing.estimated_payout_at || null,
          estimate_source: existing.estimate_source || null,
          estimate_confidence: existing.estimate_confidence || null,
          first_seen_at: existing.first_seen_at || existing.last_seen_at || current.toISOString()
        } : estimateFundsHistoryEntry(entry, current);
        const mergedEntry = {
          ...entry,
          fingerprint: fingerprint || null,
          first_seen_at: estimate.first_seen_at || current.toISOString(),
          last_seen_at: current.toISOString(),
          estimated_work_at: estimate.estimated_work_at || null,
          estimated_payout_at: estimate.estimated_payout_at || null,
          estimate_source: estimate.estimate_source || null,
          estimate_confidence: estimate.estimate_confidence || null
        };
        if (fingerprint) {
          state.entries[fingerprint] = pickStoredObservationFields(mergedEntry);
        }
        mergedEntries.push(mergedEntry);
      }
      for (const [fingerprint, observation] of Object.entries(state.entries)) {
        if (seenFingerprints.has(fingerprint)) {
          continue;
        }
        if (observation.status === "paid") {
          delete state.entries[fingerprint];
          continue;
        }
        const payoutAt = normalizeDate2(observation.estimated_payout_at);
        if (payoutAt && payoutAt.getTime() <= current.getTime()) {
          delete state.entries[fingerprint];
        }
      }
      state.updated_at = current.toISOString();
      return {
        entries: mergedEntries,
        observations: state
      };
    }
    function estimateFundsHistoryEntry(entry, now = /* @__PURE__ */ new Date()) {
      const current = normalizeDate2(now) || /* @__PURE__ */ new Date();
      const ageUnit = String(entry?.relative_age_unit || "").toLowerCase();
      const ageValue = numberOrZero3(entry?.relative_age_value);
      const dueDays = numberOrZero3(entry?.due_days) || (entry?.kind === "task" ? 3 : 7);
      const entryDate = normalizeDate2(entry?.entry_date);
      let estimatedWorkAt = null;
      let estimateSource = null;
      let estimateConfidence = null;
      if ((ageUnit === "hour" || ageUnit === "minute") && ageValue > 0) {
        estimatedWorkAt = new Date(current.getTime() - ageValue * relativeAgeUnitToMs(ageUnit));
        estimateSource = ageUnit === "minute" ? "observed_minutes" : "observed_hours";
        estimateConfidence = "high";
      } else if (entryDate) {
        estimatedWorkAt = entryDate;
        estimateSource = "row_date_fallback";
        estimateConfidence = "low";
      } else {
        estimatedWorkAt = current;
        estimateSource = "current_time_fallback";
        estimateConfidence = "low";
      }
      let estimatedPayoutAt = null;
      if ((ageUnit === "hour" || ageUnit === "minute") && ageValue > 0) {
        estimatedPayoutAt = estimatePayoutAtFromWorkAt(estimatedWorkAt, dueDays, current);
      } else if (entryDate) {
        estimatedPayoutAt = estimatePayoutAtFromEntryDate(entryDate, dueDays, current);
      } else {
        estimatedPayoutAt = toLocalMidnightAtOffset(current, dueDays) || new Date(current.getTime() + dueDays * DAY_MS);
      }
      return {
        first_seen_at: current.toISOString(),
        estimated_work_at: estimatedWorkAt.toISOString(),
        estimated_payout_at: estimatedPayoutAt.toISOString(),
        estimate_source: estimateSource,
        estimate_confidence: estimateConfidence
      };
    }
    function buildFundsHistoryEntryFingerprint(entry) {
      const parts = [
        normalizeText2(entry?.entry_date || ""),
        normalizeText2(entry?.project || ""),
        normalizeText2(entry?.kind || ""),
        normalizeText2(entry?.amount || ""),
        normalizeText2(entry?.duration || "")
      ];
      if (parts.every((part) => !part)) {
        return null;
      }
      return parts.join("|");
    }
    function pickStoredObservationFields(entry) {
      return {
        fingerprint: entry.fingerprint,
        project: entry.project,
        kind: entry.kind,
        status: entry.status,
        amount: entry.amount,
        amount_cents: entry.amount_cents,
        duration: entry.duration,
        entry_date: entry.entry_date,
        relative_age_value: entry.relative_age_value,
        relative_age_unit: entry.relative_age_unit,
        relative_age_text: entry.relative_age_text,
        days_until_available: entry.days_until_available,
        due_days: entry.due_days,
        first_seen_at: entry.first_seen_at,
        last_seen_at: entry.last_seen_at,
        estimated_work_at: entry.estimated_work_at,
        estimated_payout_at: entry.estimated_payout_at,
        estimate_source: entry.estimate_source,
        estimate_confidence: entry.estimate_confidence
      };
    }
    function normalizeObservations(value) {
      const entries = value && typeof value === "object" && value.entries && typeof value.entries === "object" ? value.entries : {};
      const normalizedEntries = {};
      for (const [fingerprint, entry] of Object.entries(entries)) {
        const normalized = normalizeObservationEntry(fingerprint, entry);
        if (normalized) {
          normalizedEntries[fingerprint] = normalized;
        }
      }
      return {
        version: 1,
        entries: normalizedEntries,
        updated_at: normalizeIsoDate(value?.updated_at) || null
      };
    }
    function normalizeObservationEntry(fingerprint, entry) {
      if (!entry || typeof entry !== "object") {
        return null;
      }
      const normalizedFingerprint = normalizeText2(entry.fingerprint || fingerprint);
      if (!normalizedFingerprint) {
        return null;
      }
      const normalized = {
        fingerprint: normalizedFingerprint,
        project: entry.project || null,
        kind: entry.kind || null,
        status: entry.status || "pending",
        amount: entry.amount || null,
        amount_cents: numberOrZero3(entry.amount_cents),
        duration: entry.duration || null,
        entry_date: normalizeIsoDate(entry.entry_date) || null,
        relative_age_value: numberOrZero3(entry.relative_age_value),
        relative_age_unit: entry.relative_age_unit || null,
        relative_age_text: entry.relative_age_text || null,
        days_until_available: numberOrZero3(entry.days_until_available),
        due_days: numberOrZero3(entry.due_days),
        first_seen_at: normalizeIsoDate(entry.first_seen_at) || null,
        last_seen_at: normalizeIsoDate(entry.last_seen_at) || null,
        estimated_work_at: normalizeIsoDate(entry.estimated_work_at) || null,
        estimated_payout_at: normalizeIsoDate(entry.estimated_payout_at) || null,
        estimate_source: entry.estimate_source || null,
        estimate_confidence: entry.estimate_confidence || null
      };
      return repairObservationEntry(normalized);
    }
    function normalizeIsoDate(value) {
      const date = normalizeDate2(value);
      return date ? date.toISOString() : null;
    }
    function normalizeDate2(value) {
      if (!value) {
        return null;
      }
      const date = value instanceof Date ? value : new Date(value);
      return Number.isNaN(date.getTime()) ? null : date;
    }
    function nextLocalMidnight(value, daysOffset) {
      const date = normalizeDate2(value);
      if (!date) {
        return null;
      }
      const result = new Date(date);
      result.setDate(result.getDate() + numberOrZero3(daysOffset));
      result.setHours(0, 0, 0, 0);
      return result;
    }
    function toLocalMidnightAtOffset(value, daysOffset) {
      return nextLocalMidnight(value, daysOffset);
    }
    function estimatePayoutAtFromEntryDate(entryDate, dueDays, now = /* @__PURE__ */ new Date()) {
      const baseDate = normalizeDate2(entryDate);
      if (!baseDate) {
        return null;
      }
      const payoutDate = new Date(
        baseDate.getFullYear(),
        baseDate.getMonth(),
        baseDate.getDate() + numberOrZero3(dueDays) + 1,
        0,
        0,
        0,
        0
      );
      const current = normalizeDate2(now) || /* @__PURE__ */ new Date();
      if (payoutDate <= current) {
        payoutDate.setDate(payoutDate.getDate() + 1);
      }
      return payoutDate;
    }
    function estimatePayoutAtFromWorkAt(workAt, dueDays, now = /* @__PURE__ */ new Date()) {
      const baseDate = normalizeDate2(workAt);
      if (!baseDate) {
        return null;
      }
      const payoutDate = new Date(baseDate.getTime() + numberOrZero3(dueDays) * DAY_MS);
      const current = normalizeDate2(now) || /* @__PURE__ */ new Date();
      if (payoutDate <= current) {
        payoutDate.setDate(payoutDate.getDate() + 1);
      }
      return payoutDate;
    }
    function repairObservationEntry(entry) {
      const current = normalizeDate2(entry.last_seen_at || entry.first_seen_at || /* @__PURE__ */ new Date()) || /* @__PURE__ */ new Date();
      const payoutAt = normalizeDate2(entry.estimated_payout_at);
      const workAt = normalizeDate2(entry.estimated_work_at);
      const dueDays = numberOrZero3(entry.due_days) || (entry.kind === "task" ? 3 : 7);
      const shouldRepairMidnightFallback = Boolean(
        payoutAt && workAt && payoutAt.getUTCHours() === 0 && payoutAt.getUTCMinutes() === 0 && payoutAt.getUTCSeconds() === 0 && payoutAt.getUTCMilliseconds() === 0
      );
      if (shouldRepairMidnightFallback) {
        const repaired = estimatePayoutAtFromWorkAt(workAt, dueDays, current);
        if (repaired) {
          return {
            ...entry,
            estimated_payout_at: repaired.toISOString()
          };
        }
      }
      if (payoutAt && payoutAt.getTime() <= current.getTime()) {
        if (workAt) {
          const repaired = estimatePayoutAtFromWorkAt(workAt, dueDays, current);
          if (repaired) {
            return {
              ...entry,
              estimated_payout_at: repaired.toISOString()
            };
          }
        }
        return {
          ...entry,
          estimated_payout_at: new Date(current.getTime() + DAY_MS).toISOString()
        };
      }
      return entry;
    }
    function cloneObservations(value) {
      return normalizeObservations(JSON.parse(JSON.stringify(value)));
    }
    function normalizeText2(value) {
      if (value === void 0 || value === null) {
        return "";
      }
      return String(value).trim().toLowerCase();
    }
    function numberOrZero3(value) {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    function relativeAgeUnitToMs(unit) {
      switch (String(unit || "").toLowerCase()) {
        case "minute":
          return 60 * 1e3;
        case "hour":
          return 60 * 60 * 1e3;
        default:
          return DAY_MS;
      }
    }
    module2.exports = {
      applyFundsHistoryObservations,
      loadFundsHistoryObservations,
      saveFundsHistoryObservations
    };
  }
});

// src/scrapers/funds_history.ts
var require_funds_history = __commonJS({
  "src/scrapers/funds_history.ts"(exports2, module2) {
    "use strict";
    var MONTH_SUMMARY_PATTERN = /^[A-Z][a-z]{2}\s+\d{1,2}(?:\s+\$[\d,]+(?:\.\d{2})?)?$/;
    var {
      applyFundsHistoryObservations,
      loadFundsHistoryObservations,
      saveFundsHistoryObservations
    } = require_funds_history_observations();
    var DETAIL_ROW_PATTERN = /^(Time Entry|Task Submission)\s+(?:·{1,3}\s+)?(\$[\d,]+(?:\.\d{2})?)(?:\s+(.*?))?\s+(Pending Approval|Paid)\s+·\s+(\d+)\s+(minute|hour|day|week)s?\s+ago$/i;
    var DETAIL_KIND_PATTERN = /\b(Time Entry|Task Submission)\b/i;
    var MONTH_NAMES = [
      "jan",
      "feb",
      "mar",
      "apr",
      "may",
      "jun",
      "jul",
      "aug",
      "sep",
      "oct",
      "nov",
      "dec"
    ];
    async function scrapeFundsHistory(page, { observationsPath = null, now = /* @__PURE__ */ new Date() } = {}) {
      await openFundsHistoryTab(page);
      await expandFundsHistoryRows(page);
      const rows = await page.$$eval("tr", (tableRows) => {
        const normalize = (value) => String(value || "").trim().replace(/\s+/g, " ");
        return tableRows.map((row) => normalize(row.innerText || row.textContent || "")).filter(Boolean);
      });
      const parsedEntries = parseFundsHistoryEntries(rows, now);
      const observations = loadFundsHistoryObservations(observationsPath);
      const merged = applyFundsHistoryObservations(parsedEntries, observations, now);
      if (observationsPath) {
        try {
          saveFundsHistoryObservations(observationsPath, merged.observations);
        } catch {
        }
      }
      return summarizeFundsHistoryEntries(merged.entries, now);
    }
    function parseFundsHistoryEntries(rows, now = /* @__PURE__ */ new Date()) {
      const entries = [];
      let currentProject = null;
      let currentMonthDate = null;
      for (const rowText of Array.isArray(rows) ? rows : []) {
        const text = normalizeText2(rowText);
        if (!text) {
          continue;
        }
        if (MONTH_SUMMARY_PATTERN.test(text)) {
          currentMonthDate = parseMonthSummaryDate(text, now);
          currentProject = null;
          continue;
        }
        if (isProjectSummaryRow(text)) {
          currentProject = extractProjectName(text);
          continue;
        }
        const entry = parseFundsHistoryDetailRow(text, currentProject, currentMonthDate, now);
        if (entry) {
          entries.push(entry);
        }
      }
      return entries;
    }
    function summarizeFundsHistoryEntries(entries, now = /* @__PURE__ */ new Date()) {
      const pendingEntries = Array.isArray(entries) ? entries.filter((entry) => entry.status === "pending") : [];
      const paidEntries = Array.isArray(entries) ? entries.filter((entry) => entry.status === "paid") : [];
      const lastPayoutSummary = summarizeLastPayoutEntries(paidEntries);
      const nextPayoutDays = pendingEntries.length > 0 ? Math.min(...pendingEntries.map((entry) => entry.days_until_available)) : 0;
      const nextPayoutAt = pendingEntries.length > 0 ? pendingEntries.map((entry) => normalizeIsoDate(entry.estimated_payout_at) || computeNextPayoutAt(entry, now)).filter(Boolean).sort()[0] || null : null;
      return {
        next_payout_days: nextPayoutDays,
        next_payout_at: nextPayoutAt,
        next_payout_entries_count: pendingEntries.length,
        pending_payout_entries: pendingEntries,
        last_payout_amount_cents: lastPayoutSummary.amount_cents,
        last_payout_amount: lastPayoutSummary.amount,
        last_payout_amount_formatted: lastPayoutSummary.amount_formatted
      };
    }
    function formatPublicPayoutEntries(entries) {
      return sortPayoutEntries(entries).map((entry) => formatPublicPayoutEntry(entry));
    }
    function formatPublicPayoutEntry(entry) {
      return {
        project: entry?.project || null,
        kind: entry?.kind || null,
        amount: entry?.amount || null,
        relative_age: entry?.relative_age_text || null,
        estimated_work_at: formatHumanTimestamp(entry?.estimated_work_at),
        estimated_payout_at: formatHumanTimestamp(entry?.estimated_payout_at),
        source: entry?.estimate_source || null,
        confidence: entry?.estimate_confidence || null
      };
    }
    function parseFundsHistoryDetailRow(text, project, entryDate = null, now = /* @__PURE__ */ new Date()) {
      const match = text.match(DETAIL_ROW_PATTERN);
      if (!match) {
        return null;
      }
      const [, kindLabel, amount, durationText, statusLabel, relativeAgeValue, relativeAgeUnit] = match;
      const kind = kindLabel.toLowerCase() === "time entry" ? "hourly" : "task";
      const status = statusLabel.toLowerCase() === "pending approval" ? "pending" : "paid";
      const normalizedAgeValue = Number(relativeAgeValue);
      const normalizedAgeUnit = relativeAgeUnit.toLowerCase();
      const dueDays = kind === "hourly" ? 7 : 3;
      const ageDays = normalizedAgeUnit === "minute" ? normalizedAgeValue / (24 * 60) : normalizedAgeUnit === "hour" ? normalizedAgeValue / 24 : normalizedAgeUnit === "week" ? normalizedAgeValue * 7 : normalizedAgeValue;
      const normalizedEntryDate = normalizeDate2(entryDate);
      const entryDateValue = normalizedEntryDate ? normalizedEntryDate.toISOString() : null;
      const isPreciseEstimate = (normalizedAgeUnit === "minute" || normalizedAgeUnit === "hour") && Number.isFinite(normalizedAgeValue) && normalizedAgeValue > 0;
      const estimatedWorkAt = isPreciseEstimate ? estimateWorkAt(now, normalizedAgeValue, normalizedAgeUnit, entryDateValue) : entryDateValue || normalizeDate2(now)?.toISOString() || (/* @__PURE__ */ new Date()).toISOString();
      const estimatedPayoutAt = isPreciseEstimate ? estimatePayoutAt(estimatedWorkAt, dueDays, now) : estimatePayoutAtFromEntryDate(entryDateValue, dueDays, now) || toLocalMidnightAtOffset(now, dueDays);
      return {
        project: project || null,
        kind,
        status,
        amount,
        amount_cents: amountToCents(amount),
        duration: durationText ? durationText.trim() : null,
        relative_age_value: Number.isFinite(normalizedAgeValue) ? normalizedAgeValue : 0,
        relative_age_unit: normalizedAgeUnit,
        relative_age_text: `${Number.isFinite(normalizedAgeValue) ? normalizedAgeValue : 0} ${normalizedAgeUnit}${Number.isFinite(normalizedAgeValue) && normalizedAgeValue === 1 ? "" : "s"} ago`,
        days_ago: Math.ceil(ageDays),
        days_until_available: Math.max(0, Math.ceil(dueDays - ageDays)),
        entry_date: entryDateValue,
        due_days: dueDays,
        estimated_work_at: estimatedWorkAt,
        estimated_payout_at: estimatedPayoutAt,
        estimate_source: normalizedAgeUnit === "minute" ? "observed_minutes" : normalizedAgeUnit === "hour" ? "observed_hours" : "row_date_fallback",
        estimate_confidence: isPreciseEstimate ? "high" : "low"
      };
    }
    function isProjectSummaryRow(text) {
      return /^.+\s+\$[\d,]+(?:\.\d{2})?$/.test(text) && !MONTH_SUMMARY_PATTERN.test(text) && !DETAIL_KIND_PATTERN.test(text) && !/\b(Paid|Pending Approval)\b/i.test(text);
    }
    function extractProjectName(text) {
      return text.replace(/\s+\$[\d,]+(?:\.\d{2})?$/, "").trim();
    }
    function parseMonthSummaryDate(text, now = /* @__PURE__ */ new Date()) {
      const match = String(text).trim().match(/^([A-Z][a-z]{2})\s+(\d{1,2})/);
      if (!match) {
        return null;
      }
      const monthIndex = MONTH_NAMES.indexOf(match[1].toLowerCase());
      if (monthIndex === -1) {
        return null;
      }
      const current = normalizeDate2(now) || /* @__PURE__ */ new Date();
      const year = inferYearForMonth(monthIndex, current);
      return new Date(year, monthIndex, Number(match[2]), 0, 0, 0, 0);
    }
    function sortPayoutEntries(entries) {
      return (Array.isArray(entries) ? entries : []).map((entry, index) => ({ entry, index })).sort((left, right) => {
        const leftValue = String(left.entry?.estimated_payout_at || "");
        const rightValue = String(right.entry?.estimated_payout_at || "");
        if (!leftValue && !rightValue) {
          return left.index - right.index;
        }
        if (!leftValue) {
          return 1;
        }
        if (!rightValue) {
          return -1;
        }
        if (leftValue === rightValue) {
          return left.index - right.index;
        }
        return leftValue.localeCompare(rightValue);
      }).map((item) => item.entry);
    }
    function summarizeLastPayoutEntries(entries) {
      const grouped = /* @__PURE__ */ new Map();
      for (const entry of Array.isArray(entries) ? entries : []) {
        const key = normalizePayoutGroupKey(entry);
        if (key === null) {
          continue;
        }
        const cents = Number.isFinite(Number(entry?.amount_cents)) ? Number(entry?.amount_cents) : amountToCents(entry?.amount);
        grouped.set(key, (grouped.get(key) || 0) + cents);
      }
      if (grouped.size === 0) {
        return {
          amount_cents: null,
          amount: null,
          amount_formatted: null
        };
      }
      const latestKey = Math.max(...grouped.keys());
      const amountCents = grouped.get(latestKey) || 0;
      return {
        amount_cents: amountCents,
        amount: centsToNumber(amountCents),
        amount_formatted: formatCents2(amountCents)
      };
    }
    function normalizePayoutGroupKey(entry) {
      const entryDate = normalizeDate2(entry?.entry_date) || normalizeDate2(entry?.estimated_payout_at);
      return entryDate ? entryDate.getTime() : null;
    }
    function centsToNumber(value) {
      return numberOrZero3(value) / 100;
    }
    function formatCents2(value) {
      return `$${new Intl.NumberFormat("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(numberOrZero3(value) / 100)}`;
    }
    function inferYearForMonth(monthIndex, now) {
      let year = now.getFullYear();
      if (monthIndex > now.getMonth() + 1) {
        year -= 1;
      }
      return year;
    }
    function computeNextPayoutAt(entry, now = /* @__PURE__ */ new Date()) {
      if (!entry || entry.status !== "pending") {
        return null;
      }
      const entryDate = normalizeDate2(entry.entry_date);
      if (entryDate && Number.isFinite(Number(entry.due_days))) {
        const payoutDate = new Date(
          entryDate.getFullYear(),
          entryDate.getMonth(),
          entryDate.getDate() + numberOrZero3(entry.due_days) + 1,
          0,
          0,
          0,
          0
        );
        const current = normalizeDate2(now) || /* @__PURE__ */ new Date();
        if (payoutDate <= current) {
          payoutDate.setDate(payoutDate.getDate() + 1);
        }
        return payoutDate.toISOString();
      }
      if (Number.isFinite(Number(entry.days_until_available))) {
        return toLocalMidnightAtOffset(now, numberOrZero3(entry.days_until_available) + 1);
      }
      return null;
    }
    function estimateWorkAt(now, ageValue, ageUnit, fallbackEntryDate) {
      const current = normalizeDate2(now) || /* @__PURE__ */ new Date();
      if (Number.isFinite(ageValue) && ageValue > 0) {
        const ms = ageValue * relativeAgeUnitToMs(ageUnit);
        return new Date(current.getTime() - ms).toISOString();
      }
      return fallbackEntryDate || current.toISOString();
    }
    function estimatePayoutAtFromEntryDate(entryDate, dueDays, now = /* @__PURE__ */ new Date()) {
      const baseDate = normalizeDate2(entryDate);
      if (!baseDate) {
        return null;
      }
      const payoutDate = new Date(
        baseDate.getFullYear(),
        baseDate.getMonth(),
        baseDate.getDate() + numberOrZero3(dueDays) + 1,
        0,
        0,
        0,
        0
      );
      const current = normalizeDate2(now) || /* @__PURE__ */ new Date();
      if (payoutDate <= current) {
        payoutDate.setDate(payoutDate.getDate() + 1);
      }
      return payoutDate.toISOString();
    }
    function estimatePayoutAt(estimatedWorkAt, dueDays, now = /* @__PURE__ */ new Date()) {
      const workAt = normalizeDate2(estimatedWorkAt);
      if (!workAt) {
        return null;
      }
      const payoutAt = new Date(workAt.getTime() + numberOrZero3(dueDays) * 24 * 60 * 60 * 1e3);
      const current = normalizeDate2(now) || /* @__PURE__ */ new Date();
      if (payoutAt <= current) {
        return toLocalMidnightAtOffset(current, 1);
      }
      return payoutAt.toISOString();
    }
    function relativeAgeUnitToMs(unit) {
      switch (String(unit || "").toLowerCase()) {
        case "minute":
          return 60 * 1e3;
        case "hour":
          return 60 * 60 * 1e3;
        case "week":
          return 7 * 24 * 60 * 60 * 1e3;
        case "day":
        default:
          return 24 * 60 * 60 * 1e3;
      }
    }
    function amountToCents(value) {
      const match = String(value || "").match(/^\$([\d,]+)(?:\.(\d{2}))?$/);
      if (!match) {
        return 0;
      }
      const [, dollarsRaw, centsRaw = "00"] = match;
      return Number(dollarsRaw.replace(/,/g, "")) * 100 + Number(centsRaw);
    }
    function toLocalMidnightAtOffset(now, daysOffset) {
      const date = normalizeDate2(now) || /* @__PURE__ */ new Date();
      const localMidnight = new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate() + numberOrZero3(daysOffset),
        0,
        0,
        0,
        0
      );
      if (localMidnight <= date) {
        localMidnight.setDate(localMidnight.getDate() + 1);
      }
      return localMidnight.toISOString();
    }
    async function openFundsHistoryTab(page) {
      await page.evaluate(() => {
        const normalize = (value) => String(value || "").trim().replace(/\s+/g, " ");
        const target = Array.from(document.querySelectorAll('button,[role="tab"]')).find((element) => {
          const node = element;
          const text = normalize(node.innerText || node.textContent || "");
          const aria = normalize(element.getAttribute("aria-label") || "");
          const title = normalize(element.getAttribute("title") || "");
          return /Funds History/i.test(text) || /Funds History/i.test(aria) || /Funds History/i.test(title);
        });
        if (target) {
          target.click();
        }
      });
      await page.waitForFunction(() => {
        const normalize = (value) => String(value || "").trim().replace(/\s+/g, " ");
        return Array.from(document.querySelectorAll('td[data-testid="cell-title"] div.tw-flex.tw-cursor-pointer')).some((element) => {
          const node = element;
          const text = normalize(node.innerText || node.textContent || "");
          return /^[A-Z][a-z]{2}\s+\d{1,2}$/.test(text);
        });
      }, { timeout: 3e4 }).catch(() => {
      });
      await sleep(250);
    }
    async function expandFundsHistoryRows(page) {
      await clickFundsHistoryRows(page, "month");
      await page.waitForFunction(() => {
        const normalize = (value) => String(value || "").trim().replace(/\s+/g, " ");
        return Array.from(document.querySelectorAll('td[data-testid="cell-title"] div.tw-flex.tw-cursor-pointer')).some((element) => {
          const node = element;
          const text = normalize(node.innerText || node.textContent || "");
          return /^(Time Entry|Task Submission)/i.test(text) || /^.+\s+\$[\d,]+(?:\.\d{2})?$/.test(text) && !/^[A-Z][a-z]{2}\s+\d{1,2}$/.test(text);
        });
      }, { timeout: 3e4 }).catch(() => {
      });
      await sleep(250);
      await clickFundsHistoryRows(page, "project");
      await page.waitForFunction(() => {
        const normalize = (value) => String(value || "").trim().replace(/\s+/g, " ");
        return Array.from(document.querySelectorAll("tr")).some((row) => {
          const node = row;
          const text = normalize(node.innerText || node.textContent || "");
          return /Pending Approval/i.test(text) || /Paid/i.test(text);
        });
      }, { timeout: 3e4 }).catch(() => {
      });
      await sleep(250);
    }
    async function clickFundsHistoryRows(page, kind) {
      return page.evaluate((rowKind) => {
        const normalize = (value) => String(value || "").trim().replace(/\s+/g, " ");
        const isMonth = (text) => /^[A-Z][a-z]{2}\s+\d{1,2}\s+\$[\d,]+(?:\.\d{2})?$/.test(text);
        const isDetail = (text) => /^(Time Entry|Task Submission|Paid|Pending Approval)/i.test(text);
        const isProject = (text) => /^.+\s+\$[\d,]+(?:\.\d{2})?$/.test(text) && !isMonth(text) && !isDetail(text);
        const predicate = rowKind === "month" ? isMonth : isProject;
        let count = 0;
        for (const row of Array.from(document.querySelectorAll("tr"))) {
          const node = row;
          const text = normalize(node.innerText || node.textContent || "");
          const target = node.querySelector('td[data-testid="cell-title"] div.tw-flex.tw-cursor-pointer');
          if (text && target && predicate(text)) {
            target.click();
            count += 1;
          }
        }
        return count;
      }, kind);
    }
    function normalizeText2(value) {
      return String(value || "").trim().replace(/\s+/g, " ");
    }
    function normalizeDate2(value) {
      if (!value) {
        return null;
      }
      const date = value instanceof Date ? value : new Date(value);
      return Number.isNaN(date.getTime()) ? null : date;
    }
    function formatHumanTimestamp(value) {
      const date = normalizeDate2(value);
      if (!date) {
        return null;
      }
      return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit"
      }).format(date);
    }
    function normalizeIsoDate(value) {
      const date = normalizeDate2(value);
      return date ? date.toISOString() : null;
    }
    function numberOrZero3(value) {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    function sleep(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    }
    module2.exports = {
      scrapeFundsHistory,
      parseFundsHistoryEntries,
      summarizeFundsHistoryEntries,
      parseFundsHistoryDetailRow,
      formatPublicPayoutEntries,
      isProjectSummaryRow,
      extractProjectName
    };
  }
});

// src/state/withdrawal_amount.ts
var require_withdrawal_amount = __commonJS({
  "src/state/withdrawal_amount.ts"(exports2, module2) {
    "use strict";
    function buildWithdrawalAmountSnapshot2(payments, nextWithdrawalAt, now = /* @__PURE__ */ new Date()) {
      const availableAmountCents = toCents(payments?.available_amount_cents, payments?.available_amount);
      const cutoff = parseDate4(nextWithdrawalAt);
      if (!cutoff || cutoff <= normalizeDate2(now)) {
        return formatWithdrawalAmount(availableAmountCents);
      }
      const entries = Array.isArray(payments?.next_payout_entries) ? payments.next_payout_entries : Array.isArray(payments?.pending_payout_entries) ? payments.pending_payout_entries : [];
      const pendingAmountCents = entries.reduce((sum, entry) => {
        if (!entry || entry.status !== "pending") {
          return sum;
        }
        const payoutAt = parseDate4(entry.estimated_payout_at);
        if (!payoutAt || payoutAt > cutoff) {
          return sum;
        }
        return sum + toCents(entry.amount_cents, entry.amount);
      }, 0);
      return formatWithdrawalAmount(availableAmountCents + pendingAmountCents);
    }
    function formatWithdrawalAmount(cents) {
      return {
        next_withdrawal_amount_cents: cents,
        next_withdrawal_amount: cents / 100,
        next_withdrawal_amount_formatted: formatCents2(cents)
      };
    }
    function formatCents2(value) {
      return `$${new Intl.NumberFormat("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format((Number(value) || 0) / 100)}`;
    }
    function toCents(centsValue, amountValue) {
      const cents = Number(centsValue);
      if (Number.isFinite(cents)) {
        return cents;
      }
      const amount = Number(amountValue);
      if (Number.isFinite(amount)) {
        return Math.round(amount * 100);
      }
      return 0;
    }
    function parseDate4(value) {
      if (!value) {
        return null;
      }
      const date = value instanceof Date ? value : new Date(value);
      return Number.isNaN(date.getTime()) ? null : date;
    }
    function normalizeDate2(value) {
      const date = parseDate4(value);
      return date || /* @__PURE__ */ new Date(0);
    }
    module2.exports = {
      buildWithdrawalAmountSnapshot: buildWithdrawalAmountSnapshot2
    };
  }
});

// src/scrapers/payments.ts
var require_payments = __commonJS({
  "src/scrapers/payments.ts"(exports2, module2) {
    "use strict";
    var { formatPublicPayoutEntries, scrapeFundsHistory } = require_funds_history();
    var { buildWithdrawalAmountSnapshot: buildWithdrawalAmountSnapshot2 } = require_withdrawal_amount();
    function extractPaymentsSnapshot({
      pageProps,
      earningsSummary,
      withdrawButton = null,
      buttonText,
      buttonDisabled,
      nextWithdrawalText,
      next_payout_days = 0,
      next_payout_at = null,
      next_payout_entries_count = 0,
      pending_payout_entries = [],
      scrapedAt = null,
      now = /* @__PURE__ */ new Date()
    }) {
      const availableAmountCents = numberOrZero3(pageProps?.paymentStatus?.amountInCents);
      const normalizedWithdrawButton = withdrawButton || normalizeWithdrawalButton(buttonText, buttonDisabled);
      const canWithdraw = Boolean(normalizedWithdrawButton.present && normalizedWithdrawButton.enabled && availableAmountCents > 0);
      const totalEarningsCents = numberOrZero3(pageProps?.totalLifetimeEarnings);
      const pendingApprovalCents = numberOrZero3(pageProps?.unapprovedAmount);
      const totalPaidOutCents = numberOrZero3(earningsSummary?.totalPaidOut);
      const thisMonthCents = numberOrZero3(earningsSummary?.currentMonthEarnings);
      const bestMonthSource = normalizeBestMonth(earningsSummary?.bestMonth);
      const nextPayoutEntries = buildNextPayoutEntries(pending_payout_entries);
      const nextPayoutEntry = nextPayoutEntries[0] || null;
      const nextWithdrawalSource = resolveNextWithdrawalSource({
        nextEligibleAt: pageProps?.paymentStatus?.nextEligibleAt,
        nextWithdrawalText,
        lastPayoutAt: pageProps?.lastPayoutAt || earningsSummary?.lastPayoutAt || null,
        availableAmountCents,
        canWithdraw,
        now
      });
      const nextWithdrawalAt = normalizeNextWithdrawalAt({
        nextEligibleAt: pageProps?.paymentStatus?.nextEligibleAt,
        nextWithdrawalText,
        lastPayoutAt: pageProps?.lastPayoutAt || earningsSummary?.lastPayoutAt || null,
        canWithdraw,
        availableAmountCents,
        now
      });
      const withdrawalAmount = buildWithdrawalAmountSnapshot2({
        available_amount_cents: availableAmountCents,
        available_amount: centsToNumber(availableAmountCents),
        next_payout_entries: nextPayoutEntries,
        pending_payout_entries
      }, nextWithdrawalAt, now);
      return {
        available_amount_cents: availableAmountCents,
        available_amount: centsToNumber(availableAmountCents),
        available_amount_formatted: formatCents2(availableAmountCents),
        can_withdraw: canWithdraw,
        button_enabled: normalizedWithdrawButton.enabled,
        button_text: normalizedWithdrawButton.text,
        withdraw_button_present: normalizedWithdrawButton.present,
        withdraw_button_text: normalizedWithdrawButton.text,
        withdraw_button_count: normalizedWithdrawButton.count,
        withdraw_button_disabled: normalizedWithdrawButton.present ? normalizedWithdrawButton.disabled : null,
        next_withdrawal_at: nextWithdrawalAt,
        next_withdrawal_source: nextWithdrawalSource,
        next_withdrawal_text: nextWithdrawalText || null,
        ...withdrawalAmount,
        payment_status: pageProps?.paymentStatus?.type || null,
        total_earnings_cents: totalEarningsCents,
        total_earnings: centsToNumber(totalEarningsCents),
        total_earnings_formatted: formatCents2(totalEarningsCents),
        total_paid_out_cents: totalPaidOutCents,
        total_paid_out: centsToNumber(totalPaidOutCents),
        total_paid_out_formatted: formatCents2(totalPaidOutCents),
        this_month_cents: thisMonthCents,
        this_month: centsToNumber(thisMonthCents),
        this_month_formatted: formatCents2(thisMonthCents),
        best_month_cents: bestMonthSource.cents,
        best_month: centsToNumber(bestMonthSource.cents),
        best_month_label: bestMonthSource.label,
        best_month_formatted: formatCents2(bestMonthSource.cents),
        pending_approval_cents: pendingApprovalCents,
        pending_approval: centsToNumber(pendingApprovalCents),
        pending_approval_formatted: formatCents2(pendingApprovalCents),
        last_payout_at: pageProps?.lastPayoutAt || earningsSummary?.lastPayoutAt || null,
        next_payout_days: numberOrZero3(next_payout_days),
        next_payout_at: normalizeIsoDate(next_payout_at),
        next_payout_at_human: formatHumanTimestamp(next_payout_at),
        next_payout_entries_count: numberOrZero3(next_payout_entries_count),
        pending_payout_entries: Array.isArray(pending_payout_entries) ? pending_payout_entries : [],
        pending_payout_entries_public: formatPublicPayoutEntries(pending_payout_entries),
        next_payout_entries: nextPayoutEntries,
        next_payout_entries_public: formatPublicPayoutEntries(nextPayoutEntries),
        next_payout_amount: nextPayoutEntry?.amount || null,
        next_payout_source: nextPayoutEntry?.source || null,
        next_payout_confidence: nextPayoutEntry?.confidence || null,
        scraped_at: normalizeIsoDate(scrapedAt) || null
      };
    }
    function buildNextPayoutEntries(pendingEntries) {
      return (Array.isArray(pendingEntries) ? pendingEntries : []).filter((entry) => entry && entry.status === "pending").sort((left, right) => String(left.estimated_payout_at || "").localeCompare(String(right.estimated_payout_at || "")));
    }
    function normalizeBestMonth(bestMonth) {
      if (!bestMonth) {
        return { cents: 0, label: null };
      }
      const cents = numberOrZero3(bestMonth.withdrawnInCents) + numberOrZero3(bestMonth.earnedInCents) + numberOrZero3(bestMonth.pendingInCents);
      const label = formatMonthLabel(bestMonth.month);
      return { cents, label };
    }
    function normalizeWithdrawalButton(buttonText, buttonDisabled) {
      const text = normalizeText2(buttonText);
      if (!text) {
        return {
          present: false,
          enabled: false,
          disabled: null,
          text: null,
          count: 0
        };
      }
      if (!WITHDRAW_BUTTON_TEXT_PATTERN.test(text)) {
        return {
          present: false,
          enabled: false,
          disabled: null,
          text: null,
          count: 0
        };
      }
      const disabled = Boolean(buttonDisabled);
      return {
        present: true,
        enabled: !disabled,
        disabled,
        text,
        count: 1
      };
    }
    function formatCents2(value) {
      return `$${new Intl.NumberFormat("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(numberOrZero3(value) / 100)}`;
    }
    function formatMonthLabel(isoMonth) {
      if (!isoMonth) {
        return null;
      }
      const date = /* @__PURE__ */ new Date(`${isoMonth}-01T00:00:00Z`);
      if (Number.isNaN(date.getTime())) {
        return String(isoMonth);
      }
      return new Intl.DateTimeFormat("en-US", {
        month: "long",
        year: "numeric",
        timeZone: "UTC"
      }).format(date);
    }
    function formatHumanTimestamp(value) {
      const date = normalizeDate2(value);
      if (!date) {
        return null;
      }
      return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit"
      }).format(date);
    }
    function centsToNumber(value) {
      return numberOrZero3(value) / 100;
    }
    function numberOrZero3(value) {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    function normalizeNextWithdrawalAt({
      nextEligibleAt,
      nextWithdrawalText,
      lastPayoutAt,
      canWithdraw = false,
      availableAmountCents = 0,
      now = /* @__PURE__ */ new Date()
    }) {
      const direct = normalizeIsoDate(nextEligibleAt);
      if (direct) {
        return direct;
      }
      const parsed = parseNextWithdrawalText(nextWithdrawalText);
      if (parsed) {
        return parsed.toISOString();
      }
      const availableAmount = numberOrZero3(availableAmountCents);
      const current = normalizeDate2(now) || /* @__PURE__ */ new Date();
      if (canWithdraw && availableAmount > 0) {
        return addMinutes(current, 5).toISOString();
      }
      if (availableAmount > 0) {
        const estimated2 = estimateNextWithdrawalAt(lastPayoutAt, current);
        return estimated2 || nextLocalMidnight(current, 3);
      }
      const estimated = estimateFutureWithdrawalAt(lastPayoutAt, current);
      if (estimated) {
        return estimated;
      }
      return null;
    }
    function resolveNextWithdrawalSource({
      nextEligibleAt,
      nextWithdrawalText,
      lastPayoutAt,
      availableAmountCents = 0,
      canWithdraw = false,
      now = /* @__PURE__ */ new Date()
    }) {
      if (normalizeIsoDate(nextEligibleAt) || parseNextWithdrawalText(nextWithdrawalText)) {
        return "direct";
      }
      const availableAmount = numberOrZero3(availableAmountCents);
      if (availableAmount > 0) {
        return canWithdraw ? "button" : "estimated";
      }
      const current = normalizeDate2(now) || /* @__PURE__ */ new Date();
      if (estimateFutureWithdrawalAt(lastPayoutAt, current)) {
        return "estimated";
      }
      return null;
    }
    function estimateFutureWithdrawalAt(lastPayoutAt, now) {
      const estimated = estimateNextWithdrawalAt(lastPayoutAt, now);
      const estimatedDate = normalizeDate2(estimated);
      return estimatedDate && estimatedDate > now ? estimated : null;
    }
    function estimateNextWithdrawalAt(lastPayoutAt, now = /* @__PURE__ */ new Date()) {
      const lastPayout = normalizeDate2(lastPayoutAt);
      if (!lastPayout) {
        return null;
      }
      const estimatedAt = new Date(lastPayout.getTime() + 3 * 24 * 60 * 60 * 1e3);
      const current = normalizeDate2(now);
      if (!current) {
        return estimatedAt.toISOString();
      }
      return estimatedAt < current ? current.toISOString() : estimatedAt.toISOString();
    }
    function addMinutes(value, minutes) {
      const date = normalizeDate2(value);
      if (!date) {
        return null;
      }
      return new Date(date.getTime() + numberOrZero3(minutes) * 60 * 1e3);
    }
    function nextLocalMidnight(value, daysOffset) {
      const date = normalizeDate2(value);
      if (!date) {
        return null;
      }
      const midnight = new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate() + numberOrZero3(daysOffset),
        0,
        0,
        0,
        0
      );
      if (midnight <= date) {
        midnight.setDate(midnight.getDate() + 1);
      }
      return midnight.toISOString();
    }
    function normalizeIsoDate(value) {
      const date = normalizeDate2(value);
      if (!date) {
        return null;
      }
      return date.toISOString();
    }
    function normalizeDate2(value) {
      if (!value) {
        return null;
      }
      const date = value instanceof Date ? value : new Date(value);
      return Number.isNaN(date.getTime()) ? null : date;
    }
    function parseNextWithdrawalText(text) {
      if (!text) {
        return null;
      }
      const match = String(text).trim().match(/^Next withdrawal:\s+([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})\s+at\s+(\d{1,2}):(\d{2})\s+(AM|PM)\s+GMT([+-]\d{1,2}(?::\d{2})?)$/i);
      if (!match) {
        return null;
      }
      const [, monthName, day, year, hour, minute, meridiem, gmtOffset] = match;
      const monthIndex = MONTH_NAMES.indexOf(monthName.toLowerCase());
      if (monthIndex === -1) {
        return null;
      }
      const hour12 = Number(hour);
      let hour24 = hour12 % 12;
      if (meridiem.toUpperCase() === "PM") {
        hour24 += 12;
      }
      const offsetMinutes = parseGmtOffsetMinutes(gmtOffset);
      if (offsetMinutes === null) {
        return null;
      }
      const utcMillis = Date.UTC(Number(year), monthIndex, Number(day), hour24, Number(minute)) - offsetMinutes * 60 * 1e3;
      return new Date(utcMillis);
    }
    function parseGmtOffsetMinutes(value) {
      const match = String(value).match(/^([+-])(\d{1,2})(?::(\d{2}))?$/);
      if (!match) {
        return null;
      }
      const [, sign, hoursRaw, minutesRaw] = match;
      const hours = Number(hoursRaw);
      const minutes = Number(minutesRaw || "0");
      const total = hours * 60 + minutes;
      return sign === "-" ? -total : total;
    }
    var MONTH_NAMES = [
      "january",
      "february",
      "march",
      "april",
      "may",
      "june",
      "july",
      "august",
      "september",
      "october",
      "november",
      "december"
    ];
    var WITHDRAW_BUTTON_TEXT_PATTERN = /^\$[\d,]+(?:\.\d{2})?\s+available$/i;
    async function scrapePayments(page, { includeFundsHistory = true, fundsHistoryObservationsPath = null, now = /* @__PURE__ */ new Date() } = {}) {
      const rawProps = await page.$eval(
        'div[id="workers/TransferFundsPage-hybrid-root"]',
        (element) => element.getAttribute("data-props") || "{}"
      );
      const pageProps = JSON.parse(rawProps);
      await page.evaluate("globalThis.__name = globalThis.__name || ((value) => value)").catch(() => {
      });
      const earningsSummary = await page.evaluate(async () => {
        const response = await fetch("/api_internal/payments/earnings_summary", {
          credentials: "include",
          headers: { Accept: "application/json" }
        });
        if (!response.ok) {
          throw new Error(`earnings_summary request failed with ${response.status}`);
        }
        return await response.json();
      });
      await page.waitForFunction(() => {
        const normalize = (value) => String(value || "").trim().replace(/\s+/g, " ");
        return Array.from(document.querySelectorAll("button")).some((node) => {
          const text = normalize(node.innerText || node.textContent || "");
          const action = normalize(node.form?.getAttribute("action") || "");
          const method = normalize(node.form?.getAttribute("method") || "");
          return /^Get paid \$[\d,]+(?:\.\d{2})?$/i.test(text) && /\/workers\/payments\/get_paid(?:\?|$)/.test(action) && method.toLowerCase() === "post" || /^\$[\d,]+(?:\.\d{2})?\s+available$/i.test(text);
        });
      }, { timeout: 1e4 }).catch(() => {
      });
      const buttonInfo = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll("button"));
        const mapButton = (node) => ({
          text: (node.innerText || node.textContent || "").trim().replace(/\s+/g, " "),
          disabled: Boolean(node.disabled),
          ariaDisabled: (node.getAttribute("aria-disabled") || "").trim().replace(/\s+/g, " "),
          ariaLabel: (node.getAttribute("aria-label") || "").trim().replace(/\s+/g, " "),
          title: (node.getAttribute("title") || "").trim().replace(/\s+/g, " "),
          formAction: (node.form?.getAttribute("action") || "").trim().replace(/\s+/g, " "),
          formMethod: (node.form?.getAttribute("method") || "").trim().replace(/\s+/g, " ")
        });
        const bodyText = (document.body?.innerText || document.body?.textContent || "").replace(/\s+/g, " ").trim();
        const nextWithdrawalMatch = bodyText.match(/Next withdrawal:\s+[^$]+?(?:GMT[+-]\d{1,2}(?::\d{2})?)?/i);
        return {
          buttons: buttons.map(mapButton),
          nextWithdrawalText: nextWithdrawalMatch ? nextWithdrawalMatch[0].trim().replace(/\s+/g, " ") : ""
        };
      });
      const availableAmountCents = numberOrZero3(pageProps?.paymentStatus?.amountInCents);
      let withdrawButton = chooseWithdrawalButton(buttonInfo.buttons, availableAmountCents);
      if (!withdrawButton.present && availableAmountCents > 0) {
        withdrawButton = await page.evaluate((amountInCents) => {
          const normalize = (value) => String(value || "").trim().replace(/\s+/g, " ");
          const exactAmount = `$${(Number(amountInCents) / 100).toFixed(2)}`;
          const candidates = Array.from(document.querySelectorAll("button")).map((node) => ({
            text: normalize(node.innerText || node.textContent || ""),
            disabled: Boolean(node.disabled),
            ariaDisabled: normalize(node.getAttribute("aria-disabled") || ""),
            formAction: normalize(node.form?.getAttribute("action") || ""),
            formMethod: normalize(node.form?.getAttribute("method") || "")
          })).filter((button2) => {
            if (!button2.text || button2.disabled || button2.ariaDisabled === "true") {
              return false;
            }
            if (button2.text === `${exactAmount} available`) {
              return true;
            }
            return button2.text === `Get paid ${exactAmount}` && button2.formMethod.toLowerCase() === "post" && /\/workers\/payments\/get_paid(?:\?|$)/.test(button2.formAction);
          });
          if (candidates.length !== 1) {
            return {
              present: candidates.length > 0,
              enabled: false,
              disabled: null,
              text: null,
              count: candidates.length
            };
          }
          const button = candidates[0];
          return {
            present: true,
            enabled: !button.disabled,
            disabled: button.disabled,
            text: button.text,
            count: 1
          };
        }, availableAmountCents);
      }
      const fundsHistory = includeFundsHistory ? await scrapeFundsHistory(page, { observationsPath: fundsHistoryObservationsPath, now }) : {
        next_payout_days: 0,
        next_payout_entries_count: 0,
        pending_payout_entries: []
      };
      const scrapedAt = (/* @__PURE__ */ new Date()).toISOString();
      return extractPaymentsSnapshot({
        pageProps,
        earningsSummary,
        withdrawButton,
        buttonText: withdrawButton.text,
        buttonDisabled: withdrawButton.disabled,
        nextWithdrawalText: buttonInfo.nextWithdrawalText,
        scrapedAt,
        ...fundsHistory
      });
    }
    function chooseWithdrawalButton(buttons, availableAmountCents = null) {
      const candidates = Array.isArray(buttons) ? buttons.map(normalizeButtonCandidate).filter((button2) => isWithdrawalCandidate(button2, availableAmountCents)) : [];
      if (candidates.length !== 1) {
        return {
          present: candidates.length > 0,
          enabled: false,
          disabled: null,
          text: null,
          count: candidates.length
        };
      }
      const button = candidates[0];
      return {
        present: true,
        enabled: !button.disabled,
        disabled: button.disabled,
        text: button.text,
        count: 1
      };
    }
    function normalizeButtonCandidate(button) {
      if (!button) {
        return null;
      }
      const text = normalizeText2(button.text || button.ariaLabel || button.title);
      return {
        text,
        disabled: Boolean(button.disabled),
        ariaDisabled: normalizeText2(button.ariaDisabled || ""),
        formAction: normalizeText2(button.formAction || ""),
        formMethod: normalizeText2(button.formMethod || "")
      };
    }
    function isWithdrawalCandidate(button, availableAmountCents = null) {
      if (!button || !button.text) {
        return false;
      }
      if (button.disabled || button.ariaDisabled === "true") {
        return false;
      }
      const exactAmount = availableAmountCents === null ? null : formatCents2(availableAmountCents);
      const matchesLegacyText = WITHDRAW_BUTTON_TEXT_PATTERN.test(button.text) && (exactAmount === null || button.text === `${exactAmount} available`);
      if (matchesLegacyText) {
        return true;
      }
      const matchesCurrentText = WITHDRAW_BUTTON_SUBMIT_PATTERN.test(button.text) && (exactAmount === null || button.text === `Get paid ${exactAmount}`);
      const matchesForm = button.formMethod.toLowerCase() === "post" && /\/workers\/payments\/get_paid(?:\?|$)/.test(button.formAction);
      return matchesForm && matchesCurrentText;
    }
    var WITHDRAW_BUTTON_SUBMIT_PATTERN = /^Get paid \$[\d,]+(?:\.\d{2})?$/i;
    function normalizeText2(value) {
      return String(value || "").trim().replace(/\s+/g, " ");
    }
    module2.exports = {
      extractPaymentsSnapshot,
      scrapePayments,
      chooseWithdrawalButton,
      formatMonthLabel,
      formatCents: formatCents2,
      estimateNextWithdrawalAt,
      normalizeNextWithdrawalAt,
      resolveNextWithdrawalSource,
      parseNextWithdrawalText
    };
  }
});

// src/clients/browser_session.ts
var require_browser_session = __commonJS({
  "src/clients/browser_session.ts"(exports2, module2) {
    "use strict";
    var fs7 = require("node:fs");
    var puppeteer = require("puppeteer-core");
    var DataAnnotationBrowserSession = class {
      constructor(options) {
        this.profileDir = options.profileDir;
        this.executablePath = options.executablePath || resolveExecutablePath();
        this.logger = options.logger;
        this.browser = null;
      }
      async close() {
        if (this.browser) {
          await this.browser.close();
          this.browser = null;
        }
      }
      async newPage() {
        const browser = await this._browser();
        const page = await browser.newPage();
        await page.evaluate("globalThis.__name = globalThis.__name || ((value) => value)").catch(() => {
        });
        page.setDefaultTimeout(3e4);
        page.setDefaultNavigationTimeout(45e3);
        return page;
      }
      async _browser() {
        if (this.browser) {
          return this.browser;
        }
        if (this.profileDir) {
          fs7.mkdirSync(this.profileDir, { recursive: true });
        }
        if (!this.executablePath) {
          throw new Error("Chromium executable not found in expected locations");
        }
        this.logger.debug(`Launching Chromium: ${this.executablePath}`);
        this.browser = await puppeteer.launch({
          executablePath: this.executablePath,
          headless: "new",
          userDataDir: this.profileDir,
          ignoreHTTPSErrors: true,
          args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-gpu",
            "--window-size=1440,900"
          ]
        });
        await this.browser.defaultBrowserContext().overridePermissions("https://app.dataannotation.tech", ["notifications"]).catch(() => {
        });
        return this.browser;
      }
    };
    function resolveExecutablePath() {
      const envCandidates = [
        process.env.PUPPETEER_EXECUTABLE_PATH,
        process.env.CHROME_PATH,
        process.env.GOOGLE_CHROME_BIN
      ].filter(Boolean);
      for (const candidate of envCandidates) {
        if (fs7.existsSync(candidate)) {
          return candidate;
        }
      }
      const candidates = [
        "/usr/bin/chromium-browser",
        "/usr/bin/chromium",
        "/usr/bin/google-chrome",
        "/usr/bin/google-chrome-stable"
      ];
      for (const candidate of candidates) {
        if (fs7.existsSync(candidate)) {
          return candidate;
        }
      }
      return void 0;
    }
    module2.exports = {
      DataAnnotationBrowserSession,
      resolveExecutablePath
    };
  }
});

// src/clients/dataannotation_client.ts
var require_dataannotation_client = __commonJS({
  "src/clients/dataannotation_client.ts"(exports2, module2) {
    "use strict";
    var fs7 = require("fs");
    var { CLAIM_WORK_SCREEN_METRICS, buildClaimProjectTarget } = require_project_claim();
    var { extractProjects: extractProjects2 } = (init_projects(), __toCommonJS(projects_exports));
    var { extractTaskStatus } = require_task_status();
    var { chooseWithdrawalButton, scrapePayments } = require_payments();
    var { DataAnnotationBrowserSession, resolveExecutablePath } = require_browser_session();
    var NULL_LOGGER = {
      debug() {
      },
      info() {
      },
      warning() {
      },
      error() {
      }
    };
    var PROJECTS_URL = "https://app.dataannotation.tech/workers/projects";
    var PAYMENTS_URL = "https://app.dataannotation.tech/workers/payments";
    var SIGN_IN_URL = "https://app.dataannotation.tech/users/sign_in";
    var CLAIM_WORK_USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
    var DataAnnotationClient = class {
      constructor(options) {
        this.email = options.email;
        this.password = options.password;
        this.profileDir = options.profileDir;
        this.executablePath = options.executablePath || resolveExecutablePath();
        this.logger = options.logger || NULL_LOGGER;
        this.browserSession = new DataAnnotationBrowserSession({
          profileDir: this.profileDir,
          executablePath: this.executablePath,
          logger: this.logger
        });
        this.notificationPromptHandled = false;
      }
      async close() {
        await this.browserSession.close();
      }
      async collectProjects() {
        const page = await this._newPage();
        try {
          this.logger.debug("Opening DataAnnotation projects page");
          const loginState = await this._ensureAuthenticated(page);
          const props = await this._readWorkerProjectsProps(page);
          this.logger.debug(
            `Raw project payload counts: projects=${countItems(props?.dashboardMerchTargeting?.projects)}, easyProjects=${countItems(props?.dashboardMerchTargeting?.easyProjects)}, reportableProjectsInfo=${countItems(props?.reportableProjectsInfo)}, inProgressTasksInfo=${countItems(props?.inProgressTasksInfo)}`
          );
          if (this.logger.debug) {
            this.logger.debug(`Raw project payload preview: ${describeProjectList2("projects", props?.dashboardMerchTargeting?.projects)}${describeProjectList2("easyProjects", props?.dashboardMerchTargeting?.easyProjects)}${describeProjectList2("reportableProjectsInfo", props?.reportableProjectsInfo)}`);
          }
          const projects = extractProjects2(props);
          const taskStatus = extractTaskStatus(props, page.url());
          this.logger.debug(`Scraped ${projects.length} DataAnnotation projects`);
          this.logger.debug(`Normalized projects: ${describeProjectList2("selected", projects)}`);
          return {
            authenticated: true,
            loginState,
            projects,
            taskStatus,
            count: projects.length,
            pageUrl: page.url()
          };
        } finally {
          await page.close().catch(() => {
          });
        }
      }
      async collectPayments(options = {}) {
        const page = await this._newPage();
        try {
          this.logger.debug("Opening DataAnnotation payments page");
          await this._loadAuthenticatedPage(page, PAYMENTS_URL, 'div[id="workers/TransferFundsPage-hybrid-root"][data-props]');
          const payments = await scrapePayments(page, {
            includeFundsHistory: options.includeFundsHistory !== false,
            fundsHistoryObservationsPath: options.fundsHistoryObservationsPath || null
          });
          this.logger.debug(
            `Scraped payments snapshot: available=${payments.available_amount_formatted}, canWithdraw=${payments.can_withdraw}`
          );
          return {
            authenticated: true,
            loginState: "authenticated",
            pageUrl: page.url(),
            ...payments
          };
        } finally {
          await page.close().catch(() => {
          });
        }
      }
      async withdrawAvailableFunds() {
        const page = await this._newPage();
        try {
          this.logger.debug("Opening DataAnnotation payments page for withdrawal");
          await this._loadAuthenticatedPage(page, PAYMENTS_URL, 'div[id="workers/TransferFundsPage-hybrid-root"][data-props]');
          this.logger.debug("Reading fresh withdrawal eligibility snapshot");
          const payments = await scrapePayments(page, { includeFundsHistory: false });
          this.logger.debug(
            `Withdrawal preflight: available=${payments.available_amount_formatted}, canWithdraw=${payments.can_withdraw}, buttonPresent=${payments.withdraw_button_present}, buttonEnabled=${payments.button_enabled}`
          );
          if (!payments.can_withdraw || payments.available_amount <= 0 || !payments.button_enabled) {
            this.logger.debug("Withdrawal preflight rejected before click");
            return {
              status: "not_available",
              pageUrl: page.url(),
              payments
            };
          }
          const button = await this._findWithdrawalButton(page, payments.available_amount_cents);
          if (!button) {
            this.logger.debug("Withdrawal button lookup returned no exact match");
            return {
              status: "not_available",
              pageUrl: page.url(),
              payments
            };
          }
          this.logger.info("Clicking DataAnnotation withdrawal button");
          await Promise.all([
            page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 5e3 }).catch(() => {
            }),
            button.click()
          ]);
          this.logger.debug("Waiting for withdrawal navigation to settle");
          await sleep(2e3);
          const refreshedPayments = await scrapePayments(page).catch(() => payments);
          refreshedPayments.last_payout_amount_cents = payments.available_amount_cents;
          refreshedPayments.last_payout_amount = payments.available_amount;
          refreshedPayments.last_payout_amount_formatted = payments.available_amount_formatted;
          this.logger.debug(
            `Withdrawal refresh snapshot: available=${refreshedPayments.available_amount_formatted}, canWithdraw=${refreshedPayments.can_withdraw}`
          );
          return {
            status: "submitted",
            pageUrl: page.url(),
            payments: refreshedPayments
          };
        } finally {
          await page.close().catch(() => {
          });
        }
      }
      async claimProject(projectSlug) {
        const page = await this._newPage();
        try {
          this.logger.debug(`Opening DataAnnotation projects page for claim: ${projectSlug}`);
          await this._applyClaimViewport(page);
          await this._loadAuthenticatedPage(page, PROJECTS_URL, 'div[id="workers/WorkerProjectsTable-hybrid-root"][data-props]');
          this.logger.debug("Reading fresh project list for claim request");
          const projects = await this._scrapeProjects(page);
          const project = projects.find((item) => item.slug === projectSlug);
          if (!project) {
            this.logger.debug("Claim request target project was not found in the active project list");
            return {
              status: "not_found",
              pageUrl: page.url(),
              projectSlug
            };
          }
          this.logger.debug(`Claim target fields: slug=${project.slug}, id=${project.id || ""}, name=${project.name}`);
          await this._openProjectsTab(page, project.name);
          const clickResult = await this._clickProjectClaimTarget(page, project);
          this.logger.debug(`Project row click result: ${clickResult.kind || "none"}${clickResult.href ? ` (${clickResult.href})` : ""}`);
          if (!clickResult.clicked) {
            return {
              status: "not_found",
              pageUrl: page.url(),
              project
            };
          }
          await Promise.race([
            page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 7e3 }).catch(() => {
            }),
            new Promise((resolve) => setTimeout(resolve, 2500))
          ]);
          const pageState = await this._readClaimPageState(page);
          this.logger.debug(`Claim target landed on ${pageState.url}`);
          if (pageState.hasScreenWarning) {
            return {
              status: "screen_too_small",
              pageUrl: pageState.url,
              project,
              pageState
            };
          }
          if (/\/workers\/projects\/[^/]+\/report_time(?:\?|$)/.test(pageState.url)) {
            return {
              status: "wrong_route",
              pageUrl: pageState.url,
              project,
              pageState
            };
          }
          if (pageState.exitVisible) {
            return {
              status: "already_in_work_mode",
              pageUrl: pageState.url,
              project,
              pageState
            };
          }
          if (pageState.enterVisible) {
            const clickedEnter = await this._clickExactVisibleButton(page, "Enter Work Mode");
            if (!clickedEnter) {
              return {
                status: "not_available",
                pageUrl: pageState.url,
                project,
                pageState
              };
            }
            await Promise.race([
              page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 7e3 }).catch(() => {
              }),
              new Promise((resolve) => setTimeout(resolve, 2500))
            ]);
            const afterEnter = await this._readClaimPageState(page);
            if (afterEnter.exitVisible) {
              return {
                status: "claimed",
                pageUrl: afterEnter.url,
                project,
                pageState: afterEnter
              };
            }
            return {
              status: "not_available",
              pageUrl: afterEnter.url,
              project,
              pageState: afterEnter
            };
          }
          return {
            status: "not_available",
            pageUrl: pageState.url,
            project,
            pageState
          };
        } finally {
          await page.close().catch(() => {
          });
        }
      }
      async _ensureAuthenticated(page) {
        await page.goto(PROJECTS_URL, { waitUntil: "domcontentloaded" });
        await page.waitForFunction(
          () => Boolean(document.querySelector('div[id="workers/WorkerProjectsTable-hybrid-root"][data-props]')) || Boolean(window.location.href.includes("/users/sign_in")),
          { timeout: 3e4 }
        ).catch(() => {
        });
        if (this._looksLoggedOut(page)) {
          this.logger.debug("Detected sign-in page, refreshing session");
          await this._login(page);
          await page.goto(PROJECTS_URL, { waitUntil: "domcontentloaded" });
          await page.waitForSelector('div[id="workers/WorkerProjectsTable-hybrid-root"][data-props]', { timeout: 3e4 });
          await this._handleNotificationPrompt(page, "projects landing after login");
          return "authenticated";
        }
        this.logger.debug("Authenticated session detected, waiting for projects payload");
        await page.waitForSelector('div[id="workers/WorkerProjectsTable-hybrid-root"][data-props]', { timeout: 3e4 });
        await this._handleNotificationPrompt(page, "projects landing");
        return "authenticated";
      }
      async _loadAuthenticatedPage(page, url, readySelector) {
        await page.goto(url, { waitUntil: "domcontentloaded" });
        await page.waitForFunction(
          (selector) => Boolean(document.querySelector(selector)) || Boolean(window.location.href.includes("/users/sign_in")),
          { timeout: 3e4 },
          readySelector
        ).catch(() => {
        });
        if (this._looksLoggedOut(page)) {
          this.logger.debug(`Detected sign-in page while loading ${url}, refreshing session`);
          await this._login(page);
          await page.goto(url, { waitUntil: "domcontentloaded" });
          await page.waitForSelector(readySelector, { timeout: 3e4 });
          await this._handleNotificationPrompt(page, `authenticated load for ${url}`);
          return "authenticated";
        }
        this.logger.debug(`Authenticated session detected, waiting for payload at ${url}`);
        await page.waitForSelector(readySelector, { timeout: 3e4 });
        await this._handleNotificationPrompt(page, `authenticated load for ${url}`);
        return "authenticated";
      }
      _looksLoggedOut(page) {
        return page.url().includes("/users/sign_in");
      }
      async _login(page) {
        this.logger.debug("Opening sign-in page");
        await page.goto(SIGN_IN_URL, { waitUntil: "domcontentloaded" });
        await page.waitForSelector("#user_email", { timeout: 3e4 });
        await page.type("#user_email", this.email, { delay: 20 });
        await page.type("#user_password", this.password, { delay: 20 });
        const submitSelector = 'form[action$="/users/sign_in"] button[type="submit"]';
        this.logger.debug("Submitting sign-in form");
        const submitButton = await page.$(submitSelector) || await page.$('button[type="submit"]');
        if (!submitButton) {
          throw new Error("Could not find the DataAnnotation sign-in submit button");
        }
        await Promise.all([
          page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 3e4 }).catch(() => {
          }),
          submitButton.click()
        ]);
        if (page.url().includes("/users/sign_in")) {
          throw new Error("DataAnnotation login failed or session was rejected");
        }
        await this._handleNotificationPrompt(page, "login redirect");
      }
      async _handleNotificationPrompt(page, context = "authenticated page") {
        if (this.notificationPromptHandled) {
          return false;
        }
        this.notificationPromptHandled = true;
        try {
          const result = await page.evaluate(`(() => {
        const normalize = (value) => String(value || '').trim().replace(/\\s+/g, ' ');
        const isVisible = (node) => {
          const style = window.getComputedStyle(node);
          const rect = node.getBoundingClientRect();
          return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0 && rect.width > 0 && rect.height > 0;
        };

        const bodyText = normalize(document.body?.innerText || '');
        const promptText = 'New projects fill up fast';
        if (!bodyText.includes(promptText)) {
          return { seen: false, clicked: false };
        }

        const buttons = Array.from(document.querySelectorAll('button,[role="button"],input[type="button"],input[type="submit"]'));
        const target = buttons.find((node) => normalize(node.innerText || node.textContent || node.getAttribute('aria-label') || '') === 'Allow notifications' && !node.disabled && isVisible(node));
        if (!target) {
          return { seen: true, clicked: false };
        }

        target.click();
        return { seen: true, clicked: true };
      })()`);
          if (!result.seen) {
            this.logger.debug(`No notification prompt seen on ${context}`);
            return false;
          }
          if (result.clicked) {
            this.logger.info(`Accepted DataAnnotation notification prompt on ${context}`);
            return true;
          }
          this.logger.warning(`Notification prompt was seen on ${context} but no exact Allow notifications button was found`);
          return false;
        } catch (error) {
          this.logger.warning(`Notification prompt handling failed on ${context}: ${error.message}`);
          return false;
        }
      }
      async _scrapeProjects(page) {
        const props = await this._readWorkerProjectsProps(page);
        return extractProjects2(props);
      }
      async _readWorkerProjectsProps(page) {
        this.logger.debug("Reading DataAnnotation project data-props payload");
        const rawProps = await page.$eval('[id="workers/WorkerProjectsTable-hybrid-root"]', (element) => element.getAttribute("data-props") || "{}");
        return JSON.parse(rawProps);
      }
      async _applyClaimViewport(page) {
        await page.setViewport({
          width: CLAIM_WORK_SCREEN_METRICS.width,
          height: CLAIM_WORK_SCREEN_METRICS.height,
          deviceScaleFactor: CLAIM_WORK_SCREEN_METRICS.deviceScaleFactor,
          isMobile: CLAIM_WORK_SCREEN_METRICS.mobile,
          hasTouch: CLAIM_WORK_SCREEN_METRICS.hasTouch
        });
        const client = await page.target().createCDPSession();
        await client.send("Emulation.setDeviceMetricsOverride", {
          width: CLAIM_WORK_SCREEN_METRICS.width,
          height: CLAIM_WORK_SCREEN_METRICS.height,
          deviceScaleFactor: CLAIM_WORK_SCREEN_METRICS.deviceScaleFactor,
          mobile: CLAIM_WORK_SCREEN_METRICS.mobile,
          screenWidth: CLAIM_WORK_SCREEN_METRICS.screenWidth,
          screenHeight: CLAIM_WORK_SCREEN_METRICS.screenHeight,
          positionX: CLAIM_WORK_SCREEN_METRICS.positionX,
          positionY: CLAIM_WORK_SCREEN_METRICS.positionY,
          dontSetVisibleSize: CLAIM_WORK_SCREEN_METRICS.dontSetVisibleSize
        });
        await page.setUserAgent(CLAIM_WORK_USER_AGENT);
      }
      async _clickProjectClaimTarget(page, project) {
        const target = buildClaimProjectTarget(project);
        return page.evaluate(({ slug, name, id }) => {
          const normalize = (value) => String(value || "").trim().replace(/\s+/g, " ");
          const exactName = normalize(name);
          const exactSlug = normalize(slug);
          const exactId = normalize(id);
          const rows = Array.from(document.querySelectorAll("tr"));
          for (const row of rows) {
            const rowText = normalize(row.innerText || row.textContent || "");
            if (!rowText) {
              continue;
            }
            const rowMatches = [exactName, exactSlug, exactId].filter(Boolean).some((needle) => rowText.includes(needle));
            if (!rowMatches) {
              continue;
            }
            const anchors = Array.from(row.querySelectorAll("a[href]"));
            const preferredAnchor = anchors.find((anchor) => normalize(anchor.innerText || anchor.textContent || "") === exactName) || anchors.find((anchor) => normalize(anchor.innerText || anchor.textContent || "").includes(exactName)) || anchors.find((anchor) => {
              const href = normalize(anchor.getAttribute("href") || "");
              return href && !/\/report_time(?:\?|$)/.test(href);
            });
            if (preferredAnchor) {
              preferredAnchor.click();
              return {
                clicked: true,
                kind: "anchor",
                href: preferredAnchor.getAttribute("href") || ""
              };
            }
            row.click();
            return {
              clicked: true,
              kind: "row",
              href: ""
            };
          }
          return {
            clicked: false,
            kind: "none",
            href: ""
          };
        }, target);
      }
      async _openProjectsTab(page, projectName) {
        const clicked = await page.evaluate(() => {
          const normalize = (value) => String(value || "").trim().replace(/\s+/g, " ");
          const candidates = Array.from(document.querySelectorAll('a,button,[role="tab"]')).filter((node) => {
            const text = normalize(node.innerText || node.textContent || node.getAttribute("aria-label") || "");
            return /^Projects(?:\s+\d+)?$/i.test(text) || /^Projects\b/i.test(text);
          });
          const visibleCandidates = candidates.filter((node) => {
            const style = window.getComputedStyle(node);
            const rect = node.getBoundingClientRect();
            return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) !== 0 && rect.width > 0 && rect.height > 0;
          });
          if (visibleCandidates.length === 0) {
            return false;
          }
          visibleCandidates[0].click();
          return true;
        });
        if (clicked) {
          await page.waitForFunction(
            () => {
              const normalize = (value) => String(value || "").trim().replace(/\s+/g, " ");
              return Array.from(document.querySelectorAll('[role="tab"][aria-selected="true"],button[aria-selected="true"]')).some((node) => /^Projects(?:\s+\d+)?$/i.test(normalize(node.innerText || node.textContent || node.getAttribute("aria-label") || "")));
            },
            { timeout: 1e4 }
          ).catch(() => {
          });
        }
        return clicked;
      }
      async _readClaimPageState(page) {
        return page.evaluate(() => {
          const normalize = (value) => String(value || "").trim().replace(/\s+/g, " ");
          const isVisible = (node) => {
            const style = window.getComputedStyle(node);
            const rect = node.getBoundingClientRect();
            return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) !== 0 && rect.width > 0 && rect.height > 0;
          };
          const buttons = Array.from(document.querySelectorAll('button,[role="button"],input[type="button"],input[type="submit"]')).map((node) => {
            const text = normalize(node.innerText || node.textContent || node.getAttribute("aria-label") || "");
            return {
              text,
              disabled: Boolean(node.disabled),
              visible: isVisible(node)
            };
          }).filter((button) => button.visible && button.text);
          const enterButtons = buttons.filter((button) => button.text === "Enter Work Mode" && !button.disabled);
          const exitButtons = buttons.filter((button) => button.text === "Exit Work Mode" && !button.disabled);
          return {
            url: location.href,
            title: document.title,
            bodyText: normalize(document.body?.innerText || ""),
            hasScreenWarning: document.body?.innerText?.includes("This project requires a minimum screen size of 1024px.") || document.body?.innerText?.includes("The task content has been hidden until you meet the screen size requirement."),
            enterVisible: enterButtons.length > 0,
            exitVisible: exitButtons.length > 0,
            enterCount: enterButtons.length,
            exitCount: exitButtons.length
          };
        });
      }
      async _clickExactVisibleButton(page, label) {
        return page.evaluate((targetLabel) => {
          const normalize = (value) => String(value || "").trim().replace(/\s+/g, " ");
          const isVisible = (node) => {
            const style = window.getComputedStyle(node);
            const rect = node.getBoundingClientRect();
            return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) !== 0 && rect.width > 0 && rect.height > 0;
          };
          const buttons = Array.from(document.querySelectorAll('button,[role="button"],input[type="button"],input[type="submit"]'));
          const matches = buttons.filter((node) => normalize(node.innerText || node.textContent || node.getAttribute("aria-label") || "") === targetLabel && !node.disabled && isVisible(node));
          if (matches.length !== 1) {
            return false;
          }
          matches[0].click();
          return true;
        }, label);
      }
      async _findWithdrawalButton(page, availableAmountCents = null) {
        const buttons = await page.evaluate(() => {
          const normalizeText2 = (value) => String(value || "").trim().replace(/\s+/g, " ");
          return Array.from(document.querySelectorAll("button")).map((node) => ({
            text: normalizeText2(node.innerText || node.textContent || ""),
            disabled: Boolean(node.disabled),
            ariaLabel: normalizeText2(node.getAttribute("aria-label") || ""),
            title: normalizeText2(node.getAttribute("title") || ""),
            ariaDisabled: normalizeText2(node.getAttribute("aria-disabled") || ""),
            formAction: normalizeText2(node.form?.getAttribute("action") || ""),
            formMethod: normalizeText2(node.form?.getAttribute("method") || "")
          }));
        });
        const withdrawButton = chooseWithdrawalButton(buttons, availableAmountCents);
        if (!withdrawButton.present || withdrawButton.count !== 1 || !withdrawButton.enabled || !withdrawButton.text) {
          return null;
        }
        const handles = await page.$$("button");
        for (const button of handles) {
          const text = await button.evaluate((node) => (node.innerText || node.textContent || "").trim().replace(/\s+/g, " ")).catch(() => "");
          const disabled = await button.evaluate((node) => Boolean(node.disabled)).catch(() => true);
          if (!disabled && text === withdrawButton.text) {
            return button;
          }
        }
        return null;
      }
      async _newPage() {
        return this.browserSession.newPage();
      }
    };
    function countItems(value) {
      return Array.isArray(value) ? value.length : 0;
    }
    function describeProjectList2(label, list, limit = 3) {
      const items = Array.isArray(list) ? list.slice(0, limit) : [];
      if (items.length === 0) {
        return `${label}=[]`;
      }
      const preview = items.map((project) => {
        const name = String(project?.name || project?.workerSubtitle || "Unknown project").trim();
        const id = String(project?.id || project?.slug || "").trim();
        const tasks = String(project?.availableTasksFor ?? project?.tasks ?? "").trim();
        const url = String(project?.url || "").trim();
        const routeHint = url.includes("/report_time") ? " report_time" : "";
        return `${name}${id ? ` [${id}]` : ""}${tasks ? ` tasks=${tasks}` : ""}${routeHint}`;
      }).join(" | ");
      return `${label}=${preview}${countItems(list) > limit ? ` (+${countItems(list) - limit} more)` : ""}; `;
    }
    function sleep(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    }
    module2.exports = {
      DataAnnotationClient,
      PROJECTS_URL,
      SIGN_IN_URL
    };
  }
});

// src/shared/logger.ts
var logger_exports = {};
__export(logger_exports, {
  createLogger: () => createLogger
});
function createLogger(level) {
  const threshold = LEVELS[String(level || "info").toLowerCase()] ?? LEVELS.info;
  const withTimestamp = (levelLabel, method, minLevel) => (...args) => {
    if (threshold <= minLevel) {
      method(`[${formatLogTimestamp(/* @__PURE__ */ new Date())}] ${levelLabel}`, ...args);
    }
  };
  return {
    debug: withTimestamp("[DEBUG]", console.log, LEVELS.debug),
    info: withTimestamp("[INFO]", console.log, LEVELS.info),
    warning: withTimestamp("[WARN]", console.warn, LEVELS.warning),
    error: withTimestamp("[ERROR]", console.error, LEVELS.error)
  };
}
function formatLogTimestamp(date) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZoneName: "shortOffset"
  });
  const parts = formatter.formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value || "";
  const year = get("year");
  const month = get("month");
  const day = get("day");
  const hour = get("hour");
  const minute = get("minute");
  const second = get("second");
  const timeZone = get("timeZoneName") || "local";
  return `${year}-${month}-${day} ${hour}:${minute}:${second} ${timeZone}`;
}
var LEVELS;
var init_logger = __esm({
  "src/shared/logger.ts"() {
    "use strict";
    LEVELS = {
      debug: 10,
      info: 20,
      warning: 30,
      error: 40
    };
  }
});

// src/state/claim_projects_state.ts
var claim_projects_state_exports = {};
__export(claim_projects_state_exports, {
  DEFAULT_CLAIM_PROJECTS_LOCKED: () => DEFAULT_CLAIM_PROJECTS_LOCKED,
  loadClaimProjectsLockState: () => loadClaimProjectsLockState,
  normalizeClaimProjectsLockState: () => normalizeClaimProjectsLockState,
  saveClaimProjectsLockState: () => saveClaimProjectsLockState
});
function loadClaimProjectsLockState(filePath) {
  if (!filePath || !import_fs2.default.existsSync(filePath)) {
    return DEFAULT_CLAIM_PROJECTS_LOCKED;
  }
  try {
    const payload = JSON.parse(import_fs2.default.readFileSync(filePath, "utf8"));
    return normalizeClaimProjectsLockState(payload?.locked ?? payload?.claimProjectsLocked ?? payload?.value ?? payload?.state);
  } catch {
    return DEFAULT_CLAIM_PROJECTS_LOCKED;
  }
}
function saveClaimProjectsLockState(filePath, locked) {
  if (!filePath) {
    return;
  }
  import_fs2.default.mkdirSync(import_path.default.dirname(filePath), { recursive: true });
  import_fs2.default.writeFileSync(
    filePath,
    JSON.stringify(
      {
        locked: Boolean(locked),
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      },
      null,
      2
    )
  );
}
function normalizeClaimProjectsLockState(value) {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["on", "true", "locked", "lock", "1"].includes(normalized)) {
      return true;
    }
    if (["off", "false", "unlocked", "unlock", "0"].includes(normalized)) {
      return false;
    }
  }
  return DEFAULT_CLAIM_PROJECTS_LOCKED;
}
var import_fs2, import_path, DEFAULT_CLAIM_PROJECTS_LOCKED;
var init_claim_projects_state = __esm({
  "src/state/claim_projects_state.ts"() {
    "use strict";
    import_fs2 = __toESM(require("fs"));
    import_path = __toESM(require("path"));
    DEFAULT_CLAIM_PROJECTS_LOCKED = false;
  }
});

// src/state/auto_accept_state.ts
var auto_accept_state_exports = {};
__export(auto_accept_state_exports, {
  DEFAULT_AUTO_ACCEPT_ENABLED: () => DEFAULT_AUTO_ACCEPT_ENABLED,
  loadAutoAcceptState: () => loadAutoAcceptState,
  normalizeAutoAcceptState: () => normalizeAutoAcceptState,
  saveAutoAcceptState: () => saveAutoAcceptState
});
function loadAutoAcceptState(filePath) {
  if (!filePath || !import_fs3.default.existsSync(filePath)) {
    return DEFAULT_AUTO_ACCEPT_ENABLED;
  }
  try {
    const payload = JSON.parse(import_fs3.default.readFileSync(filePath, "utf8"));
    return normalizeAutoAcceptState(payload?.enabled ?? payload?.autoAcceptEnabled ?? payload?.value ?? payload?.state);
  } catch {
    return DEFAULT_AUTO_ACCEPT_ENABLED;
  }
}
function saveAutoAcceptState(filePath, enabled) {
  if (!filePath) {
    return;
  }
  import_fs3.default.mkdirSync(import_path2.default.dirname(filePath), { recursive: true });
  import_fs3.default.writeFileSync(
    filePath,
    JSON.stringify(
      {
        enabled: Boolean(enabled),
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      },
      null,
      2
    )
  );
}
function normalizeAutoAcceptState(value) {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["on", "true", "enabled", "enable", "1"].includes(normalized)) {
      return true;
    }
    if (["off", "false", "disabled", "disable", "0"].includes(normalized)) {
      return false;
    }
  }
  return DEFAULT_AUTO_ACCEPT_ENABLED;
}
var import_fs3, import_path2, DEFAULT_AUTO_ACCEPT_ENABLED;
var init_auto_accept_state = __esm({
  "src/state/auto_accept_state.ts"() {
    "use strict";
    import_fs3 = __toESM(require("fs"));
    import_path2 = __toESM(require("path"));
    DEFAULT_AUTO_ACCEPT_ENABLED = false;
  }
});

// src/state/currency_conversion.ts
var require_currency_conversion = __commonJS({
  "src/state/currency_conversion.ts"(exports2, module2) {
    "use strict";
    var path6 = require("node:path");
    var fs7 = require("node:fs");
    var { formatPublicPayoutEntries } = require_funds_history();
    var CURRENCY_BASE = "USD";
    var CURRENCY_QUOTE = "PHP";
    var DEFAULT_CONVERT_TO_PHP = false;
    var FRANKFURTER_RATE_URL = "https://api.frankfurter.dev/v2/rate/USD/PHP";
    function loadCurrencyState(filePath) {
      if (!filePath || !fs7.existsSync(filePath)) {
        return defaultCurrencyState();
      }
      try {
        const payload = JSON.parse(fs7.readFileSync(filePath, "utf8"));
        return normalizeCurrencyState(payload);
      } catch {
        return defaultCurrencyState();
      }
    }
    function saveCurrencyState(filePath, state) {
      if (!filePath) {
        return;
      }
      fs7.mkdirSync(path6.dirname(filePath), { recursive: true });
      fs7.writeFileSync(filePath, JSON.stringify(normalizeCurrencyState(state), null, 2));
    }
    function defaultCurrencyState() {
      return {
        convert_to_php: DEFAULT_CONVERT_TO_PHP,
        usd_php_rate: null,
        usd_php_rate_date: null,
        usd_php_rate_fetched_at: null,
        usd_php_rate_source: null
      };
    }
    function normalizeCurrencyState(value) {
      const base = defaultCurrencyState();
      const payload = value && typeof value === "object" ? value : {};
      return {
        ...base,
        convert_to_php: normalizeBoolean(payload.convert_to_php ?? payload.convertToPhp ?? payload.enabled ?? payload.value ?? payload.state),
        usd_php_rate: normalizeRate(payload.usd_php_rate ?? payload.usdPhpRate ?? payload.rate),
        usd_php_rate_date: normalizeText2(payload.usd_php_rate_date ?? payload.usdPhpRateDate ?? payload.date),
        usd_php_rate_fetched_at: normalizeIsoDate(payload.usd_php_rate_fetched_at ?? payload.usdPhpRateFetchedAt ?? payload.fetched_at),
        usd_php_rate_source: normalizeText2(payload.usd_php_rate_source ?? payload.usdPhpRateSource ?? payload.source)
      };
    }
    function shouldRefreshCurrencyRate(state, now = /* @__PURE__ */ new Date()) {
      const current = normalizeDate2(now) || /* @__PURE__ */ new Date();
      const currentUtcDate = utcDateString(current);
      const threshold = nextFxRateRefreshWindow(current);
      if (!Number.isFinite(Number(state?.usd_php_rate)) || !state?.usd_php_rate_date) {
        return true;
      }
      if (current < threshold) {
        return false;
      }
      return state.usd_php_rate_date !== currentUtcDate;
    }
    function computeNextFxRateRefreshAt(now = /* @__PURE__ */ new Date()) {
      const current = normalizeDate2(now) || /* @__PURE__ */ new Date();
      const threshold = nextFxRateRefreshWindow(current);
      if (current < threshold) {
        return threshold.toISOString();
      }
      return new Date(threshold.getTime() + 24 * 60 * 60 * 1e3).toISOString();
    }
    function nextFxRateRefreshWindow(now = /* @__PURE__ */ new Date()) {
      const current = normalizeDate2(now) || /* @__PURE__ */ new Date();
      const threshold = new Date(Date.UTC(
        current.getUTCFullYear(),
        current.getUTCMonth(),
        current.getUTCDate(),
        15,
        30,
        0,
        0
      ));
      return threshold;
    }
    async function fetchUsdToPhpRate() {
      const response = await fetch(FRANKFURTER_RATE_URL, {
        headers: { Accept: "application/json" }
      });
      if (!response.ok) {
        throw new Error(`Frankfurter rate request failed with ${response.status}`);
      }
      const payload = await response.json();
      const rate = normalizeRate(payload?.rate);
      if (!Number.isFinite(rate)) {
        throw new Error("Frankfurter rate response missing numeric rate");
      }
      return {
        base: normalizeText2(payload?.base) || CURRENCY_BASE,
        quote: normalizeText2(payload?.quote) || CURRENCY_QUOTE,
        rate,
        date: normalizeText2(payload?.date) || null,
        source: "frankfurter",
        fetched_at: (/* @__PURE__ */ new Date()).toISOString()
      };
    }
    function convertProjectsForCurrency2(projects, currencyState) {
      return (Array.isArray(projects) ? projects : []).map((project) => convertProjectForCurrency(project, currencyState));
    }
    function convertProjectForCurrency(project, currencyState) {
      const displayCurrency = getDisplayCurrency2(currencyState);
      const rate = getExchangeRate(currencyState);
      return {
        ...project || {},
        currency: displayCurrency,
        exchange_rate: rate,
        base_currency: CURRENCY_BASE,
        pay: convertMoneyText(project?.pay, rate, displayCurrency),
        base_pay: convertMoneyText(project?.base_pay, rate, displayCurrency),
        priority_pay: convertMoneyText(project?.priority_pay, rate, displayCurrency)
      };
    }
    function convertPaymentsForCurrency3(payments, currencyState) {
      const displayCurrency = getDisplayCurrency2(currencyState);
      const rate = getExchangeRate(currencyState);
      return convertPaymentsInternal(payments, displayCurrency, rate);
    }
    function convertPaymentsInternal(payments, displayCurrency, rate) {
      const converted = { ...payments || {} };
      const moneyFields = [
        "available_amount",
        "total_earnings",
        "total_paid_out",
        "this_month",
        "best_month",
        "pending_approval"
      ];
      for (const field of moneyFields) {
        converted[field] = convertMoneyNumber(converted[field], rate);
      }
      converted.next_payout_amount = convertMoneyValue(converted.next_payout_amount, rate, displayCurrency);
      converted.next_withdrawal_amount = convertMoneyValue(converted.next_withdrawal_amount, rate, displayCurrency);
      converted.last_payout_amount = convertMoneyValue(converted.last_payout_amount, rate, displayCurrency);
      converted.available_amount_cents = convertCents(converted.available_amount_cents, rate);
      converted.total_earnings_cents = convertCents(converted.total_earnings_cents, rate);
      converted.total_paid_out_cents = convertCents(converted.total_paid_out_cents, rate);
      converted.this_month_cents = convertCents(converted.this_month_cents, rate);
      converted.best_month_cents = convertCents(converted.best_month_cents, rate);
      converted.pending_approval_cents = convertCents(converted.pending_approval_cents, rate);
      converted.next_withdrawal_amount_cents = convertCents(converted.next_withdrawal_amount_cents, rate);
      converted.last_payout_amount_cents = convertCents(converted.last_payout_amount_cents, rate);
      converted.available_amount_formatted = convertMoneyText(converted.available_amount_formatted, rate, displayCurrency);
      converted.total_earnings_formatted = convertMoneyText(converted.total_earnings_formatted, rate, displayCurrency);
      converted.total_paid_out_formatted = convertMoneyText(converted.total_paid_out_formatted, rate, displayCurrency);
      converted.this_month_formatted = convertMoneyText(converted.this_month_formatted, rate, displayCurrency);
      converted.best_month_formatted = convertMoneyText(converted.best_month_formatted, rate, displayCurrency);
      converted.pending_approval_formatted = convertMoneyText(converted.pending_approval_formatted, rate, displayCurrency);
      converted.next_withdrawal_amount_formatted = convertMoneyText(converted.next_withdrawal_amount_formatted, rate, displayCurrency);
      converted.last_payout_amount_formatted = convertMoneyText(converted.last_payout_amount_formatted, rate, displayCurrency);
      converted.button_text = convertButtonText(converted.button_text, rate, displayCurrency);
      converted.withdraw_button_text = convertButtonText(converted.withdraw_button_text, rate, displayCurrency);
      converted.next_payout_entries = convertPayoutEntries(converted.next_payout_entries, rate, displayCurrency);
      converted.pending_payout_entries = convertPayoutEntries(converted.pending_payout_entries, rate, displayCurrency);
      converted.next_payout_entries_public = formatPublicPayoutEntries(converted.next_payout_entries);
      converted.pending_payout_entries_public = formatPublicPayoutEntries(converted.pending_payout_entries);
      delete converted.next_withdrawal_source;
      converted.currency = displayCurrency;
      converted.exchange_rate = rate;
      converted.base_currency = CURRENCY_BASE;
      converted.quote_currency = displayCurrency;
      return converted;
    }
    function convertPayoutEntries(entries, rate, displayCurrency) {
      return (Array.isArray(entries) ? entries : []).map((entry) => ({
        ...entry || {},
        amount: convertMoneyText(entry?.amount, rate, displayCurrency),
        amount_cents: convertCents(entry?.amount_cents, rate)
      }));
    }
    function convertMoneyNumber(value, rate) {
      const amount = Number(value);
      if (!Number.isFinite(amount)) {
        return value ?? null;
      }
      return roundToCents(amount * getExchangeRateValue(rate));
    }
    function convertCents(value, rate) {
      if (value === null || value === void 0) {
        return value ?? null;
      }
      const cents = Number(value);
      if (!Number.isFinite(cents)) {
        return value ?? null;
      }
      return Math.round(cents * getExchangeRateValue(rate));
    }
    function convertMoneyText(value, rate, currencyCode) {
      const parsed = parseMoneyText(value);
      if (!parsed) {
        return value ?? null;
      }
      if (currencyCode === CURRENCY_BASE) {
        return value;
      }
      const converted = roundToCents(parsed.amount * getExchangeRateValue(rate));
      return `${currencyCode} ${formatNumber(converted)}${parsed.suffix}`;
    }
    function convertMoneyValue(value, rate, currencyCode) {
      if (currencyCode === CURRENCY_BASE) {
        return value;
      }
      if (typeof value === "string") {
        return convertMoneyText(value, rate, currencyCode);
      }
      if (typeof value === "number" && Number.isFinite(value)) {
        return roundToCents(value * getExchangeRateValue(rate));
      }
      return value ?? null;
    }
    function convertButtonText(value, rate, currencyCode) {
      if (currencyCode === CURRENCY_BASE || typeof value !== "string") {
        return value ?? null;
      }
      const normalized = value.trim().replace(/\s+/g, " ");
      const match = normalized.match(/^Get paid\s+\$([\d,]+(?:\.\d{2})?)$/i);
      if (!match) {
        return convertMoneyText(value, rate, currencyCode);
      }
      const converted = roundToCents(Number(match[1].replace(/,/g, "")) * getExchangeRateValue(rate));
      return `Get paid ${currencyCode} ${formatNumber(converted)}`;
    }
    function getDisplayCurrency2(state) {
      return state?.convert_to_php ? CURRENCY_QUOTE : CURRENCY_BASE;
    }
    function getExchangeRate(state) {
      if (!state?.convert_to_php) {
        return 1;
      }
      return normalizeRate(state?.usd_php_rate) || 1;
    }
    function getExchangeRateValue(rate) {
      const normalized = normalizeRate(rate);
      return Number.isFinite(normalized) && normalized > 0 ? normalized : 1;
    }
    function normalizeText2(value) {
      if (value === void 0 || value === null) {
        return null;
      }
      const text = String(value).trim();
      return text.length > 0 ? text : null;
    }
    function normalizeBoolean(value) {
      if (typeof value === "boolean") {
        return value;
      }
      if (typeof value === "number") {
        return value !== 0;
      }
      if (typeof value === "string") {
        const normalized = value.trim().toLowerCase();
        return ["1", "true", "yes", "on", "enabled"].includes(normalized);
      }
      return Boolean(value);
    }
    function normalizeRate(value) {
      if (value === void 0 || value === null || value === "") {
        return null;
      }
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
    function normalizeIsoDate(value) {
      if (!value) {
        return null;
      }
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? null : date.toISOString();
    }
    function normalizeDate2(value) {
      if (!value) {
        return null;
      }
      const date = value instanceof Date ? value : new Date(value);
      return Number.isNaN(date.getTime()) ? null : date;
    }
    function utcDateString(date) {
      const current = normalizeDate2(date) || /* @__PURE__ */ new Date();
      return current.toISOString().slice(0, 10);
    }
    function parseMoneyText(value) {
      if (typeof value !== "string") {
        return null;
      }
      const normalized = value.trim().replace(/\s+/g, " ");
      const match = normalized.match(/^([A-Z]{3}|\$)\s?([\d,]+(?:\.\d{2})?)(.*)$/);
      if (!match) {
        return null;
      }
      return {
        amount: Number(match[2].replace(/,/g, "")),
        suffix: match[3] || ""
      };
    }
    function formatNumber(value) {
      return new Intl.NumberFormat("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(Number(value));
    }
    function roundToCents(value) {
      return Math.round(Number(value) * 100) / 100;
    }
    module2.exports = {
      computeNextFxRateRefreshAt,
      convertPaymentsForCurrency: convertPaymentsForCurrency3,
      convertProjectsForCurrency: convertProjectsForCurrency2,
      fetchUsdToPhpRate,
      getDisplayCurrency: getDisplayCurrency2,
      loadCurrencyState,
      normalizeCurrencyState,
      saveCurrencyState,
      shouldRefreshCurrencyRate
    };
  }
});

// src/state/fast_polling_state.ts
var fast_polling_state_exports = {};
__export(fast_polling_state_exports, {
  DEFAULT_FAST_POLLING_ENABLED: () => DEFAULT_FAST_POLLING_ENABLED,
  loadFastPollingState: () => loadFastPollingState,
  normalizeFastPollingState: () => normalizeFastPollingState,
  saveFastPollingState: () => saveFastPollingState
});
function loadFastPollingState(filePath) {
  if (!filePath || !import_fs4.default.existsSync(filePath)) {
    return DEFAULT_FAST_POLLING_ENABLED;
  }
  try {
    const payload = JSON.parse(import_fs4.default.readFileSync(filePath, "utf8"));
    return normalizeFastPollingState(payload?.enabled ?? payload?.fastPollingEnabled ?? payload?.value ?? payload?.state);
  } catch {
    return DEFAULT_FAST_POLLING_ENABLED;
  }
}
function saveFastPollingState(filePath, enabled) {
  if (!filePath) {
    return;
  }
  import_fs4.default.mkdirSync(import_path3.default.dirname(filePath), { recursive: true });
  import_fs4.default.writeFileSync(
    filePath,
    JSON.stringify(
      {
        enabled: Boolean(enabled),
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      },
      null,
      2
    )
  );
}
function normalizeFastPollingState(value) {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["on", "true", "enabled", "enable", "1"].includes(normalized)) {
      return true;
    }
    if (["off", "false", "disabled", "disable", "0"].includes(normalized)) {
      return false;
    }
  }
  return DEFAULT_FAST_POLLING_ENABLED;
}
var import_fs4, import_path3, DEFAULT_FAST_POLLING_ENABLED;
var init_fast_polling_state = __esm({
  "src/state/fast_polling_state.ts"() {
    "use strict";
    import_fs4 = __toESM(require("fs"));
    import_path3 = __toESM(require("path"));
    DEFAULT_FAST_POLLING_ENABLED = false;
  }
});

// src/state/next_withdrawal_state.ts
var next_withdrawal_state_exports = {};
__export(next_withdrawal_state_exports, {
  loadNextWithdrawalState: () => loadNextWithdrawalState,
  normalizeNextWithdrawalState: () => normalizeNextWithdrawalState,
  saveNextWithdrawalState: () => saveNextWithdrawalState
});
function loadNextWithdrawalState(filePath) {
  if (!filePath || !import_fs5.default.existsSync(filePath)) {
    return null;
  }
  try {
    return normalizeNextWithdrawalState(JSON.parse(import_fs5.default.readFileSync(filePath, "utf8")));
  } catch {
    return null;
  }
}
function saveNextWithdrawalState(filePath, payments) {
  if (!filePath) {
    return;
  }
  const state = normalizeNextWithdrawalState(payments);
  const payload = state || {
    next_withdrawal_at: null,
    next_withdrawal_text: null,
    next_withdrawal_source: null
  };
  import_fs5.default.mkdirSync(import_path4.default.dirname(filePath), { recursive: true });
  import_fs5.default.writeFileSync(filePath, JSON.stringify({
    ...payload,
    updated_at: (/* @__PURE__ */ new Date()).toISOString()
  }, null, 2));
}
function normalizeNextWithdrawalState(value) {
  const payload = value && typeof value === "object" ? value : null;
  if (!payload?.next_withdrawal_at) {
    return null;
  }
  const date = new Date(payload.next_withdrawal_at);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return {
    next_withdrawal_at: date.toISOString(),
    next_withdrawal_text: normalizeText(payload.next_withdrawal_text),
    next_withdrawal_source: normalizeText(payload.next_withdrawal_source)
  };
}
function normalizeText(value) {
  if (value === null || value === void 0) {
    return null;
  }
  const text = String(value).trim();
  return text || null;
}
var import_fs5, import_path4;
var init_next_withdrawal_state = __esm({
  "src/state/next_withdrawal_state.ts"() {
    "use strict";
    import_fs5 = __toESM(require("fs"));
    import_path4 = __toESM(require("path"));
  }
});

// src/state/withdraw_lock_state.ts
var withdraw_lock_state_exports = {};
__export(withdraw_lock_state_exports, {
  DEFAULT_WITHDRAW_LOCKED: () => DEFAULT_WITHDRAW_LOCKED,
  loadWithdrawLockState: () => loadWithdrawLockState,
  normalizeWithdrawLockState: () => normalizeWithdrawLockState,
  saveWithdrawLockState: () => saveWithdrawLockState
});
function loadWithdrawLockState(filePath) {
  if (!filePath || !import_fs6.default.existsSync(filePath)) {
    return DEFAULT_WITHDRAW_LOCKED;
  }
  try {
    const payload = JSON.parse(import_fs6.default.readFileSync(filePath, "utf8"));
    return normalizeWithdrawLockState(payload?.locked ?? payload?.withdrawLocked ?? payload?.value ?? payload?.state);
  } catch {
    return DEFAULT_WITHDRAW_LOCKED;
  }
}
function saveWithdrawLockState(filePath, locked) {
  if (!filePath) {
    return;
  }
  import_fs6.default.mkdirSync(import_path5.default.dirname(filePath), { recursive: true });
  import_fs6.default.writeFileSync(
    filePath,
    JSON.stringify(
      {
        locked: Boolean(locked),
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      },
      null,
      2
    )
  );
}
function normalizeWithdrawLockState(value) {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["on", "true", "locked", "lock", "1"].includes(normalized)) {
      return true;
    }
    if (["off", "false", "unlocked", "unlock", "0"].includes(normalized)) {
      return false;
    }
  }
  return DEFAULT_WITHDRAW_LOCKED;
}
var import_fs6, import_path5, DEFAULT_WITHDRAW_LOCKED;
var init_withdraw_lock_state = __esm({
  "src/state/withdraw_lock_state.ts"() {
    "use strict";
    import_fs6 = __toESM(require("fs"));
    import_path5 = __toESM(require("path"));
    DEFAULT_WITHDRAW_LOCKED = true;
  }
});

// src/state/sync_policy.ts
var sync_policy_exports = {};
__export(sync_policy_exports, {
  mergePaymentsWithFundsHistory: () => mergePaymentsWithFundsHistory,
  pickFundsHistoryFields: () => pickFundsHistoryFields,
  retainNextWithdrawalAt: () => retainNextWithdrawalAt,
  shouldIncludeFundsHistory: () => shouldIncludeFundsHistory,
  shouldIncludePayments: () => shouldIncludePayments
});
function shouldIncludePayments(_options) {
  return true;
}
function shouldIncludeFundsHistory({
  includePayments,
  manualSyncRequested,
  initialSyncCompleted,
  fastPollingEnabled,
  now,
  nextFundsHistoryAt,
  nextExpeditedFundsHistoryAt
}) {
  if (!includePayments) {
    return false;
  }
  if (manualSyncRequested || !initialSyncCompleted) {
    return true;
  }
  if (Number.isFinite(nextExpeditedFundsHistoryAt) && now >= nextExpeditedFundsHistoryAt) {
    return true;
  }
  if (fastPollingEnabled) {
    return false;
  }
  return Number.isFinite(nextFundsHistoryAt) ? now >= nextFundsHistoryAt : true;
}
function pickFundsHistoryFields(payments) {
  return {
    next_payout_days: payments?.next_payout_days ?? 0,
    next_payout_at: payments?.next_payout_at ?? null,
    next_payout_entries_count: payments?.next_payout_entries_count ?? 0,
    next_payout_at_human: payments?.next_payout_at_human ?? null,
    next_payout_entries: Array.isArray(payments?.next_payout_entries) ? payments.next_payout_entries : [],
    next_payout_amount: payments?.next_payout_amount ?? null,
    next_payout_source: payments?.next_payout_source ?? null,
    next_payout_confidence: payments?.next_payout_confidence ?? null,
    pending_payout_entries: Array.isArray(payments?.pending_payout_entries) ? payments.pending_payout_entries : [],
    last_payout_amount_cents: payments?.last_payout_amount_cents ?? null,
    last_payout_amount: payments?.last_payout_amount ?? null,
    last_payout_amount_formatted: payments?.last_payout_amount_formatted ?? null
  };
}
function mergePaymentsWithFundsHistory(payments, fundsHistorySnapshot) {
  return {
    ...payments || {},
    ...fundsHistorySnapshot || {}
  };
}
function retainNextWithdrawalAt(currentPayments, previousPayments, now = /* @__PURE__ */ new Date()) {
  const current = { ...currentPayments || {} };
  const previousNextWithdrawalAt = parseDate(previousPayments?.next_withdrawal_at);
  const currentTime = parseDate(now) || /* @__PURE__ */ new Date();
  if (previousNextWithdrawalAt && previousNextWithdrawalAt > currentTime && current.next_withdrawal_source !== "direct") {
    current.next_withdrawal_at = previousPayments?.next_withdrawal_at ?? null;
    current.next_withdrawal_text = previousPayments?.next_withdrawal_text ?? null;
    current.next_withdrawal_source = previousPayments?.next_withdrawal_source ?? null;
  }
  retainLastPayoutAmount(current, previousPayments);
  Object.assign(current, buildWithdrawalAmountSnapshot(current, current.next_withdrawal_at || null, now));
  return current;
}
function parseDate(value) {
  if (!value) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
function retainLastPayoutAmount(currentPayments, previousPayments) {
  if (currentPayments.last_payout_amount_cents !== null && currentPayments.last_payout_amount_cents !== void 0 && currentPayments.last_payout_amount !== null && currentPayments.last_payout_amount !== void 0) {
    return;
  }
  const previousAvailableAmountCents = normalizeCents(previousPayments?.available_amount_cents, previousPayments?.available_amount);
  const currentAvailableAmountCents = normalizeCents(currentPayments.available_amount_cents, currentPayments.available_amount);
  if (previousAvailableAmountCents === null || previousAvailableAmountCents <= 0 || currentAvailableAmountCents !== null && currentAvailableAmountCents > 0) {
    return;
  }
  currentPayments.last_payout_amount_cents = previousAvailableAmountCents;
  currentPayments.last_payout_amount = previousAvailableAmountCents / 100;
  currentPayments.last_payout_amount_formatted = formatCents(previousAvailableAmountCents);
}
function normalizeCents(centsValue, amountValue) {
  const cents = Number(centsValue);
  if (Number.isFinite(cents)) {
    return Math.round(cents);
  }
  const amount = Number(amountValue);
  if (Number.isFinite(amount)) {
    return Math.round(amount * 100);
  }
  return null;
}
function formatCents(value) {
  return `$${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value / 100)}`;
}
var buildWithdrawalAmountSnapshot;
var init_sync_policy = __esm({
  "src/state/sync_policy.ts"() {
    "use strict";
    ({ buildWithdrawalAmountSnapshot } = require_withdrawal_amount());
  }
});

// src/projects/project_delta.ts
var project_delta_exports = {};
__export(project_delta_exports, {
  detectNewTaskProjects: () => detectNewTaskProjects,
  indexProjectsBySlug: () => indexProjectsBySlug
});
function detectNewTaskProjects(previousProjects, currentProjects) {
  const previousBySlug = indexProjectsBySlug(previousProjects);
  const deltas = [];
  for (const project of Array.isArray(currentProjects) ? currentProjects : []) {
    const currentTasks = numberOrZero2(project?.tasks);
    if (currentTasks <= 0) {
      continue;
    }
    const slug = String(project?.slug || "").trim();
    if (!slug) {
      continue;
    }
    const previous = previousBySlug.get(slug);
    const previousTasks = numberOrZero2(previous?.tasks);
    const addedTasks = currentTasks - previousTasks;
    if (addedTasks <= 0) {
      continue;
    }
    deltas.push({
      slug,
      id: stringOrNull(project?.id),
      name: String(project?.name || "Unknown project").trim(),
      url: project?.url ? String(project.url) : buildProjectUrl(project?.id),
      previous_tasks: previousTasks,
      current_tasks: currentTasks,
      added_tasks: addedTasks
    });
  }
  return deltas;
}
function indexProjectsBySlug(projects) {
  const map = /* @__PURE__ */ new Map();
  for (const project of Array.isArray(projects) ? projects : []) {
    const slug = String(project?.slug || "").trim();
    if (!slug || map.has(slug)) {
      continue;
    }
    map.set(slug, project);
  }
  return map;
}
function numberOrZero2(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
function stringOrNull(value) {
  if (value === void 0 || value === null || value === "") {
    return null;
  }
  return String(value);
}
var init_project_delta = __esm({
  "src/projects/project_delta.ts"() {
    "use strict";
    init_projects();
  }
});

// src/integrations/ha_notifications.ts
var require_ha_notifications = __commonJS({
  "src/integrations/ha_notifications.ts"(exports2, module2) {
    "use strict";
    async function createPersistentNotification2({ title, message, notificationId, logger }) {
      const token = process.env.SUPERVISOR_TOKEN;
      if (!token) {
        throw new Error("SUPERVISOR_TOKEN is required for Home Assistant persistent notifications");
      }
      const response = await fetch("http://supervisor/core/api/services/persistent_notification/create", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          title,
          message,
          notification_id: notificationId
        })
      });
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        const error = new Error(`Failed to create persistent notification (${response.status}): ${body}`);
        logger?.warning?.(error.message);
        throw error;
      }
      logger?.info?.(`Created persistent notification: ${title}`);
    }
    async function purgeRecorderEntities({ entityIds, keepDays = 0, logger }) {
      const token = process.env.SUPERVISOR_TOKEN;
      if (!token) {
        throw new Error("SUPERVISOR_TOKEN is required to purge recorder entities");
      }
      const response = await fetch("http://supervisor/core/api/services/recorder/purge_entities", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          entity_id: entityIds,
          keep_days: keepDays
        })
      });
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        const error = new Error(`Failed to purge recorder entities (${response.status}): ${body}`);
        logger?.warning?.(error.message);
        throw error;
      }
      logger?.info?.(`Purged recorder history for ${Array.isArray(entityIds) ? entityIds.length : 1} entities`);
    }
    module2.exports = {
      createPersistentNotification: createPersistentNotification2,
      purgeRecorderEntities
    };
  }
});

// src/app/messages.ts
var messages_exports = {};
__export(messages_exports, {
  buildClaimNotReadyMessage: () => buildClaimNotReadyMessage,
  buildClaimProjectsLockedMessage: () => buildClaimProjectsLockedMessage,
  buildWithdrawalLockedMessage: () => buildWithdrawalLockedMessage,
  buildWithdrawalNotReadyMessage: () => buildWithdrawalNotReadyMessage,
  formatFriendlyDate: () => formatFriendlyDate,
  parseDate: () => parseDate2
});
function buildWithdrawalLockedMessage() {
  return "Withdrawals are currently locked.\n\nTurn off Withdraw Locked, then press Withdraw Funds again.";
}
function buildClaimProjectsLockedMessage() {
  return "Claim projects are currently locked.\n\nTurn off Claim Projects Locked, then press Claim Project again.";
}
function buildClaimNotReadyMessage(result) {
  if (result?.status === "screen_too_small") {
    return "Claim Project is not available right now.\n\nThe task page is still blocked by the screen size requirement.";
  }
  if (result?.status === "not_found") {
    return "Claim Project is not available right now.\n\nThe project was not found on the current projects page.";
  }
  if (result?.status === "wrong_route") {
    return "Claim Project navigated to an unexpected page.\n\nThe project row did not open a task page.";
  }
  return "Claim Project is not available right now.\n\nThe project did not open a claimable task page.";
}
function buildWithdrawalNotReadyMessage(payments, reason) {
  if (reason === "time") {
    const nextWithdrawalText = formatFriendlyDate(payments.next_withdrawal_at);
    return `Withdrawal is not available yet.

Next withdrawal: ${nextWithdrawalText || "unknown"}.`;
  }
  if (!payments.withdraw_button_present) {
    return "Withdrawal is not available right now.\n\nThe withdrawal button is not visible on DataAnnotation.";
  }
  return `Withdrawal is not available right now.

Available funds: ${payments.available_amount_formatted}.`;
}
function formatFriendlyDate(value) {
  const date = parseDate2(value);
  if (!date) {
    return null;
  }
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short"
  }).format(date);
}
function parseDate2(value) {
  if (!value) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
var init_messages = __esm({
  "src/app/messages.ts"() {
    "use strict";
  }
});

// src/app/commands.ts
var commands_exports = {};
__export(commands_exports, {
  buildAutoAcceptSignature: () => buildAutoAcceptSignature,
  handleClaimRequest: () => handleClaimRequest,
  handleWithdrawRequest: () => handleWithdrawRequest,
  maybeAutoAcceptNewTasks: () => maybeAutoAcceptNewTasks
});
function buildAutoAcceptSignature(newTaskEvents) {
  if (!Array.isArray(newTaskEvents) || newTaskEvents.length === 0) {
    return null;
  }
  return newTaskEvents.map((event) => [event.slug, event.added_tasks, event.current_tasks, event.name].join("|")).join(";;");
}
async function maybeAutoAcceptNewTasks({
  bridge,
  client,
  logger,
  autoAcceptEnabled,
  claimProjectsLocked,
  newTaskEvents,
  lastAttemptSignature,
  taskStatus
}) {
  let enabled = Boolean(autoAcceptEnabled);
  let nextAttemptSignature = lastAttemptSignature || null;
  if (!enabled) {
    return { enabled, lastAttemptSignature: nextAttemptSignature };
  }
  if (taskStatus?.in_progress_task) {
    logger.info("Auto accept disabled because In Progress Task is ON");
    saveAutoAcceptState2(AUTO_ACCEPT_STATE_PATH, false);
    bridge.publishAutoAcceptState(false);
    return { enabled: false, lastAttemptSignature: null };
  }
  if (claimProjectsLocked) {
    logger.info("Auto accept disabled because Claim Projects Locked is ON");
    saveAutoAcceptState2(AUTO_ACCEPT_STATE_PATH, false);
    bridge.publishAutoAcceptState(false);
    return { enabled: false, lastAttemptSignature: null };
  }
  if (!Array.isArray(newTaskEvents) || newTaskEvents.length === 0) {
    return { enabled, lastAttemptSignature: nextAttemptSignature };
  }
  const signature = buildAutoAcceptSignature(newTaskEvents);
  if (signature && signature === nextAttemptSignature) {
    return { enabled, lastAttemptSignature: nextAttemptSignature };
  }
  const claimTarget = newTaskEvents[0];
  nextAttemptSignature = signature;
  logger.info(`Auto accept detected new task: "${claimTarget.name}"${claimTarget.url ? ` ${claimTarget.url}` : ""}`);
  const claimStartedAt = Date.now();
  const claimResult = await client.claimProject(claimTarget.slug);
  logger.info(`Auto accept claim result for ${claimTarget.slug}: ${claimResult.status}`);
  logger.debug(`Auto accept claim completed in ${Date.now() - claimStartedAt}ms`);
  if (claimResult.status === "claimed" || claimResult.status === "already_in_work_mode") {
    logger.info("Auto accept turned off after successful claim");
    saveAutoAcceptState2(AUTO_ACCEPT_STATE_PATH, false);
    bridge.publishAutoAcceptState(false);
    bridge.scanRequested.value = true;
    return { enabled: false, lastAttemptSignature: null };
  }
  return { enabled, lastAttemptSignature: nextAttemptSignature };
}
async function handleWithdrawRequest(client, walletSync, bridge, withdrawLocked, currencyState, lastSuccessfulPayments, logger) {
  logger.info("Processing withdraw request");
  if (withdrawLocked) {
    try {
      await createPersistentNotification({
        title: "Data Annotation Withdrawal Locked",
        message: buildWithdrawalLockedMessage2(),
        notificationId: "dataannotation_withdrawal_locked",
        logger
      });
    } catch (error) {
      logger.warning(`Failed to create withdrawal locked notification: ${error.message}`);
    }
    logger.warning("Withdrawal request blocked because the lock is on");
    return;
  }
  logger.debug("Submitting withdrawal request through fresh eligibility check");
  const result = await client.withdrawAvailableFunds();
  const payments = retainNextWithdrawalAt2(result.payments || {}, lastSuccessfulPayments || null, /* @__PURE__ */ new Date());
  const publishedPayments = convertPaymentsForCurrency(payments, currencyState);
  if (result.status !== "submitted") {
    const nextWithdrawalAt = parseDate3(publishedPayments?.next_withdrawal_at);
    const reason = !publishedPayments?.can_withdraw && nextWithdrawalAt && nextWithdrawalAt.getTime() > Date.now() ? "time" : publishedPayments?.withdraw_button_present ? "funds" : "button";
    const message = buildWithdrawalNotReadyMessage2(publishedPayments, reason);
    try {
      await createPersistentNotification({
        title: "Data Annotation Withdrawal Not Ready",
        message,
        notificationId: "dataannotation_withdrawal_not_ready",
        logger
      });
    } catch (error) {
      logger.warning(`Failed to create withdrawal not-ready notification: ${error.message}`);
    }
    logger.warning(`Withdrawal request was not submitted: ${result.status}`);
  } else {
    logger.info("Withdrawal request submitted successfully");
    if (walletSync?.recordWithdrawalSubmission) {
      await walletSync.recordWithdrawalSubmission({
        payments,
        currencyState,
        now: /* @__PURE__ */ new Date()
      });
    }
  }
  bridge.publishPayments(publishedPayments);
  bridge.scanRequested.value = true;
  logger.debug("Scheduling sync after withdrawal request");
}
async function handleClaimRequest(client, bridge, claimProjectsLocked, claimRequest, logger) {
  logger.info(`Processing claim project request${claimRequest?.slug ? ` for ${claimRequest.slug}` : ""}`);
  if (claimProjectsLocked) {
    try {
      await createPersistentNotification({
        title: "Data Annotation Claim Projects Locked",
        message: buildClaimProjectsLockedMessage2(),
        notificationId: "dataannotation_claim_projects_locked",
        logger
      });
    } catch (error) {
      logger.warning(`Failed to create claim projects locked notification: ${error.message}`);
    }
    logger.warning("Claim project request blocked because the lock is on");
    return;
  }
  if (!claimRequest?.slug) {
    logger.warning("Claim project request missing a project slug");
    return;
  }
  logger.debug("Submitting claim project request through fresh project page check");
  const result = await client.claimProject(claimRequest.slug);
  if (result.status === "claimed" || result.status === "already_in_work_mode") {
    logger.info(`Claim project request completed: ${result.status}`);
  } else {
    try {
      await createPersistentNotification({
        title: "Data Annotation Claim Project Not Ready",
        message: buildClaimNotReadyMessage2(result),
        notificationId: "dataannotation_claim_project_not_ready",
        logger
      });
    } catch (error) {
      logger.warning(`Failed to create claim project not-ready notification: ${error.message}`);
    }
    logger.warning(`Claim project request was not completed: ${result.status}`);
  }
  logger.debug(`Claim project result page URL: ${result.pageUrl || ""}`);
}
var createPersistentNotification, saveAutoAcceptState2, convertPaymentsForCurrency, retainNextWithdrawalAt2, buildClaimNotReadyMessage2, buildClaimProjectsLockedMessage2, buildWithdrawalLockedMessage2, buildWithdrawalNotReadyMessage2, parseDate3, AUTO_ACCEPT_STATE_PATH;
var init_commands = __esm({
  "src/app/commands.ts"() {
    "use strict";
    ({ createPersistentNotification } = require_ha_notifications());
    ({ saveAutoAcceptState: saveAutoAcceptState2 } = (init_auto_accept_state(), __toCommonJS(auto_accept_state_exports)));
    ({ convertPaymentsForCurrency } = require_currency_conversion());
    ({ retainNextWithdrawalAt: retainNextWithdrawalAt2 } = (init_sync_policy(), __toCommonJS(sync_policy_exports)));
    ({ buildClaimNotReadyMessage: buildClaimNotReadyMessage2, buildClaimProjectsLockedMessage: buildClaimProjectsLockedMessage2, buildWithdrawalLockedMessage: buildWithdrawalLockedMessage2, buildWithdrawalNotReadyMessage: buildWithdrawalNotReadyMessage2, parseDate: parseDate3 } = (init_messages(), __toCommonJS(messages_exports)));
    AUTO_ACCEPT_STATE_PATH = "/data/auto-accept-state.json";
  }
});

// src/app/sync.ts
var sync_exports = {};
__export(sync_exports, {
  doSync: () => doSync,
  getActivePollCron: () => getActivePollCron,
  republishCurrencyViews: () => republishCurrencyViews
});
function getActivePollCron(config, fastPollingEnabled) {
  return fastPollingEnabled ? config.fast_poll_cron : config.poll_cron;
}
function republishCurrencyViews(bridge, projects, payments, currencyState, scrapedAt = (/* @__PURE__ */ new Date()).toISOString()) {
  if (Array.isArray(projects)) {
    bridge.publishProjects(convertProjectsForCurrency(projects, currencyState), scrapedAt);
  }
  if (payments) {
    bridge.publishPayments(convertPaymentsForCurrency2(payments, currencyState), payments.scraped_at || scrapedAt);
  }
}
async function doSync(client, bridge, config, lastSuccessfulSyncAt, lastSuccessfulProjectCount, lastSuccessfulTotalTaskCount, initialSyncCompleted, previousProjects, lastSuccessfulPayments, autoAcceptState, currencyState, withdrawLocked, includeFundsHistory, lastFundsHistorySnapshot, logger) {
  const startedAt = (/* @__PURE__ */ new Date()).toISOString();
  logger.info(`Starting sync at ${startedAt}`);
  try {
    const projectStartedAt = Date.now();
    const result = await client.collectProjects();
    const completedAt = (/* @__PURE__ */ new Date()).toISOString();
    const filteredProjectsResult = filterExcludedProjects2(result.projects, config.excluded_project_patterns);
    const projects = filteredProjectsResult.projects;
    const excludedProjects = filteredProjectsResult.excludedProjects;
    const projectSummary = summarizeProjects2(projects);
    const newTaskEvents = initialSyncCompleted ? detectNewTaskProjects2(previousProjects, projects) : [];
    logger.debug(`Project scrape completed in ${Date.now() - projectStartedAt}ms`);
    logger.debug(
      `Project filter summary: included=${projects.length}, excluded=${excludedProjects.length}, total_tasks=${projectSummary.total_tasks}`
    );
    if (projects.length > 0) {
      logger.debug(`Included projects: ${describeProjectList(projects, 5)}`);
    }
    if (excludedProjects.length > 0) {
      logger.info(`Filtered ${excludedProjects.length} excluded project${excludedProjects.length === 1 ? "" : "s"} from project totals`);
      logger.debug(`Excluded projects: ${describeProjectList(excludedProjects, 5)}`);
    }
    logger.info(
      `${includeFundsHistory ? "Sync" : "Fast sync"} complete: ${projectSummary.count} projects, ${projectSummary.total_tasks} total tasks`
    );
    logger.debug(`Projects page URL: ${result.pageUrl}`);
    bridge.publishOnline();
    bridge.publishProfile(config.profile || "Data Annotation");
    bridge.publishWithdrawLockState(withdrawLocked);
    bridge.publishSummary({
      count: projectSummary.count,
      total_tasks: projectSummary.total_tasks,
      profile: config.profile || "Data Annotation",
      login_state: result.loginState,
      lastAttemptedSyncAt: startedAt,
      lastSuccessfulSyncAt: completedAt,
      excluded_project_count: excludedProjects.length,
      excluded_project_names: excludedProjects.map((project) => project.name),
      new_task_detected: newTaskEvents.length > 0,
      new_task_count: newTaskEvents.reduce((sum, event) => sum + event.added_tasks, 0),
      new_task_project_name: newTaskEvents[0]?.name || null,
      new_task_project_url: newTaskEvents[0]?.url || null,
      new_task_detected_at: newTaskEvents.length > 0 ? completedAt : null,
      new_tasks: newTaskEvents
    });
    bridge.publishStatusSuccess({
      trigger: "poll",
      state: "online",
      loginState: result.loginState,
      lastAttemptedSyncAt: startedAt,
      lastSuccessfulSyncAt: completedAt,
      lastError: null
    });
    const displayCurrency = getDisplayCurrency(currencyState);
    const publishedProjects = convertProjectsForCurrency(projects, currencyState);
    bridge.publishProjects(publishedProjects, completedAt);
    bridge.publishTaskStatus(result.taskStatus, completedAt);
    for (const event of newTaskEvents) {
      logger.debug(
        `New task delta: slug=${event.slug}, id=${event.id || ""}, previous=${event.previous_tasks}, current=${event.current_tasks}, added=${event.added_tasks}${event.url ? `, url=${event.url}` : ""}`
      );
      logger.info(`New DataAnnotation task detected: "${event.name}" (+${event.added_tasks}, total ${event.current_tasks})${event.url ? ` ${event.url}` : ""}`);
    }
    const autoAcceptStartedAt = Date.now();
    const autoAcceptResult = await maybeAutoAcceptNewTasks2({
      bridge,
      client,
      logger,
      autoAcceptEnabled: autoAcceptState.enabled,
      claimProjectsLocked: autoAcceptState.claimProjectsLocked,
      newTaskEvents,
      lastAttemptSignature: autoAcceptState.lastAttemptSignature,
      taskStatus: result.taskStatus
    });
    autoAcceptState.enabled = autoAcceptResult.enabled;
    autoAcceptState.lastAttemptSignature = autoAcceptResult.lastAttemptSignature;
    logger.debug(`Auto accept decision completed in ${Date.now() - autoAcceptStartedAt}ms`);
    const paymentsStartedAt = Date.now();
    const payments = await client.collectPayments({
      includeFundsHistory,
      fundsHistoryObservationsPath: FUNDS_HISTORY_OBSERVATIONS_PATH
    });
    logger.debug(`Payments scrape completed in ${Date.now() - paymentsStartedAt}ms`);
    const mergedPayments = includeFundsHistory ? payments : mergePaymentsWithFundsHistory2(payments, lastFundsHistorySnapshot);
    const paymentsForPublish = retainNextWithdrawalAt3(mergedPayments, lastSuccessfulPayments, /* @__PURE__ */ new Date());
    logger.info(`Payments snapshot complete: available=${paymentsForPublish.available_amount_formatted}, canWithdraw=${paymentsForPublish.can_withdraw}`);
    logger.debug(`Payments page URL: ${paymentsForPublish.pageUrl}`);
    if (!includeFundsHistory) {
      logger.debug("Payments snapshot reused last known Funds History fields");
    }
    const publishedPayments = convertPaymentsForCurrency2(paymentsForPublish, currencyState);
    bridge.publishPayments(publishedPayments, mergedPayments.scraped_at || completedAt);
    return {
      lastSuccessfulSyncAt: completedAt,
      lastSuccessfulProjectCount: projectSummary.count,
      lastSuccessfulTotalTaskCount: projectSummary.total_tasks,
      projects,
      payments: paymentsForPublish,
      currencyUnit: displayCurrency,
      autoAcceptState: autoAcceptResult,
      fundsHistorySnapshot: includeFundsHistory ? pickFundsHistoryFields2(mergedPayments) : null,
      includeFundsHistory,
      taskStatus: result.taskStatus,
      newTaskEvents
    };
  } catch (error) {
    logger.error(`Sync failed: ${error.stack || error.message}`);
    bridge.publishStatusError({
      trigger: "poll",
      state: "offline",
      loginState: "login_failed",
      lastAttemptedSyncAt: startedAt,
      lastSuccessfulSyncAt,
      lastError: error.message
    });
    bridge.publishPublishedProjectAvailability(false);
    bridge.publishWithdrawLockState(withdrawLocked);
    logger.warning("Retaining last known project summary because sync did not complete");
    return {
      lastSuccessfulSyncAt,
      lastSuccessfulProjectCount,
      lastSuccessfulTotalTaskCount,
      projects: previousProjects,
      payments: null,
      currencyUnit: getDisplayCurrency(currencyState),
      autoAcceptState,
      fundsHistorySnapshot: null,
      includeFundsHistory: false,
      taskStatus: null,
      newTaskEvents: []
    };
  }
}
function describeProjectList(projects, limit = 5) {
  const items = Array.isArray(projects) ? projects.slice(0, limit) : [];
  if (items.length === 0) {
    return "[]";
  }
  const total = Array.isArray(projects) ? projects.length : items.length;
  const preview = items.map((project) => {
    const name = String(project?.name || project?.workerSubtitle || "Unknown project").trim();
    const slug = String(project?.slug || "").trim();
    const id = String(project?.id || "").trim();
    const tasks = Number.isFinite(Number(project?.tasks)) ? Number(project.tasks) : null;
    const url = String(project?.url || "").trim();
    const routeHint = /\/report_time(?:\?|$)/.test(url) ? " report_time" : "";
    return `${name}${slug ? ` [${slug}]` : ""}${id ? ` id=${id}` : ""}${tasks !== null ? ` tasks=${tasks}` : ""}${routeHint}${url ? ` url=${url}` : ""}`;
  }).join(" | ");
  return `${preview}${items.length < total ? ` (+${total - items.length} more)` : ""}`;
}
var convertPaymentsForCurrency2, convertProjectsForCurrency, getDisplayCurrency, detectNewTaskProjects2, filterExcludedProjects2, summarizeProjects2, mergePaymentsWithFundsHistory2, pickFundsHistoryFields2, retainNextWithdrawalAt3, maybeAutoAcceptNewTasks2, FUNDS_HISTORY_OBSERVATIONS_PATH;
var init_sync = __esm({
  "src/app/sync.ts"() {
    "use strict";
    ({ convertPaymentsForCurrency: convertPaymentsForCurrency2, convertProjectsForCurrency, getDisplayCurrency } = require_currency_conversion());
    ({ detectNewTaskProjects: detectNewTaskProjects2 } = (init_project_delta(), __toCommonJS(project_delta_exports)));
    ({ filterExcludedProjects: filterExcludedProjects2 } = (init_project_filters(), __toCommonJS(project_filters_exports)));
    ({ summarizeProjects: summarizeProjects2 } = (init_projects(), __toCommonJS(projects_exports)));
    ({ mergePaymentsWithFundsHistory: mergePaymentsWithFundsHistory2, pickFundsHistoryFields: pickFundsHistoryFields2, retainNextWithdrawalAt: retainNextWithdrawalAt3 } = (init_sync_policy(), __toCommonJS(sync_policy_exports)));
    ({ maybeAutoAcceptNewTasks: maybeAutoAcceptNewTasks2 } = (init_commands(), __toCommonJS(commands_exports)));
    FUNDS_HISTORY_OBSERVATIONS_PATH = "/data/funds-history-observations.json";
  }
});

// src/state/wallet_sync_state.ts
var require_wallet_sync_state = __commonJS({
  "src/state/wallet_sync_state.ts"(exports2, module2) {
    "use strict";
    var fs7 = require("node:fs");
    var path6 = require("node:path");
    var DEFAULT_WALLET_SYNC_STATE = {
      version: 2,
      created_at: null,
      updated_at: null,
      first_sync_completed_at: null,
      wallet_api_retry_after_at: null,
      wallet_api_failure_count: 0,
      wallet_api_last_error: null,
      last_seen_last_payout_at: null,
      last_seen_available_amount_cents: null,
      last_seen_available_amount: null,
      imported_funds_entries: {},
      withdrawal_events: {}
    };
    function loadWalletSyncState(filePath) {
      if (!filePath || !fs7.existsSync(filePath)) {
        return cloneWalletSyncState(DEFAULT_WALLET_SYNC_STATE);
      }
      try {
        return normalizeWalletSyncState(JSON.parse(fs7.readFileSync(filePath, "utf8")));
      } catch {
        return cloneWalletSyncState(DEFAULT_WALLET_SYNC_STATE);
      }
    }
    function saveWalletSyncState(filePath, state) {
      if (!filePath) {
        return;
      }
      const normalized = normalizeWalletSyncState(state);
      fs7.mkdirSync(path6.dirname(filePath), { recursive: true });
      const tempPath = `${filePath}.tmp`;
      fs7.writeFileSync(tempPath, JSON.stringify(normalized, null, 2));
      fs7.renameSync(tempPath, filePath);
    }
    function normalizeWalletSyncState(value) {
      const payload = value && typeof value === "object" ? value : {};
      const version2 = normalizeNumber(payload.version) || 2;
      return {
        version: version2,
        created_at: normalizeIsoDate(payload.created_at) || null,
        updated_at: normalizeIsoDate(payload.updated_at) || null,
        first_sync_completed_at: normalizeIsoDate(payload.first_sync_completed_at) || null,
        wallet_api_retry_after_at: normalizeIsoDate(payload.wallet_api_retry_after_at) || null,
        wallet_api_failure_count: normalizeNumber(payload.wallet_api_failure_count) || 0,
        wallet_api_last_error: normalizeText2(payload.wallet_api_last_error),
        last_seen_last_payout_at: normalizeIsoDate(payload.last_seen_last_payout_at) || null,
        last_seen_available_amount_cents: normalizeNumber(payload.last_seen_available_amount_cents),
        last_seen_available_amount: normalizeNumber(payload.last_seen_available_amount),
        imported_funds_entries: normalizeEntryMap(payload.imported_funds_entries),
        withdrawal_events: normalizeEntryMap(payload.withdrawal_events)
      };
    }
    function normalizeEntryMap(value) {
      const entries = value && typeof value === "object" ? value : {};
      const normalized = {};
      for (const [key, entry] of Object.entries(entries)) {
        const normalizedEntry = normalizeLedgerEntry(key, entry);
        if (normalizedEntry) {
          normalized[key] = normalizedEntry;
        }
      }
      return normalized;
    }
    function normalizeLedgerEntry(key, value) {
      if (!value || typeof value !== "object") {
        return null;
      }
      const feeRecordId = normalizeText2(value.fee_record_id) || normalizeText2(value.record_id);
      const transferRecordId = normalizeText2(value.transfer_record_id) || normalizeText2(value.mirror_record_id);
      return {
        key: String(value.key || key || "").trim(),
        note_marker: normalizeText2(value.note_marker),
        source_marker: normalizeText2(value.source_marker),
        fee_record_id: feeRecordId,
        transfer_record_id: transferRecordId,
        record_id: feeRecordId,
        mirror_record_id: transferRecordId,
        source_fingerprint: normalizeText2(value.source_fingerprint),
        source_type: normalizeText2(value.source_type),
        source_amount_usd_cents: normalizeNumber(value.source_amount_usd_cents),
        source_amount_php_cents: normalizeNumber(value.source_amount_php_cents),
        source_fee_usd_cents: normalizeNumber(value.source_fee_usd_cents),
        source_fee_php_cents: normalizeNumber(value.source_fee_php_cents),
        source_net_usd_cents: normalizeNumber(value.source_net_usd_cents),
        source_net_php_cents: normalizeNumber(value.source_net_php_cents),
        source_rate: normalizeNumber(value.source_rate),
        created_at: normalizeIsoDate(value.created_at) || null,
        completed_at: normalizeIsoDate(value.completed_at) || null,
        last_attempt_at: normalizeIsoDate(value.last_attempt_at) || null,
        attempt_count: normalizeNumber(value.attempt_count) || 0,
        last_error: normalizeText2(value.last_error)
      };
    }
    function cloneWalletSyncState(value) {
      return normalizeWalletSyncState(JSON.parse(JSON.stringify(value)));
    }
    function normalizeIsoDate(value) {
      const date = normalizeDate2(value);
      return date ? date.toISOString() : null;
    }
    function normalizeDate2(value) {
      if (!value) {
        return null;
      }
      const date = value instanceof Date ? value : new Date(value);
      return Number.isNaN(date.getTime()) ? null : date;
    }
    function normalizeText2(value) {
      if (value === void 0 || value === null) {
        return null;
      }
      const text = String(value).trim();
      return text || null;
    }
    function normalizeNumber(value) {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
    module2.exports = {
      DEFAULT_WALLET_SYNC_STATE,
      loadWalletSyncState,
      saveWalletSyncState,
      normalizeWalletSyncState
    };
  }
});

// src/clients/wallet_api_client.ts
var require_wallet_api_client = __commonJS({
  "src/clients/wallet_api_client.ts"(exports2, module2) {
    "use strict";
    var { URL } = require("node:url");
    var WALLET_BASE_URL = "https://rest.budgetbakers.com/wallet/v1/api";
    var DEFAULT_TIMEOUT_MS = 3e4;
    var DEFAULT_MAX_PAGES = 50;
    var WalletApiError = class extends Error {
      constructor(message, details = {}) {
        super(message);
        this.name = "WalletApiError";
        this.details = details;
        this.status = details.status || null;
        this.retryAfterSeconds = details.retryAfterSeconds || null;
        this.rateLimitRemaining = details.rateLimitRemaining || null;
        this.rateLimitLimit = details.rateLimitLimit || null;
      }
    };
    var WalletApiClient = class {
      constructor(token) {
        this.token = token;
        this.baseUrl = WALLET_BASE_URL;
      }
      async fetchAccounts() {
        return this._collect("accounts", "accounts");
      }
      async fetchCategories() {
        return this._collect("categories", "categories");
      }
      async fetchRecords(query = {}) {
        return this._collect("records", "records", query);
      }
      async findRecordsByNote({ accountId, noteMarker, paymentType = null, categoryId = null, startRecordDate = null, endRecordDate = null }) {
        const query = {
          accountId,
          note: `contains.${noteMarker}`,
          limit: 20
        };
        if (paymentType) {
          query.paymentType = paymentType;
        }
        if (categoryId) {
          query.categoryId = categoryId;
        }
        if (startRecordDate) {
          query.recordDate = `gte.${startRecordDate}`;
        }
        if (endRecordDate) {
          query.recordDate = query.recordDate ? [query.recordDate, `lt.${endRecordDate}`] : `lt.${endRecordDate}`;
        }
        const records = await this.fetchRecords(query);
        const normalizedMarker = normalizeText2(noteMarker);
        return Array.isArray(records) ? records.filter((record) => normalizeText2(record?.note).includes(normalizedMarker)) : [];
      }
      async createRecords(records, returnData = true) {
        const response = await this._request("POST", "/records", {
          query: { returnData: returnData ? "true" : "false" },
          body: Array.isArray(records) ? records : [records]
        });
        return response.data;
      }
      async deleteRecords(ids) {
        const recordIds = Array.isArray(ids) ? ids.map((value) => String(value).trim()).filter(Boolean) : [];
        if (recordIds.length === 0) {
          throw new WalletApiError("Wallet API deleteRecords requires at least one record id");
        }
        if (recordIds.length > 10) {
          throw new WalletApiError("Wallet API deleteRecords supports at most 10 record ids per request");
        }
        const response = await this._request("DELETE", "/records", {
          body: { ids: recordIds }
        });
        return response.data;
      }
      async _collect(resource, collectionKey, query = {}, maxPages = DEFAULT_MAX_PAGES) {
        const items = [];
        let offset = 0;
        const seenOffsets = /* @__PURE__ */ new Set();
        let pageCount = 0;
        while (true) {
          if (seenOffsets.has(offset) || pageCount >= maxPages) {
            break;
          }
          seenOffsets.add(offset);
          pageCount += 1;
          const payload = await this._request("GET", `/${resource}`, {
            query: {
              limit: 200,
              offset,
              agentHints: "true",
              ...query
            }
          });
          const pageItems = Array.isArray(payload.data?.[collectionKey]) ? payload.data[collectionKey] : [];
          items.push(...pageItems);
          const nextOffset = payload.data?.nextOffset;
          if (nextOffset === void 0 || nextOffset === null) {
            break;
          }
          offset = Number(nextOffset);
          if (!Number.isFinite(offset)) {
            break;
          }
        }
        return items;
      }
      async _request(method, resource, { query = {}, body = null } = {}) {
        const url = new URL(`${this.baseUrl}${resource}`);
        for (const [key, value] of Object.entries(query || {})) {
          if (value === void 0 || value === null || value === "") {
            continue;
          }
          if (Array.isArray(value)) {
            for (const item of value) {
              if (item !== void 0 && item !== null && item !== "") {
                url.searchParams.append(key, String(item));
              }
            }
            continue;
          }
          url.searchParams.set(key, String(value));
        }
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
        try {
          const response = await fetch(url, {
            method,
            headers: {
              Authorization: `Bearer ${this.token}`,
              Accept: "application/json",
              ...body ? { "Content-Type": "application/json" } : {}
            },
            body: body ? JSON.stringify(body) : void 0,
            signal: controller.signal
          });
          const text = await response.text();
          let data = null;
          if (text) {
            try {
              data = JSON.parse(text);
            } catch {
              data = text;
            }
          }
          if (!response.ok && response.status !== 207) {
            throw new WalletApiError(`Wallet API ${method} ${resource} failed with ${response.status}`, {
              status: response.status,
              body: data || text || null,
              retryAfterSeconds: parseRetryAfter(response.headers.get("retry-after")),
              rateLimitRemaining: toInt(response.headers.get("x-ratelimit-remaining")),
              rateLimitLimit: toInt(response.headers.get("x-ratelimit-limit"))
            });
          }
          return {
            status: response.status,
            data,
            headers: response.headers
          };
        } finally {
          clearTimeout(timeout);
        }
      }
    };
    function normalizeText2(value) {
      return String(value || "").trim().toLowerCase();
    }
    function parseRetryAfter(value) {
      if (!value) {
        return null;
      }
      const seconds = Number(value);
      if (Number.isFinite(seconds) && seconds >= 0) {
        return Math.round(seconds);
      }
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) {
        return null;
      }
      return Math.max(0, Math.round((date.getTime() - Date.now()) / 1e3));
    }
    function toInt(value) {
      if (value === null || value === void 0) {
        return null;
      }
      const parsed = Number(value);
      return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
    }
    module2.exports = {
      WALLET_BASE_URL,
      WalletApiClient,
      WalletApiError
    };
  }
});

// src/wallet/wallet_sync.ts
var require_wallet_sync = __commonJS({
  "src/wallet/wallet_sync.ts"(exports2, module2) {
    "use strict";
    var crypto2 = require("node:crypto");
    var { fetchUsdToPhpRate, saveCurrencyState, shouldRefreshCurrencyRate } = require_currency_conversion();
    var { loadWalletSyncState, saveWalletSyncState } = require_wallet_sync_state();
    var { WalletApiClient } = require_wallet_api_client();
    var DEFAULT_STATE_PATH = "/data/wallet-sync-state.json";
    var WALLET_CURRENCY = "PHP";
    var NOTE_PREFIX = "DAWALLET";
    var DEFAULT_BATCH_SIZE = 25;
    var WalletSync = class {
      constructor(config, logger) {
        this.config = config;
        this.logger = logger;
        this.statePath = DEFAULT_STATE_PATH;
        this.client = config.wallet_token ? new WalletApiClient(config.wallet_token) : null;
        this.referenceData = null;
      }
      isEnabled() {
        return Boolean(this.config.wallet_write_enabled && this.config.wallet_token);
      }
      async processSync({ payments, fundsHistorySnapshot, includeFundsHistory, currencyState, now = /* @__PURE__ */ new Date() }) {
        if (!this.isEnabled()) {
          return { enabled: false, changed: false };
        }
        if (!payments) {
          return { enabled: true, changed: false };
        }
        let state = loadWalletSyncState(this.statePath);
        if (isFutureIsoDate(state.wallet_api_retry_after_at, now)) {
          return { enabled: true, changed: false, reason: "wallet_backoff" };
        }
        try {
          const referenceData = await this._ensureReferenceData();
          if (!referenceData) {
            return { enabled: true, changed: false, reason: "wallet_reference_data_unavailable" };
          }
          const fx = await this._resolveSettlementRate(currencyState, now);
          if (!fx) {
            this.logger.warning("Wallet sync skipped because no USD/PHP rate is available");
            return { enabled: true, changed: false, reason: "fx_unavailable" };
          }
          let changed = false;
          if (includeFundsHistory) {
            const imported = await this._importNewIncomeEntries({
              state,
              referenceData,
              payments,
              fundsHistorySnapshot,
              fx,
              now
            });
            changed = changed || imported;
          }
          state.last_seen_available_amount_cents = normalizeCents2(payments.available_amount_cents, payments.available_amount);
          state.last_seen_available_amount = normalizeMoney(payments.available_amount);
          state.updated_at = now.toISOString();
          clearWalletApiBackoff(state);
          saveWalletSyncState(this.statePath, state);
          return { enabled: true, changed };
        } catch (error) {
          applyWalletApiBackoff(state, error, now);
          if (state) {
            state.updated_at = now.toISOString();
            saveWalletSyncState(this.statePath, state);
          }
          this.logger.warning(`Wallet sync skipped: ${error.message}`);
          return { enabled: true, changed: false, error: error.message };
        }
      }
      async _ensureReferenceData() {
        if (this.referenceData) {
          return this.referenceData;
        }
        const accounts = await this.client.fetchAccounts();
        const categories = await this.client.fetchCategories();
        const dataAnnotationAccount = resolveAccountByName(accounts, this.config.wallet_data_annotation_account_name);
        const gotymeAccount = resolveAccountByName(accounts, this.config.wallet_gotyme_account_name);
        const incomeCategory = resolveCategoryByName(categories, this.config.wallet_income_category_name);
        const feeCategory = resolveCategoryByName(categories, this.config.wallet_fee_category_name);
        if (!dataAnnotationAccount || !gotymeAccount || !incomeCategory || !feeCategory) {
          const missing = [];
          if (!dataAnnotationAccount) missing.push(`account:${this.config.wallet_data_annotation_account_name}`);
          if (!gotymeAccount) missing.push(`account:${this.config.wallet_gotyme_account_name}`);
          if (!incomeCategory) missing.push(`category:${this.config.wallet_income_category_name}`);
          if (!feeCategory) missing.push(`category:${this.config.wallet_fee_category_name}`);
          throw new Error(`Wallet reference data not resolved: ${missing.join(", ")}`);
        }
        const dataAnnotationCurrency = resolveAccountCurrencyCode(dataAnnotationAccount);
        const gotymeCurrency = resolveAccountCurrencyCode(gotymeAccount);
        if (dataAnnotationCurrency !== WALLET_CURRENCY) {
          throw new Error(`Wallet account '${dataAnnotationAccount.name}' must be PHP (found: ${dataAnnotationCurrency || "unknown"})`);
        }
        if (gotymeCurrency !== WALLET_CURRENCY) {
          throw new Error(`Wallet account '${gotymeAccount.name}' must be PHP (found: ${gotymeCurrency || "unknown"})`);
        }
        this.referenceData = {
          dataAnnotationAccount,
          gotymeAccount,
          incomeCategory,
          feeCategory
        };
        return this.referenceData;
      }
      async _resolveSettlementRate(currencyState, now) {
        let state = currencyState || {};
        if (!Number.isFinite(Number(state.usd_php_rate)) || shouldRefreshCurrencyRate(state, now)) {
          const fxRate = await fetchUsdToPhpRate();
          state.usd_php_rate = fxRate.rate;
          state.usd_php_rate_date = fxRate.date;
          state.usd_php_rate_fetched_at = fxRate.fetched_at;
          state.usd_php_rate_source = fxRate.source;
          saveCurrencyState("/data/currency-state.json", state);
        }
        const rate = Number(state.usd_php_rate);
        if (!Number.isFinite(rate) || rate <= 0) {
          return null;
        }
        return {
          referenceRate: rate,
          settlementRate: roundToSix(rate * normalizeNumber(this.config.wallet_settlement_adjustment, 0.99856)),
          feeRate: normalizeNumber(this.config.wallet_paypal_fee_rate, 0.01),
          feeMaxUsd: normalizeNumber(this.config.wallet_paypal_fee_max_usd, 10)
        };
      }
      async recordWithdrawalSubmission({ payments, currencyState, now = /* @__PURE__ */ new Date() }) {
        if (!this.isEnabled()) {
          return { enabled: false, changed: false };
        }
        if (!payments) {
          return { enabled: true, changed: false };
        }
        let state = loadWalletSyncState(this.statePath);
        if (isFutureIsoDate(state.wallet_api_retry_after_at, now)) {
          return { enabled: true, changed: false, reason: "wallet_backoff" };
        }
        try {
          const referenceData = await this._ensureReferenceData();
          if (!referenceData) {
            return { enabled: true, changed: false, reason: "wallet_reference_data_unavailable" };
          }
          const fx = await this._resolveSettlementRate(currencyState, now);
          if (!fx) {
            this.logger.warning("Wallet withdrawal skipped because no USD/PHP rate is available");
            return { enabled: true, changed: false, reason: "fx_unavailable" };
          }
          const result = await this._createConfirmedWithdrawal({
            state,
            referenceData,
            payments,
            fx,
            now
          });
          state.updated_at = now.toISOString();
          clearWalletApiBackoff(state);
          saveWalletSyncState(this.statePath, state);
          return { enabled: true, changed: result.changed };
        } catch (error) {
          applyWalletApiBackoff(state, error, now);
          if (state) {
            state.updated_at = now.toISOString();
            saveWalletSyncState(this.statePath, state);
          }
          this.logger.warning(`Wallet withdrawal skipped: ${error.message}`);
          return { enabled: true, changed: false, error: error.message };
        }
      }
      async _importNewIncomeEntries({ state, referenceData, fundsHistorySnapshot, fx, now }) {
        const entries = Array.isArray(fundsHistorySnapshot?.pending_payout_entries) ? fundsHistorySnapshot.pending_payout_entries : [];
        let changed = false;
        const seenFingerprintCounts = {};
        const pendingCreates = [];
        for (const entry of entries) {
          if (!entry || entry.status !== "pending") {
            continue;
          }
          const sourceFingerprint = normalizeText2(entry.fingerprint) || buildFallbackFingerprint(entry);
          if (!sourceFingerprint) {
            continue;
          }
          seenFingerprintCounts[sourceFingerprint] = (seenFingerprintCounts[sourceFingerprint] || 0) + 1;
          const marker = buildIncomeMarker(sourceFingerprint, seenFingerprintCounts[sourceFingerprint]);
          const existing = state.imported_funds_entries[marker] || null;
          if (existing?.record_id) {
            const existingRecord = await this._recoverExistingRecord({
              accountId: referenceData.dataAnnotationAccount.id,
              noteMarker: marker,
              paymentType: "web_payment",
              categoryId: referenceData.incomeCategory.id
            });
            if (existingRecord) {
              continue;
            }
            this.logger.warning(`Wallet income marker ${marker} was stored in sync state but no matching Wallet record was found; recreating it`);
            delete state.imported_funds_entries[marker];
            changed = true;
          }
          if (state.imported_funds_entries[marker]?.record_id) {
            continue;
          }
          const existingRecords = await this.client.findRecordsByNote({
            accountId: referenceData.dataAnnotationAccount.id,
            noteMarker: marker
          });
          if (existingRecords.length > 0) {
            state.imported_funds_entries[marker] = {
              key: marker,
              note_marker: marker,
              source_marker: sourceFingerprint,
              record_id: existingRecords[0].id || null,
              source_type: "income",
              source_fingerprint: sourceFingerprint,
              source_amount_usd_cents: normalizeCents2(entry.amount_cents, entry.amount),
              source_amount_php_cents: null,
              source_fee_usd_cents: null,
              source_fee_php_cents: null,
              source_net_usd_cents: null,
              source_net_php_cents: null,
              source_rate: fx.referenceRate,
              created_at: now.toISOString()
            };
            changed = true;
            continue;
          }
          const usdCents = normalizeCents2(entry.amount_cents, entry.amount);
          if (usdCents <= 0) {
            continue;
          }
          const phpCents = roundToCents(usdCents / 100 * fx.settlementRate * 100);
          const recordInput = buildIncomeRecord({
            accountId: referenceData.dataAnnotationAccount.id,
            categoryId: referenceData.incomeCategory.id,
            noteMarker: marker,
            sourceFingerprint,
            entry,
            usdCents,
            phpCents,
            fx,
            now
          });
          pendingCreates.push({
            marker,
            sourceFingerprint,
            usdCents,
            phpCents,
            recordInput
          });
        }
        for (let index = 0; index < pendingCreates.length; index += DEFAULT_BATCH_SIZE) {
          const batch = pendingCreates.slice(index, index + DEFAULT_BATCH_SIZE);
          const createdMap = await this._createIncomeRecordBatch(batch, referenceData, fx, now, state);
          changed = changed || createdMap.changed;
        }
        if (changed) {
          saveWalletSyncState(this.statePath, state);
        }
        return changed;
      }
      async _createIncomeRecordBatch(batch, referenceData, fx, now, state) {
        if (!Array.isArray(batch) || batch.length === 0) {
          return { changed: false };
        }
        try {
          const response = await this.client.createRecords(batch.map((item) => item.recordInput), true);
          const responseStatus = Number(response?.status || response?.statusCode || 0) || null;
          const results = Array.isArray(response?.results) ? response.results : Array.isArray(response) ? response : [];
          let changed = false;
          const failures = [];
          for (let index = 0; index < batch.length; index += 1) {
            const item = batch[index];
            const result = results[index] || results[0] || {};
            if (result.success === false) {
              const recovered = await this._recoverExistingRecord({
                accountId: referenceData.dataAnnotationAccount.id,
                noteMarker: item.marker,
                paymentType: "web_payment",
                categoryId: referenceData.incomeCategory.id
              });
              if (!recovered) {
                failures.push(`${item.marker}: ${result.error || "rejected"}`);
                continue;
              }
              state.imported_funds_entries[item.marker] = {
                key: item.marker,
                note_marker: item.marker,
                source_marker: item.sourceFingerprint,
                record_id: recovered.id || null,
                source_type: "income",
                source_fingerprint: item.sourceFingerprint,
                source_amount_usd_cents: item.usdCents,
                source_amount_php_cents: item.phpCents,
                source_fee_usd_cents: null,
                source_fee_php_cents: null,
                source_net_usd_cents: null,
                source_net_php_cents: null,
                source_rate: fx.referenceRate,
                created_at: now.toISOString()
              };
              changed = true;
              continue;
            }
            const recordId = result.id || result.record?.id || null;
            if (!recordId) {
              const recovered = await this._recoverExistingRecord({
                accountId: referenceData.dataAnnotationAccount.id,
                noteMarker: item.marker,
                paymentType: "web_payment",
                categoryId: referenceData.incomeCategory.id
              });
              if (recovered) {
                state.imported_funds_entries[item.marker] = {
                  key: item.marker,
                  note_marker: item.marker,
                  source_marker: item.sourceFingerprint,
                  record_id: recovered.id || null,
                  source_type: "income",
                  source_fingerprint: item.sourceFingerprint,
                  source_amount_usd_cents: item.usdCents,
                  source_amount_php_cents: item.phpCents,
                  source_fee_usd_cents: null,
                  source_fee_php_cents: null,
                  source_net_usd_cents: null,
                  source_net_php_cents: null,
                  source_rate: fx.referenceRate,
                  created_at: now.toISOString()
                };
                changed = true;
                continue;
              }
              failures.push(`${item.marker}: missing record id${responseStatus ? ` (status ${responseStatus})` : ""}`);
              continue;
            }
            state.imported_funds_entries[item.marker] = {
              key: item.marker,
              note_marker: item.marker,
              source_marker: item.sourceFingerprint,
              record_id: recordId,
              source_type: "income",
              source_fingerprint: item.sourceFingerprint,
              source_amount_usd_cents: item.usdCents,
              source_amount_php_cents: item.phpCents,
              source_fee_usd_cents: null,
              source_fee_php_cents: null,
              source_net_usd_cents: null,
              source_net_php_cents: null,
              source_rate: fx.referenceRate,
              created_at: now.toISOString()
            };
            changed = true;
          }
          if (failures.length > 0) {
            saveWalletSyncState(this.statePath, state);
            const error = new Error(`Wallet income batch incomplete: ${failures.join("; ")}`);
            error.partialBatch = true;
            throw error;
          }
          return { changed };
        } catch (error) {
          if (error?.partialBatch) {
            throw error;
          }
          this.logger.warning(`Wallet income batch create failed: ${error.message}`);
          let changed = false;
          for (const item of batch) {
            const created = await this._createLedgerRecord(item.recordInput, {
              accountId: referenceData.dataAnnotationAccount.id,
              noteMarker: item.marker,
              paymentType: "web_payment",
              categoryId: referenceData.incomeCategory.id
            });
            if (!created?.recordId) {
              continue;
            }
            state.imported_funds_entries[item.marker] = {
              key: item.marker,
              note_marker: item.marker,
              source_marker: item.sourceFingerprint,
              record_id: created.recordId,
              source_type: "income",
              source_fingerprint: item.sourceFingerprint,
              source_amount_usd_cents: item.usdCents,
              source_amount_php_cents: item.phpCents,
              source_fee_usd_cents: null,
              source_fee_php_cents: null,
              source_net_usd_cents: null,
              source_net_php_cents: null,
              source_rate: fx.referenceRate,
              created_at: now.toISOString()
            };
            changed = true;
          }
          return { changed };
        }
      }
      async _createConfirmedWithdrawal({ state, referenceData, payments, fx, now }) {
        const payoutAt = normalizeIsoDate(payments.last_payout_at) || now.toISOString();
        const grossUsdCents = positiveCents(payments.last_payout_amount_cents, payments.last_payout_amount);
        if (grossUsdCents <= 0) {
          return { changed: false };
        }
        const withdrawalMarker = buildWithdrawalMarker({
          payoutAt,
          grossUsdCents
        });
        const withdrawalState = state.withdrawal_events[withdrawalMarker] || normalizeWithdrawalState(withdrawalMarker);
        if (withdrawalState.fee_record_id && withdrawalState.transfer_record_id) {
          return { changed: false };
        }
        const feeUsdCents = calculatePaypalFeeCents(grossUsdCents, fx);
        const netUsdCents = Math.max(0, grossUsdCents - feeUsdCents);
        const grossPhpCents = roundToCents(grossUsdCents / 100 * fx.settlementRate * 100);
        const feePhpCents = roundToCents(feeUsdCents / 100 * fx.settlementRate * 100);
        const netPhpCents = Math.max(0, grossPhpCents - feePhpCents);
        const commonContext = {
          payoutAt,
          grossUsdCents,
          feeUsdCents,
          netUsdCents,
          grossPhpCents,
          feePhpCents,
          netPhpCents,
          fx,
          now,
          withdrawalMarker
        };
        const feeMarker = `${withdrawalMarker}:fee`;
        const transferMarker = `${withdrawalMarker}:transfer`;
        const feeRecord = await this._createWithdrawalFeeRecord({
          ...commonContext,
          marker: feeMarker,
          referenceData
        }, state, referenceData);
        if (feeRecord?.recordId) {
          withdrawalState.fee_record_id = feeRecord.recordId;
          withdrawalState.record_id = feeRecord.recordId;
          withdrawalState.last_attempt_at = now.toISOString();
          withdrawalState.attempt_count = (withdrawalState.attempt_count || 0) + 1;
          state.withdrawal_events[withdrawalMarker] = withdrawalState;
          saveWalletSyncState(this.statePath, state);
        }
        const transferRecord = await this._createWithdrawalTransferRecord({
          ...commonContext,
          marker: transferMarker,
          referenceData
        }, state, referenceData);
        if (transferRecord?.recordId) {
          withdrawalState.transfer_record_id = transferRecord.recordId;
          withdrawalState.mirror_record_id = transferRecord.recordId;
          withdrawalState.last_attempt_at = now.toISOString();
          withdrawalState.attempt_count = (withdrawalState.attempt_count || 0) + 1;
          state.withdrawal_events[withdrawalMarker] = withdrawalState;
          saveWalletSyncState(this.statePath, state);
        }
        if (withdrawalState.fee_record_id && withdrawalState.transfer_record_id) {
          state.withdrawal_events[withdrawalMarker] = {
            ...withdrawalState,
            key: withdrawalMarker,
            note_marker: withdrawalMarker,
            source_marker: withdrawalMarker,
            source_type: "withdrawal",
            source_amount_usd_cents: grossUsdCents,
            source_amount_php_cents: grossPhpCents,
            source_fee_usd_cents: feeUsdCents,
            source_fee_php_cents: feePhpCents,
            source_net_usd_cents: netUsdCents,
            source_net_php_cents: netPhpCents,
            source_rate: fx.referenceRate,
            created_at: withdrawalState.created_at || now.toISOString(),
            completed_at: now.toISOString()
          };
          state.last_seen_last_payout_at = payoutAt;
          state.first_sync_completed_at = state.first_sync_completed_at || now.toISOString();
          saveWalletSyncState(this.statePath, state);
          return { changed: true };
        }
        withdrawalState.key = withdrawalMarker;
        withdrawalState.note_marker = withdrawalMarker;
        withdrawalState.source_marker = withdrawalMarker;
        withdrawalState.source_type = "withdrawal";
        withdrawalState.source_amount_usd_cents = grossUsdCents;
        withdrawalState.source_amount_php_cents = grossPhpCents;
        withdrawalState.source_fee_usd_cents = feeUsdCents;
        withdrawalState.source_fee_php_cents = feePhpCents;
        withdrawalState.source_net_usd_cents = netUsdCents;
        withdrawalState.source_net_php_cents = netPhpCents;
        withdrawalState.source_rate = fx.referenceRate;
        withdrawalState.created_at = withdrawalState.created_at || now.toISOString();
        withdrawalState.last_attempt_at = now.toISOString();
        withdrawalState.attempt_count = (withdrawalState.attempt_count || 0) + 1;
        state.withdrawal_events[withdrawalMarker] = withdrawalState;
        saveWalletSyncState(this.statePath, state);
        return { changed: Boolean(feeRecord?.recordId || transferRecord?.recordId) };
      }
      async _processWithdrawalIfNeeded() {
        return false;
      }
      async _createWithdrawalFeeRecord(context, state, referenceData) {
        const existing = state.withdrawal_events[context.withdrawalMarker];
        if (existing?.fee_record_id) {
          return { recordId: existing.fee_record_id };
        }
        const existingRecords = await this.client.findRecordsByNote({
          accountId: referenceData.dataAnnotationAccount.id,
          noteMarker: context.marker,
          paymentType: "transfer",
          categoryId: referenceData.feeCategory.id
        });
        if (existingRecords.length > 0) {
          return { recordId: existingRecords[0].id || null };
        }
        const record = buildWithdrawalFeeRecord({
          accountId: referenceData.dataAnnotationAccount.id,
          categoryId: referenceData.feeCategory.id,
          marker: context.marker,
          ...context
        });
        return this._createLedgerRecord(record, {
          accountId: referenceData.dataAnnotationAccount.id,
          noteMarker: context.marker,
          paymentType: "transfer"
        });
      }
      async _createWithdrawalTransferRecord(context, state, referenceData) {
        const existing = state.withdrawal_events[context.withdrawalMarker];
        if (existing?.transfer_record_id) {
          return { recordId: existing.transfer_record_id };
        }
        const existingRecords = await this.client.findRecordsByNote({
          accountId: referenceData.dataAnnotationAccount.id,
          noteMarker: context.marker,
          paymentType: "transfer"
        });
        if (existingRecords.length > 0) {
          return { recordId: existingRecords[0].id || null };
        }
        const record = buildWithdrawalTransferRecord({
          accountId: referenceData.dataAnnotationAccount.id,
          targetAccountId: referenceData.gotymeAccount.id,
          marker: context.marker,
          ...context
        });
        return this._createLedgerRecord(record, {
          accountId: referenceData.dataAnnotationAccount.id,
          noteMarker: context.marker,
          paymentType: "transfer"
        });
      }
      async _createLedgerRecord(record, searchOptions) {
        const marker = searchOptions.noteMarker;
        try {
          const response = await this.client.createRecords([record], true);
          const responseStatus = Number(response?.status || response?.statusCode || 0) || null;
          const result = Array.isArray(response?.results) ? response.results[0] || {} : {};
          if (result.success === false) {
            const recovered = await this._recoverExistingRecord(searchOptions);
            if (recovered) {
              return { recordId: recovered.id || null, recovered: true };
            }
            throw new Error(`Wallet record rejected: ${result.error || "unknown error"}`);
          }
          const recordId = result.id || result.record?.id || null;
          if (!recordId) {
            const recovered = await this._recoverExistingRecord(searchOptions);
            if (recovered) {
              return { recordId: recovered.id || null, recovered: true };
            }
            throw new Error(`Wallet record create returned no id${responseStatus ? ` (status ${responseStatus})` : ""}`);
          }
          return {
            recordId,
            record: result.record || null
          };
        } catch (error) {
          const recovered = await this._recoverExistingRecord(searchOptions);
          if (recovered) {
            return { recordId: recovered.id || null, recovered: true };
          }
          this.logger.warning(`Wallet record create failed for ${marker}: ${error.message}`);
          return null;
        }
      }
      async _recoverExistingRecord({ accountId, noteMarker, paymentType = null, categoryId = null }) {
        const records = await this.client.findRecordsByNote({ accountId, noteMarker, paymentType, categoryId });
        return records.length > 0 ? records[0] : null;
      }
      async _processWithdrawalFeeRecord(context, state, referenceData) {
        return this._createWithdrawalFeeRecord(context, state, referenceData);
      }
    };
    function buildIncomeRecord({ accountId, categoryId, noteMarker, sourceFingerprint, entry, usdCents, phpCents, fx, now }) {
      const usdAmount = usdCents / 100;
      const phpAmount = phpCents / 100;
      const note = buildIncomeNote({
        noteMarker,
        sourceFingerprint,
        usdAmount,
        phpAmount,
        fx,
        entry
      });
      return {
        accountId,
        categoryId,
        amount: { value: phpAmount, currencyCode: WALLET_CURRENCY },
        recordDate: normalizeIsoDate(entry.first_seen_at) || now.toISOString(),
        paymentType: "web_payment",
        recordState: "cleared",
        note,
        counterParty: "Data Annotation"
      };
    }
    function buildWithdrawalFeeRecord({ accountId, categoryId, marker, payoutAt, grossUsdCents, feeUsdCents, grossPhpCents, feePhpCents, fx, now }) {
      return {
        accountId,
        categoryId,
        amount: { value: -(feePhpCents / 100), currencyCode: WALLET_CURRENCY },
        recordDate: payoutAt || now.toISOString(),
        paymentType: "transfer",
        recordState: "cleared",
        note: buildWithdrawalNote({
          marker,
          kind: "fee",
          grossUsdCents,
          feeUsdCents,
          grossPhpCents,
          phpCents: feePhpCents,
          netUsdCents: grossUsdCents - feeUsdCents,
          netPhpCents: grossPhpCents - feePhpCents,
          fx
        }),
        counterParty: "PayPal"
      };
    }
    function buildWithdrawalTransferRecord({ accountId, targetAccountId, marker, payoutAt, grossUsdCents, feeUsdCents, netUsdCents, grossPhpCents, feePhpCents, netPhpCents, fx, now }) {
      return {
        accountId,
        amount: { value: -(netPhpCents / 100), currencyCode: WALLET_CURRENCY },
        recordDate: payoutAt || now.toISOString(),
        paymentType: "transfer",
        recordState: "cleared",
        note: buildWithdrawalNote({
          marker,
          kind: "transfer",
          grossUsdCents,
          feeUsdCents,
          grossPhpCents,
          phpCents: netPhpCents,
          netUsdCents,
          netPhpCents,
          fx
        }),
        counterParty: "GoTyme",
        transfer: {
          pairingMode: "new",
          accountId: targetAccountId
        }
      };
    }
    function buildIncomeNote({ noteMarker, sourceFingerprint, usdAmount, phpAmount, fx, entry }) {
      const project = truncateText(String(entry?.project || "DataAnnotation"), 40);
      const amount = formatPhp(phpAmount);
      const rate = formatRate(fx.settlementRate);
      const value = [`${NOTE_PREFIX}|income|${noteMarker}`, `proj=${project}`, `usd=${formatUsd(usdAmount)}`, `php=${amount}`, `rate=${rate}`];
      if (sourceFingerprint) {
        value.push(`src=${truncateText(sourceFingerprint, 24)}`);
      }
      return truncateText(value.join(" "), 255);
    }
    function buildWithdrawalNote({ marker, kind, grossUsdCents, feeUsdCents, grossPhpCents, phpCents, netUsdCents, netPhpCents, fx }) {
      return truncateText(
        [
          `${NOTE_PREFIX}|withdrawal|${kind}|${marker}`,
          `gross=${formatUsd(grossUsdCents / 100)}`,
          `fee=${formatUsd(feeUsdCents / 100)}`,
          `net=${formatUsd(netUsdCents / 100)}`,
          `php=${formatPhp(phpCents)}`,
          `rate=${formatRate(fx.settlementRate)}`
        ].join(" "),
        255
      );
    }
    function buildWithdrawalMarker({ payoutAt, grossUsdCents }) {
      const raw = [payoutAt || "", String(grossUsdCents || 0)].join("|");
      return `${NOTE_PREFIX}|wd|${hashText(raw)}`;
    }
    function buildIncomeMarker(sourceFingerprint, occurrence = 1) {
      return `${NOTE_PREFIX}|inc|${hashText(sourceFingerprint)}#${Math.max(1, Math.trunc(Number(occurrence) || 1))}`;
    }
    function buildFallbackFingerprint(entry) {
      return [
        normalizeText2(entry?.entry_date),
        normalizeText2(entry?.project),
        normalizeText2(entry?.kind),
        normalizeText2(entry?.amount),
        normalizeText2(entry?.duration)
      ].join("|");
    }
    function normalizeWithdrawalState(withdrawalMarker) {
      return {
        key: withdrawalMarker,
        note_marker: withdrawalMarker,
        source_marker: withdrawalMarker,
        fee_record_id: null,
        transfer_record_id: null,
        record_id: null,
        mirror_record_id: null,
        source_type: "withdrawal",
        source_amount_usd_cents: null,
        source_amount_php_cents: null,
        source_fee_usd_cents: null,
        source_fee_php_cents: null,
        source_net_usd_cents: null,
        source_net_php_cents: null,
        source_rate: null,
        created_at: null,
        completed_at: null,
        last_attempt_at: null,
        attempt_count: 0,
        last_error: null
      };
    }
    function applyWalletApiBackoff(state, error, now) {
      if (!state || !error) {
        return;
      }
      const retryAfterSeconds = Number(error.retryAfterSeconds || error.details?.retryAfterSeconds);
      const failureCount = Math.max(1, (Number(state.wallet_api_failure_count) || 0) + 1);
      const baseDelayMs = Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0 ? retryAfterSeconds * 1e3 : Math.min(60 * 60 * 1e3, 15e3 * 2 ** Math.min(6, failureCount - 1));
      const backoffMs = Math.max(15e3, baseDelayMs);
      state.wallet_api_failure_count = failureCount;
      state.wallet_api_retry_after_at = new Date(now.getTime() + backoffMs).toISOString();
      state.wallet_api_last_error = truncateText(String(error.message || "wallet api error"), 255);
    }
    function clearWalletApiBackoff(state) {
      if (!state) {
        return;
      }
      state.wallet_api_failure_count = 0;
      state.wallet_api_retry_after_at = null;
      state.wallet_api_last_error = null;
    }
    function isFutureIsoDate(value, now = /* @__PURE__ */ new Date()) {
      const date = normalizeDate2(value);
      return Boolean(date && date > now);
    }
    function hashText(value) {
      return crypto2.createHash("sha1").update(String(value || "")).digest("hex").slice(0, 12);
    }
    function calculatePaypalFeeCents(grossUsdCents, fx) {
      const grossUsd = grossUsdCents / 100;
      const feeUsd = Math.min(grossUsd * fx.feeRate, fx.feeMaxUsd);
      return Math.min(grossUsdCents, roundToCents(feeUsd * 100));
    }
    function normalizeText2(value) {
      if (value === void 0 || value === null) {
        return "";
      }
      return String(value).trim();
    }
    function normalizeIsoDate(value) {
      const date = normalizeDate2(value);
      return date ? date.toISOString() : null;
    }
    function normalizeDate2(value) {
      if (!value) {
        return null;
      }
      const date = value instanceof Date ? value : new Date(value);
      return Number.isNaN(date.getTime()) ? null : date;
    }
    function normalizeCents2(centsValue, amountValue) {
      const cents = Number(centsValue);
      if (Number.isFinite(cents)) {
        return Math.round(cents);
      }
      const amount = Number(amountValue);
      if (Number.isFinite(amount)) {
        return Math.round(amount * 100);
      }
      return null;
    }
    function normalizeMoney(value) {
      const amount = Number(value);
      return Number.isFinite(amount) ? amount : null;
    }
    function positiveCents(centsValue, amountValue) {
      const cents = normalizeCents2(centsValue, amountValue);
      return Number.isFinite(cents) && cents > 0 ? cents : 0;
    }
    function normalizeNumber(value, fallback) {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : fallback;
    }
    function roundToCents(value) {
      return Math.round(Number(value) || 0);
    }
    function roundToSix(value) {
      return Math.round((Number(value) || 0) * 1e6) / 1e6;
    }
    function formatUsd(value) {
      return `$${new Intl.NumberFormat("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(Number(value) || 0)}`;
    }
    function formatPhp(value) {
      return `PHP ${new Intl.NumberFormat("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(Number(value) || 0)}`;
    }
    function formatRate(value) {
      return new Intl.NumberFormat("en-US", {
        minimumFractionDigits: 4,
        maximumFractionDigits: 6
      }).format(Number(value) || 0);
    }
    function truncateText(value, maxLength) {
      const text = String(value || "");
      if (text.length <= maxLength) {
        return text;
      }
      return text.slice(0, Math.max(0, maxLength - 1)).trimEnd() + "\u2026";
    }
    function resolveAccountByName(accounts, name) {
      const target = normalizeText2(name).toLowerCase();
      const matches = Array.isArray(accounts) ? accounts.filter((account) => normalizeText2(account?.name).toLowerCase() === target) : [];
      if (matches.length !== 1) {
        return null;
      }
      return matches[0];
    }
    function resolveCategoryByName(categories, name) {
      const target = normalizeText2(name).toLowerCase();
      const matches = Array.isArray(categories) ? categories.filter((category) => normalizeText2(category?.name).toLowerCase() === target && category?.archived !== true) : [];
      if (matches.length !== 1) {
        return null;
      }
      return matches[0];
    }
    function resolveAccountCurrencyCode(account) {
      const candidate = account?.currencyCode || account?.currency || account?.baseCurrency || account?.initialBalance?.currencyCode || account?.balance?.currencyCode || account?.currency?.code || account?.currency?.currencyCode || account?.currency?.isoCode || account?.currency?.currency_code || account?.currency?.shortCode || account?.currency?.name || account?.baseCurrency?.code || account?.baseCurrency?.currencyCode || account?.baseCurrency?.isoCode || account?.baseCurrency?.currency_code || account?.baseCurrency?.shortCode || account?.baseCurrency?.name;
      return normalizeText2(candidate).toUpperCase();
    }
    module2.exports = {
      WalletSync,
      buildIncomeMarker,
      buildWithdrawalMarker,
      calculatePaypalFeeCents,
      formatPhp,
      formatRate,
      formatUsd
    };
  }
});

// src/app/runtime_state.ts
var require_runtime_state = __commonJS({
  "src/app/runtime_state.ts"(exports2, module2) {
    "use strict";
    var RuntimeState = class {
      withdrawLocked = false;
      claimProjectsLocked = false;
      fastPollingEnabled = false;
      autoAcceptEnabled = false;
      currencyState = null;
      lastSuccessfulSyncAt = null;
      lastSuccessfulProjectCount = 0;
      lastSuccessfulTotalTaskCount = 0;
      lastSuccessfulProjects = null;
      lastSuccessfulPayments = null;
      persistedNextWithdrawalState = null;
      lastFundsHistorySnapshot = null;
      lastInProgressTask = null;
      lastAutoAcceptAttemptSignature = null;
      nextRunAt = Date.now();
      nextCurrencyRateRefreshAt = Date.now();
      nextFundsHistoryAt = Date.now();
      nextExpeditedFundsHistoryAt = null;
      hasCompletedInitialSync = false;
      constructor() {
      }
    };
    module2.exports = {
      RuntimeState
    };
  }
});

// src/app/dataannotation_app.ts
var require_dataannotation_app = __commonJS({
  "src/app/dataannotation_app.ts"(exports2, module2) {
    "use strict";
    var { DataAnnotationMqttBridge } = require_mqtt_bridge();
    var { DataAnnotationClient } = require_dataannotation_client();
    var { createLogger: createLogger2 } = (init_logger(), __toCommonJS(logger_exports));
    var { computeNextRunAt: computeNextRunAt2 } = (init_polling_schedule(), __toCommonJS(polling_schedule_exports));
    var { loadClaimProjectsLockState: loadClaimProjectsLockState2, saveClaimProjectsLockState: saveClaimProjectsLockState2 } = (init_claim_projects_state(), __toCommonJS(claim_projects_state_exports));
    var { loadAutoAcceptState: loadAutoAcceptState2, saveAutoAcceptState: saveAutoAcceptState3 } = (init_auto_accept_state(), __toCommonJS(auto_accept_state_exports));
    var {
      computeNextFxRateRefreshAt,
      fetchUsdToPhpRate,
      getDisplayCurrency: getDisplayCurrency2,
      loadCurrencyState,
      saveCurrencyState,
      shouldRefreshCurrencyRate
    } = require_currency_conversion();
    var { loadFastPollingState: loadFastPollingState2, saveFastPollingState: saveFastPollingState2 } = (init_fast_polling_state(), __toCommonJS(fast_polling_state_exports));
    var { loadNextWithdrawalState: loadNextWithdrawalState2, saveNextWithdrawalState: saveNextWithdrawalState2 } = (init_next_withdrawal_state(), __toCommonJS(next_withdrawal_state_exports));
    var { loadWithdrawLockState: loadWithdrawLockState2, saveWithdrawLockState: saveWithdrawLockState2 } = (init_withdraw_lock_state(), __toCommonJS(withdraw_lock_state_exports));
    var { shouldIncludeFundsHistory: shouldIncludeFundsHistory2 } = (init_sync_policy(), __toCommonJS(sync_policy_exports));
    var { doSync: doSync2, getActivePollCron: getActivePollCron2, republishCurrencyViews: republishCurrencyViews2 } = (init_sync(), __toCommonJS(sync_exports));
    var { handleClaimRequest: handleClaimRequest2, handleWithdrawRequest: handleWithdrawRequest2 } = (init_commands(), __toCommonJS(commands_exports));
    var { purgeRecorderEntities } = require_ha_notifications();
    var { WalletSync } = require_wallet_sync();
    var { RuntimeState } = require_runtime_state();
    var CURRENCY_HISTORY_ENTITY_IDS = [
      "sensor.data_annotation_available_funds",
      "sensor.data_annotation_total_earnings",
      "sensor.data_annotation_total_paid_out",
      "sensor.data_annotation_this_month",
      "sensor.data_annotation_best_month",
      "sensor.data_annotation_pending_approval"
    ];
    var WITHDRAW_LOCK_STATE_PATH = "/data/withdraw-lock-state.json";
    var CLAIM_PROJECTS_LOCK_STATE_PATH = "/data/claim-projects-lock-state.json";
    var FAST_POLLING_STATE_PATH = "/data/fast-polling-state.json";
    var AUTO_ACCEPT_STATE_PATH2 = "/data/auto-accept-state.json";
    var CURRENCY_STATE_PATH = "/data/currency-state.json";
    var NEXT_WITHDRAWAL_STATE_PATH = "/data/next-withdrawal-state.json";
    var DEFAULT_EXPEDITED_FUNDS_HISTORY_DELAY_MINUTES = 2;
    var DataAnnotationApp2 = class {
      config;
      version;
      running;
      state;
      logger;
      bridge;
      client;
      walletSync;
      constructor(options) {
        const config = options.config;
        const version2 = options.version;
        this.config = config;
        this.version = version2;
        this.running = false;
        this.state = new RuntimeState();
        this.logger = createLogger2(config.log_level);
        this.bridge = new DataAnnotationMqttBridge({
          host: config.mqtt_host,
          port: config.mqtt_port,
          username: config.mqtt_username || void 0,
          password: config.mqtt_password || void 0,
          topicPrefix: config.mqtt_topic_prefix,
          profileName: config.profile || "Data Annotation",
          version: version2,
          logger: this.logger
        });
        this.client = new DataAnnotationClient({
          email: config.email,
          password: config.password,
          profileDir: config.browser_profile_dir,
          logger: this.logger
        });
        this.walletSync = new WalletSync(config, this.logger);
      }
      async start() {
        this.running = true;
        this._loadPersistedState();
        await this._connectAndPublishStartupState();
        try {
          while (this.running) {
            await this._applyBridgeChanges();
            await this._refreshCurrencyRateIfDue();
            await this._syncIfDue();
            await sleep(1e3);
          }
        } finally {
          await this.stop();
        }
      }
      async stop() {
        this.running = false;
        await this.client.close().catch(() => {
        });
        await this.bridge.close().catch(() => {
        });
      }
      _loadPersistedState() {
        this.state.withdrawLocked = loadWithdrawLockState2(WITHDRAW_LOCK_STATE_PATH);
        this.state.claimProjectsLocked = loadClaimProjectsLockState2(CLAIM_PROJECTS_LOCK_STATE_PATH);
        this.state.fastPollingEnabled = loadFastPollingState2(FAST_POLLING_STATE_PATH);
        this.state.autoAcceptEnabled = loadAutoAcceptState2(AUTO_ACCEPT_STATE_PATH2);
        this.state.currencyState = loadCurrencyState(CURRENCY_STATE_PATH);
        this.state.persistedNextWithdrawalState = loadNextWithdrawalState2(NEXT_WITHDRAWAL_STATE_PATH);
      }
      async _connectAndPublishStartupState() {
        const { config, state, bridge } = this;
        await bridge.waitForConnection();
        bridge.publishOnline();
        bridge.publishDiscovery({ currencyUnit: getDisplayCurrency2(state.currencyState) });
        this._publishStaticState();
      }
      async _applyBridgeChanges() {
        const { bridge, logger, state } = this;
        if (bridge.withdrawLockChange.value !== null) {
          state.withdrawLocked = bridge.withdrawLockChange.value;
          bridge.withdrawLockChange.value = null;
          saveWithdrawLockState2(WITHDRAW_LOCK_STATE_PATH, state.withdrawLocked);
          bridge.publishWithdrawLockState(state.withdrawLocked);
          logger.info(`Withdraw lock state updated: ${state.withdrawLocked ? "locked" : "unlocked"}`);
        }
        if (bridge.claimProjectsLockChange.value !== null) {
          state.claimProjectsLocked = bridge.claimProjectsLockChange.value;
          bridge.claimProjectsLockChange.value = null;
          saveClaimProjectsLockState2(CLAIM_PROJECTS_LOCK_STATE_PATH, state.claimProjectsLocked);
          bridge.publishClaimProjectsLockState(state.claimProjectsLocked);
          logger.info(`Claim projects lock state updated: ${state.claimProjectsLocked ? "locked" : "unlocked"}`);
        }
        if (bridge.fastPollingChange.value !== null) {
          state.fastPollingEnabled = bridge.fastPollingChange.value;
          bridge.fastPollingChange.value = null;
          saveFastPollingState2(FAST_POLLING_STATE_PATH, state.fastPollingEnabled);
          bridge.publishFastPollingState(state.fastPollingEnabled);
          state.nextRunAt = Date.now();
          logger.info(`Fast polling state updated: ${state.fastPollingEnabled ? "enabled" : "disabled"}`);
        }
        if (bridge.autoAcceptChange.value !== null) {
          state.autoAcceptEnabled = bridge.autoAcceptChange.value;
          bridge.autoAcceptChange.value = null;
          saveAutoAcceptState3(AUTO_ACCEPT_STATE_PATH2, state.autoAcceptEnabled);
          bridge.publishAutoAcceptState(state.autoAcceptEnabled);
          if (state.autoAcceptEnabled) {
            state.lastAutoAcceptAttemptSignature = null;
          }
          logger.info(`Auto accept state updated: ${state.autoAcceptEnabled ? "enabled" : "disabled"}`);
        }
        if (bridge.currencyModeChange.value !== null) {
          state.currencyState.convert_to_php = bridge.currencyModeChange.value;
          bridge.currencyModeChange.value = null;
          saveCurrencyState(CURRENCY_STATE_PATH, state.currencyState);
          bridge.publishCurrencyModeState(state.currencyState.convert_to_php);
          bridge.publishDiscovery({ currencyUnit: getDisplayCurrency2(state.currencyState) });
          republishCurrencyViews2(bridge, state.lastSuccessfulProjects, state.lastSuccessfulPayments, state.currencyState, state.lastSuccessfulSyncAt);
          try {
            await purgeRecorderEntities({ entityIds: CURRENCY_HISTORY_ENTITY_IDS, keepDays: 0, logger });
          } catch (error) {
            logger.warning(`Failed to purge currency history after mode change: ${error.message}`);
          }
          logger.info(`Currency mode updated: ${state.currencyState.convert_to_php ? "PHP" : "USD"}`);
        }
        if (bridge.rebuildDiscoveryRequested.value) {
          bridge.rebuildDiscoveryRequested.value = false;
          bridge.rebuildDiscovery({ currencyUnit: getDisplayCurrency2(state.currencyState) });
          this._publishStaticState();
          logger.info("MQTT discovery rebuild completed");
        }
        if (bridge.claimRequested.value) {
          const claimRequest = bridge.claimRequested.value;
          bridge.claimRequested.value = null;
          await handleClaimRequest2(this.client, bridge, state.claimProjectsLocked, claimRequest, logger);
          bridge.scanRequested.value = true;
        }
        if (bridge.withdrawRequested.value) {
          bridge.withdrawRequested.value = false;
          await handleWithdrawRequest2(this.client, this.walletSync, bridge, state.withdrawLocked, state.currencyState, state.lastSuccessfulPayments, logger);
          bridge.scanRequested.value = true;
        }
      }
      async _refreshCurrencyRateIfDue() {
        const { bridge, logger, state } = this;
        const now = Date.now();
        if (!shouldRefreshCurrencyRate(state.currencyState, new Date(now)) || now < state.nextCurrencyRateRefreshAt) {
          return;
        }
        const rateRefreshStartedAt = Date.now();
        try {
          const fxRate = await fetchUsdToPhpRate();
          state.currencyState.usd_php_rate = fxRate.rate;
          state.currencyState.usd_php_rate_date = fxRate.date;
          state.currencyState.usd_php_rate_fetched_at = fxRate.fetched_at;
          state.currencyState.usd_php_rate_source = fxRate.source;
          saveCurrencyState(CURRENCY_STATE_PATH, state.currencyState);
          bridge.publishCurrencyRate(fxRate);
          logger.info(`Refreshed USD/PHP rate: ${fxRate.rate} (${fxRate.date || "unknown date"})`);
          if (state.currencyState.convert_to_php) {
            bridge.publishDiscovery({ currencyUnit: getDisplayCurrency2(state.currencyState) });
            republishCurrencyViews2(bridge, state.lastSuccessfulProjects, state.lastSuccessfulPayments, state.currencyState, state.lastSuccessfulSyncAt);
          }
          state.nextCurrencyRateRefreshAt = Date.parse(computeNextFxRateRefreshAt(new Date(now)));
        } catch (error) {
          logger.warning(`Failed to refresh USD/PHP rate: ${error.message}`);
          state.nextCurrencyRateRefreshAt = now + 60 * 60 * 1e3;
        } finally {
          logger.debug(`Currency rate refresh took ${Date.now() - rateRefreshStartedAt}ms`);
        }
      }
      async _syncIfDue() {
        const { bridge, config, logger, state } = this;
        const now = Date.now();
        if (!bridge.scanRequested.value && now < state.nextRunAt) {
          return;
        }
        const manualSyncRequested = bridge.scanRequested.value;
        const includeFundsHistory = shouldIncludeFundsHistory2({
          includePayments: true,
          manualSyncRequested,
          initialSyncCompleted: state.hasCompletedInitialSync,
          fastPollingEnabled: state.fastPollingEnabled,
          now,
          nextFundsHistoryAt: state.nextFundsHistoryAt,
          nextExpeditedFundsHistoryAt: state.nextExpeditedFundsHistoryAt
        });
        bridge.scanRequested.value = false;
        logger.debug(`Sync mode: manual=${manualSyncRequested}, payments=true, fundsHistory=${includeFundsHistory}, fastPolling=${state.fastPollingEnabled}`);
        const previousPayments = {
          ...state.persistedNextWithdrawalState || {},
          ...state.lastSuccessfulPayments || {}
        };
        const syncResult = await doSync2(
          this.client,
          bridge,
          config,
          state.lastSuccessfulSyncAt,
          state.lastSuccessfulProjectCount,
          state.lastSuccessfulTotalTaskCount,
          state.hasCompletedInitialSync,
          state.lastSuccessfulProjects,
          previousPayments,
          {
            enabled: state.autoAcceptEnabled,
            claimProjectsLocked: state.claimProjectsLocked,
            lastAttemptSignature: state.lastAutoAcceptAttemptSignature
          },
          state.currencyState,
          state.withdrawLocked,
          includeFundsHistory,
          state.lastFundsHistorySnapshot,
          logger
        );
        const currentInProgressTask = Boolean(syncResult.taskStatus?.in_progress_task);
        state.autoAcceptEnabled = syncResult.autoAcceptState.enabled;
        state.lastAutoAcceptAttemptSignature = syncResult.autoAcceptState.lastAttemptSignature;
        if (state.lastInProgressTask === true && currentInProgressTask === false) {
          const delayMinutes = Number(config.funds_history_after_task_delay_minutes ?? DEFAULT_EXPEDITED_FUNDS_HISTORY_DELAY_MINUTES);
          if (Number.isFinite(delayMinutes) && delayMinutes > 0) {
            const expeditedAt = Date.now() + delayMinutes * 60 * 1e3;
            state.nextExpeditedFundsHistoryAt = Number.isFinite(state.nextExpeditedFundsHistoryAt) ? Math.min(state.nextExpeditedFundsHistoryAt, expeditedAt) : expeditedAt;
            state.nextRunAt = Math.min(state.nextRunAt, expeditedAt);
            logger.info(`Scheduled expedited Funds History sync in ${delayMinutes} minute${delayMinutes === 1 ? "" : "s"} after task completion`);
          }
        }
        state.lastInProgressTask = currentInProgressTask;
        state.lastSuccessfulSyncAt = syncResult.lastSuccessfulSyncAt;
        state.lastSuccessfulProjectCount = syncResult.lastSuccessfulProjectCount;
        state.lastSuccessfulTotalTaskCount = syncResult.lastSuccessfulTotalTaskCount;
        state.lastSuccessfulProjects = syncResult.projects || state.lastSuccessfulProjects;
        state.lastSuccessfulPayments = syncResult.payments || state.lastSuccessfulPayments;
        if (syncResult.payments) {
          try {
            saveNextWithdrawalState2(NEXT_WITHDRAWAL_STATE_PATH, syncResult.payments);
          } catch (error) {
            logger.warning(`Failed to persist next withdrawal state: ${error.message}`);
          }
        }
        await this.walletSync.processSync({
          payments: syncResult.payments,
          fundsHistorySnapshot: syncResult.fundsHistorySnapshot,
          includeFundsHistory: syncResult.includeFundsHistory,
          currencyState: state.currencyState,
          now: new Date(now)
        });
        if (syncResult.fundsHistorySnapshot) {
          state.lastFundsHistorySnapshot = syncResult.fundsHistorySnapshot;
        }
        if (syncResult.includeFundsHistory) {
          state.nextFundsHistoryAt = Date.parse(computeNextRunAt2(config.funds_history_cron, new Date(now)));
          if (Number.isFinite(state.nextExpeditedFundsHistoryAt) && Date.now() >= state.nextExpeditedFundsHistoryAt) {
            state.nextExpeditedFundsHistoryAt = null;
          }
        }
        state.hasCompletedInitialSync = true;
        state.nextRunAt = Date.parse(computeNextRunAt2(getActivePollCron2(config, state.fastPollingEnabled), /* @__PURE__ */ new Date()));
        if (Number.isFinite(state.nextExpeditedFundsHistoryAt)) {
          state.nextRunAt = Math.min(state.nextRunAt, state.nextExpeditedFundsHistoryAt);
        }
      }
      _publishStaticState() {
        const { config, state, bridge } = this;
        bridge.publishProfile(config.profile || "Data Annotation");
        bridge.publishWithdrawLockState(state.withdrawLocked);
        bridge.publishClaimProjectsLockState(state.claimProjectsLocked);
        bridge.publishFastPollingState(state.fastPollingEnabled);
        bridge.publishAutoAcceptState(state.autoAcceptEnabled);
        bridge.publishCurrencyModeState(state.currencyState.convert_to_php);
        if (Number.isFinite(state.currencyState.usd_php_rate)) {
          bridge.publishCurrencyRate({
            base: "USD",
            quote: "PHP",
            rate: state.currencyState.usd_php_rate,
            date: state.currencyState.usd_php_rate_date,
            source: state.currencyState.usd_php_rate_source || "frankfurter",
            fetched_at: state.currencyState.usd_php_rate_fetched_at
          });
        }
      }
    };
    function sleep(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    }
    module2.exports = {
      DataAnnotationApp: DataAnnotationApp2
    };
  }
});

// package.json
var require_package = __commonJS({
  "package.json"(exports2, module2) {
    module2.exports = {
      name: "dataannotation-projects-ha-addon",
      version: "0.7.3",
      private: true,
      description: "Home Assistant add-on that scrapes DataAnnotation worker projects and publishes them via MQTT auto-discovery.",
      main: "dist/main.js",
      type: "commonjs",
      license: "MIT",
      scripts: {
        build: "esbuild src/main.ts --bundle --platform=node --target=node20 --format=cjs --packages=external --outfile=dist/main.js",
        start: "node dist/main.js",
        test: "node -r tsx/cjs --test test/unit/*.test.ts test/unit/*/*.test.ts",
        "test:integration:fixture": "node -r tsx/cjs --test test/integration/projects.fixture.test.ts",
        "test:integration:live": "node -r tsx/cjs --test test/integration/live.test.ts",
        "test:wallet:live": "node -r tsx/cjs --test test/live/wallet_live_write.test.ts",
        "test:integration": "node -r tsx/cjs --test test/integration/*.test.ts",
        typecheck: "tsc -p tsconfig.json --noEmit"
      },
      dependencies: {
        mqtt: "^5.10.3",
        "puppeteer-core": "^24.18.0"
      },
      devDependencies: {
        "@types/node": "^26.0.1",
        esbuild: "^0.28.1",
        tsx: "^4.23.0",
        typescript: "^5.9.3"
      }
    };
  }
});

// src/main.ts
var { readConfig: readConfig2, configureLogging: configureLogging2 } = (init_config(), __toCommonJS(config_exports));
var { DataAnnotationApp } = require_dataannotation_app();
var { version } = require_package();
var currentApp = null;
process.on("SIGINT", () => {
  if (currentApp) {
    currentApp.stop().catch(() => {
    });
  }
});
process.on("SIGTERM", () => {
  if (currentApp) {
    currentApp.stop().catch(() => {
    });
  }
});
async function main() {
  const config = await readConfig2();
  configureLogging2(config.log_level);
  currentApp = new DataAnnotationApp({ config, version });
  await currentApp.start();
}
main().catch((error) => {
  console.error(error);
  process.exit(1);
});
