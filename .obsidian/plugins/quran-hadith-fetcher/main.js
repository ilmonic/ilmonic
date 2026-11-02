"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
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
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => QuranHadithFetcherPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian6 = require("obsidian");

// src/core/http.ts
var import_obsidian = require("obsidian");

// src/core/errors.ts
var AppError = class extends Error {
  constructor(userMessage, kind, status, options) {
    super(userMessage, options);
    this.userMessage = userMessage;
    this.kind = kind;
    this.status = status;
    this.name = "AppError";
  }
};
function errorToNotice(error) {
  return error instanceof AppError ? `ERROR: ${error.userMessage}` : `ERROR: ${error instanceof Error ? error.message : "Unknown error."}`;
}

// src/core/http.ts
var DEFAULT_POLICY = { key: "default", minIntervalMs: 0, maxAttempts: 4 };
var PROVIDER_POLICIES = [
  { match: /^https?:\/\/api\.alquran\.cloud(?:\/|$)/iu, policy: { key: "alquran-cloud", minIntervalMs: 120, maxAttempts: 4 } }
];
function policyForUrl(url) {
  return PROVIDER_POLICIES.find((item) => item.match.test(url))?.policy ?? DEFAULT_POLICY;
}
function normalizeHeaders(headers) {
  if (!headers) return {};
  return Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
}
function headerValue(headers, name) {
  return headers[name.toLowerCase()];
}
function retryAfterMs(headers) {
  const value = headerValue(headers, "retry-after");
  if (!value) return void 0;
  const seconds = Number(value.trim());
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(3e5, Math.round(seconds * 1e3));
  const date = Date.parse(value);
  if (!Number.isNaN(date)) return Math.min(3e5, Math.max(0, date - Date.now()));
  return void 0;
}
function isRetryableStatus(status) {
  return status === 408 || status === 425 || status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}
function backoffMs(attempt) {
  return Math.min(8e3, 500 * 2 ** attempt);
}
function sleep(ms, signal) {
  if (ms <= 0) return Promise.resolve();
  if (signal.aborted) return Promise.reject(new AppError("Operation cancelled.", "cancelled"));
  return new Promise((resolve, reject) => {
    let settled = false;
    const done = (fn) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      fn();
    };
    const timer = window.setTimeout(() => done(resolve), ms);
    const onAbort = () => {
      window.clearTimeout(timer);
      done(() => reject(new AppError("Operation cancelled.", "cancelled")));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}
var RequestScheduler = class {
  constructor() {
    __publicField(this, "tails", /* @__PURE__ */ new Map());
    __publicField(this, "lastStart", /* @__PURE__ */ new Map());
  }
  async run(policy, signal, task) {
    if (policy.minIntervalMs <= 0) return task();
    const previous = this.tails.get(policy.key) ?? Promise.resolve();
    let resolveTail;
    const currentTail = new Promise((resolve) => {
      resolveTail = resolve;
    });
    this.tails.set(policy.key, currentTail);
    await previous.catch(() => void 0);
    try {
      const elapsed = Date.now() - (this.lastStart.get(policy.key) ?? 0);
      if (elapsed < policy.minIntervalMs) await sleep(policy.minIntervalMs - elapsed, signal);
      if (signal.aborted) throw new AppError("Operation cancelled.", "cancelled");
      this.lastStart.set(policy.key, Date.now());
      return await task();
    } finally {
      resolveTail?.();
      if (this.tails.get(policy.key) === currentTail) this.tails.delete(policy.key);
    }
  }
};
var ObsidianHttpClient = class {
  constructor() {
    __publicField(this, "scheduler", new RequestScheduler());
  }
  async getText(url, signal) {
    if (signal.aborted) throw new AppError("Operation cancelled.", "cancelled");
    const policy = policyForUrl(url);
    return this.scheduler.run(policy, signal, () => this.requestWithRetry(url, signal, policy));
  }
  async requestWithRetry(url, signal, policy) {
    let lastNetworkError;
    for (let attempt = 0; attempt < policy.maxAttempts; attempt++) {
      if (signal.aborted) throw new AppError("Operation cancelled.", "cancelled");
      try {
        const params = { url, method: "GET", throw: false };
        const response = await (0, import_obsidian.requestUrl)(params);
        const headers = normalizeHeaders(response.headers);
        if (response.status >= 200 && response.status < 400) {
          if (signal.aborted) throw new AppError("Operation cancelled.", "cancelled");
          return { status: response.status, text: response.text, headers };
        }
        if (!isRetryableStatus(response.status) || attempt >= policy.maxAttempts - 1) {
          throw new AppError(response.status === 429 ? "Rate limited by provider." : `HTTP Code ${response.status}`, "http", response.status);
        }
        const delay = retryAfterMs(headers) ?? backoffMs(attempt);
        await sleep(delay, signal);
      } catch (error) {
        if (error instanceof AppError) {
          if (error.kind === "cancelled") throw error;
          if (error.kind === "http" && !isRetryableStatus(error.status ?? 0)) throw error;
          if (error.kind === "http" && attempt >= policy.maxAttempts - 1) throw error;
          if (error.kind === "http") continue;
        }
        lastNetworkError = error;
        if (attempt >= policy.maxAttempts - 1) {
          throw new AppError("Provider could not be reached.", "network", void 0, { cause: error });
        }
        await sleep(backoffMs(attempt), signal);
      }
    }
    throw new AppError("Provider could not be reached.", "network", void 0, { cause: lastNetworkError });
  }
  async getJson(url, signal) {
    const raw = await this.getText(url, signal);
    try {
      return { status: raw.status, json: JSON.parse(raw.text), headers: raw.headers };
    } catch (e) {
      throw new AppError("Malformed JSON response.", "parse", raw.status, { cause: e });
    }
  }
};

// src/core/operation.ts
var OperationManager = class {
  constructor() {
    __publicField(this, "currentId", 0);
    __publicField(this, "current");
  }
  begin() {
    this.current?.abort();
    this.current = new AbortController();
    this.currentId += 1;
    return { id: this.currentId, signal: this.current.signal };
  }
  isCurrent(id) {
    return id === this.currentId && !this.current?.signal.aborted;
  }
  cancel() {
    this.current?.abort();
    this.currentId += 1;
  }
};

// src/core/names.ts
var ARABIC_ARTICLE_PREFIXES = /\b(?:al|as|an|ar|at|ad|az|ash|ath|adh)-/giu;
function formatScholarName(value) {
  return value.replace(/\bb\.\s+/giu, "Ibn ").replace(ARABIC_ARTICLE_PREFIXES, (match) => match.charAt(0).toUpperCase() + match.slice(1));
}

// src/core/formatting.ts
var DEFAULT_FORMATTING = {
  entirePrefix: "",
  entireSuffix: "",
  linePrefix: "> ",
  lineSuffix: "",
  arabicOpen: "{",
  arabicClose: "}",
  englishOpen: "{",
  englishClose: "}",
  hadithOpen: "",
  hadithClose: "",
  callout: "quote",
  customCalloutType: "",
  showLink: true,
  ayahNumberOpen: "\u27EA",
  ayahNumberClose: "\u27EB",
  arabicAyahNumbers: true,
  quranAyahOpen: "{",
  quranAyahClose: "}",
  quranAyahStyle: "curly",
  codeSyntaxMode: "replace"
};
function wrapLine(text2, prefix, suffix) {
  return `${prefix}${text2}${suffix}`;
}
function prefixCallout(cfg) {
  if (cfg.callout === "none") return "";
  const type = cfg.callout === "custom" ? cfg.customCalloutType.trim() : cfg.callout;
  return type ? `> [!${type.charAt(0).toUpperCase()}${type.slice(1)}] ` : "";
}
function contentLinePrefix(cfg) {
  return prefixCallout(cfg) ? cfg.linePrefix : "";
}
function separatorLine(cfg) {
  return prefixCallout(cfg) ? ">" : "";
}
function gradeDisplay(grade) {
  return `${grade.text}${grade.author ? ` (${formatScholarName(grade.author)})` : ""}`;
}
var ARABIC_DIGITS = ["\u0660", "\u0661", "\u0662", "\u0663", "\u0664", "\u0665", "\u0666", "\u0667", "\u0668", "\u0669"];
function formatAyahDigits(number, arabic) {
  const value = String(number);
  return arabic ? value.replace(/\d/g, (digit) => ARABIC_DIGITS[Number(digit)]) : value;
}
function formatAyahNumber(number, cfg, arabic) {
  return `${cfg.ayahNumberOpen}${formatAyahDigits(number, arabic)}${cfg.ayahNumberClose}`;
}
function decodeHtmlEntities(value) {
  return value.replace(/&#39;|&#x27;|&apos;/gi, "'").replace(/&quot;|&#x22;/gi, '"').replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}
function quranTranslationText(ayah, showFootnotes, renumbered) {
  const text2 = ayah.translation?.text ?? "";
  if (!showFootnotes) {
    if (!ayah.footnotes?.length) return text2;
    const numbers = new Set(ayah.footnotes.map((footnote) => footnote.number));
    return text2.replace(/\[(\d+)\]/g, (match, n) => numbers.has(Number(n)) ? "" : match).replace(/\s{2,}/g, " ").trim();
  }
  if (!renumbered || renumbered.size === 0) return text2;
  return text2.replace(/\[(\d+)\]/g, (match, n) => {
    const replacement = renumbered.get(Number(n));
    return replacement === void 0 ? match : `[${replacement}]`;
  });
}
function prepareQuranFootnotes(result) {
  const byAyah = /* @__PURE__ */ new Map();
  const footnotes = [];
  const renumber = result.reference.startAyah !== result.reference.endAyah;
  let next = 1;
  for (const ayah of result.ayahs) {
    if (!ayah.footnotes?.length) continue;
    const map = /* @__PURE__ */ new Map();
    for (const footnote of ayah.footnotes) {
      const number = renumber ? next++ : footnote.number;
      map.set(footnote.number, number);
      footnotes.push({ ...footnote, number });
    }
    byAyah.set(ayah.reference.startAyah, map);
  }
  return { byAyah, footnotes };
}
function quranBlockText(result, cfg, options) {
  const mode = options.quranRangeMode ?? "line-by-line";
  const ayahs = result.ayahs;
  const arabic = ayahs.filter((a) => options.arabic && a.arabic);
  const english = ayahs.filter((a) => options.english && a.translation);
  const footnoteOutput = options.quranFootnotes ? prepareQuranFootnotes(result) : { byAyah: /* @__PURE__ */ new Map(), footnotes: [] };
  const lines = [];
  const linePrefix = contentLinePrefix(cfg);
  const separator = separatorLine(cfg);
  if (result.reference.startAyah !== result.reference.endAyah && mode === "merged") {
    if (arabic.length) {
      const text2 = arabic.map((a) => `${formatAyahNumber(a.reference.startAyah, cfg, cfg.arabicAyahNumbers)} ${a.arabic}`).join(" ");
      lines.push(wrapLine(`${cfg.quranAyahOpen}${text2}${cfg.quranAyahClose}`, linePrefix, cfg.lineSuffix));
    }
    if (english.length) {
      if (arabic.length) lines.push(separator);
      const text2 = english.map((a) => `${formatAyahNumber(a.reference.startAyah, cfg, false)} ${quranTranslationText(a, Boolean(options.quranFootnotes), footnoteOutput.byAyah.get(a.reference.startAyah))}`).join(" ");
      lines.push(wrapLine(`${cfg.quranAyahOpen}${text2}${cfg.quranAyahClose}`, linePrefix, cfg.lineSuffix));
    }
  } else if (result.reference.startAyah !== result.reference.endAyah && mode === "alternate") {
    const byNumber = new Map(ayahs.map((ayah) => [ayah.reference.startAyah, ayah]));
    const last = result.reference.endAyah;
    for (let number = result.reference.startAyah; number <= last; number++) {
      const ayah = byNumber.get(number);
      if (!ayah) continue;
      if (options.arabic && ayah.arabic) {
        lines.push(wrapLine(`${formatAyahDigits(number, cfg.arabicAyahNumbers)}: ${cfg.quranAyahOpen}${ayah.arabic}${cfg.quranAyahClose}`, linePrefix, cfg.lineSuffix));
        if (options.english && ayah.translation) lines.push(separator);
      }
      if (options.english && ayah.translation) {
        lines.push(wrapLine(`${number}: ${cfg.quranAyahOpen}${quranTranslationText(ayah, Boolean(options.quranFootnotes), footnoteOutput.byAyah.get(ayah.reference.startAyah))}${cfg.quranAyahClose}`, linePrefix, cfg.lineSuffix));
      }
      if (number < last && (options.arabic || options.english)) {
        lines.push(separator);
        lines.push(separator);
      }
    }
  } else if (result.reference.startAyah !== result.reference.endAyah && mode === "numbered") {
    const byNumber = new Map(ayahs.map((ayah) => [ayah.reference.startAyah, ayah]));
    const last = result.reference.endAyah;
    for (let number = result.reference.startAyah; number <= last; number++) {
      const ayah = byNumber.get(number);
      if (!ayah) continue;
      if (options.arabic && ayah.arabic) lines.push(wrapLine(`${formatAyahDigits(number, cfg.arabicAyahNumbers)}: ${cfg.quranAyahOpen}${ayah.arabic}${cfg.quranAyahClose}`, linePrefix, cfg.lineSuffix));
      if (options.arabic && options.english && ayah.arabic && ayah.translation) lines.push(separator);
      if (options.english && ayah.translation) lines.push(wrapLine(`${number}: ${cfg.quranAyahOpen}${quranTranslationText(ayah, Boolean(options.quranFootnotes), footnoteOutput.byAyah.get(ayah.reference.startAyah))}${cfg.quranAyahClose}`, linePrefix, cfg.lineSuffix));
      if (number < last && (options.arabic || options.english)) lines.push(separator);
    }
  } else {
    for (const ayah of ayahs) if (options.arabic && ayah.arabic) lines.push(wrapLine(`${cfg.quranAyahOpen}${ayah.arabic}${cfg.quranAyahClose}`, linePrefix, cfg.lineSuffix));
    if (options.arabic && options.english && arabic.length && english.length) lines.push(separator);
    for (const ayah of ayahs) if (options.english && ayah.translation) lines.push(wrapLine(`${cfg.quranAyahOpen}${quranTranslationText(ayah, Boolean(options.quranFootnotes), footnoteOutput.byAyah.get(ayah.reference.startAyah))}${cfg.quranAyahClose}`, linePrefix, cfg.lineSuffix));
  }
  if (options.quranFootnotes && footnoteOutput.footnotes.length && options.english) {
    if (cfg.callout === "none") {
      lines.push("");
      lines.push("Footnotes:");
      for (const footnote of footnoteOutput.footnotes) lines.push(`- [${footnote.number}]: ${footnote.text}`);
    } else {
      lines.push(separator);
      lines.push(">> [!Note] Footnotes");
      for (const footnote of footnoteOutput.footnotes) lines.push(`>> - [${footnote.number}]: ${footnote.text}`);
    }
  }
  return lines;
}
function formatQuran(result, cfg, options) {
  const target = `${result.reference.surah}:${result.reference.startAyah}`;
  const label = result.reference.startAyah === result.reference.endAyah ? target : `${result.reference.surah}:${result.reference.startAyah}-${result.reference.endAyah}`;
  const rawSurahName = result.surahName.trim();
  const surahName = `${/^(?:surah|sūrah)\b/iu.test(rawSurahName) ? "" : "Surah "}${rawSurahName}`.replace(
    /^(Surah\s+)(al(?:-.*)?)$/iu,
    (_, prefix, rest) => `${prefix}${rest.charAt(0).toUpperCase()}${rest.slice(1)}`
  );
  const link = cfg.showLink ? `[${surahName}, ${label}](${result.source.sourceUrl})` : `${surahName}, ${label}`;
  const lines = quranBlockText(result, cfg, options);
  return `${cfg.entirePrefix}${prefixCallout(cfg)}${link}${lines.length ? `
${lines.join("\n")}
` : "\n"}${cfg.entireSuffix}`.trimEnd();
}
function formatHadith(result, cfg, options) {
  const collectionName = decodeHtmlEntities(result.collectionName);
  const link = cfg.showLink ? `[${collectionName} ${result.reference.hadithNumber}](${result.source.sourceUrl})` : `${collectionName} ${result.reference.hadithNumber}`;
  const lines = [];
  const linePrefix = contentLinePrefix(cfg);
  const separator = separatorLine(cfg);
  const separateIsnad = options.hadithSeparateIsnad !== false;
  const arabicText = result.arabic ?? "(Arabic: Not found)";
  const englishText = result.english ?? "(English: Not found)";
  const pushWrapped = (text2) => lines.push(wrapLine(text2, linePrefix, cfg.lineSuffix));
  if (options.arabic) {
    if (separateIsnad) {
      if (result.arabicIsnad) pushWrapped(result.arabicIsnad);
      pushWrapped(arabicText);
    } else pushWrapped(result.arabicIsnad ? `${result.arabicIsnad} ${arabicText}` : arabicText);
  }
  if (options.english) {
    if (options.arabic) lines.push(separator);
    if (separateIsnad) {
      if (result.englishIsnad) pushWrapped(result.englishIsnad);
      pushWrapped(englishText);
    } else pushWrapped(result.englishIsnad ? `${result.englishIsnad} ${englishText}` : englishText);
  }
  if (options.grading) {
    if (lines.length) lines.push(separator);
    if (!result.grades.length) pushWrapped("Grading: Not found");
    else if (result.grades.length === 1) pushWrapped(`Grading: ${gradeDisplay(result.grades[0])}`);
    else {
      pushWrapped("- Grading:");
      for (const grade of result.grades) lines.push(`${linePrefix}  - ${gradeDisplay(grade)}${cfg.lineSuffix}`);
    }
  }
  return `${cfg.entirePrefix}${prefixCallout(cfg)}${link}${lines.length ? `
${lines.join("\n")}
` : "\n"}${cfg.entireSuffix}`.trimEnd();
}
function formatHadithRange(results, cfg, options) {
  return results.map((result) => formatHadith(result, cfg, options)).join("\n\n");
}

// src/core/normalization.ts
var ARABIC_MARKS = /[\u064B-\u065F\u0670\u06D6-\u06ED\u08D4-\u08FF]/g;
var ARABIC_CANONICAL_MAP = { "\u0671": "\u0627", "\u0623": "\u0627", "\u0625": "\u0627", "\u0622": "\u0627" };
function normalizeArabicToken(token) {
  return token.normalize("NFKC").replace(ARABIC_MARKS, "").replace(/[ـ]/g, "").split("").map((c) => ARABIC_CANONICAL_MAP[c] ?? c).join("").replace(/^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu, "");
}
var ARABIC_PHRASES = [
  ["\u0635\u0644\u0649", "\u0627\u0644\u0644\u0647", "\u0639\u0644\u064A\u0647", "\u0648\u0633\u0644\u0645"],
  ["\u0635\u0644\u0649", "\u0627\u0644\u0644\u0647", "\u0639\u0644\u064A\u0647", "\u0648", "\u0633\u0644\u0645"]
];
function protectExistingBlessings(text2) {
  const tokens = [];
  const protectedText = text2.replace(/\(\s*ﷺ\s*\)|ﷺ/gu, (match) => {
    const token = `QHFBLESSINGTOKEN${tokens.length}X`;
    tokens.push(match);
    return token;
  });
  return { text: protectedText, tokens };
}
function restoreBlessings(text2, tokens) {
  return text2.replace(/QHFBLESSINGTOKEN(\d+)X/gu, (_, index) => tokens[Number(index)] ?? "\uFDFA");
}
function normalizeArabicBlessingCore(text2, restoreExisting = true, protectExisting = true) {
  const protectedValue = protectExisting ? protectExistingBlessings(text2) : { text: text2, tokens: [] };
  const normalizedText = protectedValue.text.normalize("NFKC");
  const tokens = [...normalizedText.matchAll(/\S+/gu)].map((m) => {
    const raw = m[0];
    let leftTrim = 0;
    let rightTrim = raw.length;
    while (leftTrim < rightTrim && /[\p{P}\p{S}]/u.test(raw[leftTrim])) leftTrim++;
    while (rightTrim > leftTrim && /[\p{P}\p{S}]/u.test(raw[rightTrim - 1])) rightTrim--;
    return {
      raw,
      start: (m.index ?? 0) + leftTrim,
      end: (m.index ?? 0) + rightTrim,
      core: raw.slice(leftTrim, rightTrim)
    };
  });
  const normalized = tokens.map((t) => normalizeArabicToken(t.core));
  const replacements = [];
  for (let i = 0; i < normalized.length; ) {
    let matched = false;
    for (const phrase of ARABIC_PHRASES) {
      if (i + phrase.length <= normalized.length && phrase.every((part, j) => normalized[i + j] === part)) {
        replacements.push({
          start: tokens[i].start,
          end: tokens[i + phrase.length - 1].end
        });
        i += phrase.length;
        matched = true;
        break;
      }
    }
    if (!matched) i++;
  }
  let out = normalizedText;
  for (let i = replacements.length - 1; i >= 0; i--) {
    const r = replacements[i];
    out = out.slice(0, r.start) + "\uFDFA" + out.slice(r.end);
  }
  return restoreExisting ? restoreBlessings(out, protectedValue.tokens) : out;
}
function normalizeArabicBlessing(text2) {
  return normalizeArabicBlessingCore(text2);
}
function normalizeBlessing(text2) {
  const protectedValue = protectExistingBlessings(text2);
  let out = protectedValue.text;
  for (const [pattern, replacement] of BARE_ENGLISH_PATTERNS) {
    out = out.replace(pattern, replacement === "SPACE" ? " \uFDFA" : "\uFDFA");
  }
  out = normalizeArabicBlessingCore(out, false, false);
  for (const pattern of PARENTHESIZED_ENGLISH_PATTERNS) {
    out = out.replace(pattern, "(\uFDFA)");
  }
  for (const pattern of ENGLISH_PATTERNS) {
    out = out.replace(pattern, "\uFDFA");
  }
  out = out.replace(/\(\s*ﷺ\s*\)/gu, "(\uFDFA)");
  return restoreBlessings(out, protectedValue.tokens);
}
var BARE_ENGLISH_PATTERNS = [
  // May peace and blessings be upon him → bare ﷺ.
  [/\bmay\s+peace\s+and\s+blessings\s+be\s+upon\s+him\b/giu, "BARE"],
  // May peace and blessing be upon him → bare ﷺ; the comma form also drops its introductory comma.
  [/[,]\s*may\s+peace\s+and\s+blessing\s+be\s+upon\s+him\s*,?/giu, "SPACE"],
  [/\bmay\s+peace\s+and\s+blessing\s+be\s+upon\s+him\b/giu, "BARE"],
  // , peace and blessings of Allah upon him, → one space + bare ﷺ.
  [/,\s*peace\s+and\s+blessings\s+of\s+Allah\s+upon\s+him\s*,/giu, "SPACE"],
  // , may peace and blessings of Allah upon him, → one space + bare ﷺ.
  [/,\s*may\s+peace\s+and\s+blessings\s+of\s+Allah\s+upon\s+him\s*,/giu, "SPACE"],
  // , may Allah bless him and grant him peace[, optional] → bare ﷺ. At the start of a string there is no preceding word, so no leading space is added. This conversion is intentionally independent of any preceding word (for example, Prophet, Messenger, or no word at all).
  [/^,\s*may\s+Allah\s+bless\s+him\s+and\s+grant\s+him\s+peace(?:\s*,)?/iu, "BARE"],
  // [word] may Allah bless him and grant him peace[, optional] OR [word], may... → one space + bare ﷺ. This conversion is intentionally independent of the preceding word.
  [/(?:,\s+|\s+)may\s+Allah\s+bless\s+him\s+and\s+grant\s+him\s+peace(?:\s*,)?/giu, "SPACE"]
];
var PARENTHESIZED_ENGLISH_PATTERNS = [
  // (peace and blessings of Allah upon him) / (may ...)   → (ﷺ)
  /\(\s*(?:may\s+)?peace\s+and\s+blessings\s+of\s+Allah\s+upon\s+him\s*\)/giu,
  // (may Allah bless him and grant him peace)             → (ﷺ)
  /\(\s*may\s+Allah\s+bless\s+him\s+and\s+grant\s+him\s+peace\s*\)/giu
];
var ENGLISH_PATTERNS = [
  // Abbreviations, and phrasings that read fine on their own. Only the words are
  // matched, so source parentheses/enclosures survive: (SAW) → (ﷺ), SAW → ﷺ.
  /\bS\.\s*A\.\s*W\.\s*S\.?(?=$|[^\p{L}])/giu,
  // S.A.W.S → ﷺ
  /\bS\.\s*A\.\s*W\.?(?=$|[^\p{L}])/giu,
  // S.A.W → ﷺ
  /\bP\.\s*B\.\s*U\.\s*H\.?(?=$|[^\p{L}])/giu,
  // P.B.U.H → ﷺ
  /\bS\s+A\s+W(?:\s+S)?(?=$|[^\p{L}])/gu,
  // S A W / S A W S → ﷺ
  /\bSAWS(?=$|[^\p{L}])/gu,
  // SAWS → ﷺ
  /\bSAW(?=$|[^\p{L}])/gu,
  // SAW → ﷺ
  /\bP\s+B\s+U\s+H(?=$|[^\p{L}])/gu,
  // P B U H → ﷺ
  /\bPBUH(?=$|[^\p{L}])/gu,
  // PBUH → ﷺ
  /\bmay\s+peace\s+be\s+upon\s+him\b/giu,
  // May peace be upon him → ﷺ
  /\bpeace\s+and\s+blessings\s+be\s+upon\s+him\b/giu,
  // Peace and blessings be upon him → ﷺ
  /\bpeace\s+be\s+upon\s+him\b/giu
  // Peace be upon him → ﷺ
];
var DEFAULT_REPLACEMENT_RULES = [
  { id: "lord-to-rabb", language: "en", title: "Fix Inaccurate translation of Rabb", description: "Lord is an inaccurate and restrictive translation of the word Rabb. The word Rabb is more detailed in meaning and has no alternative in the english language", from: "Lord", to: "Rabb", enabled: true, caseSensitive: false },
  { id: "verse-to-ayat", language: "en", title: "Fix Mistranslation of Ayah", description: "Verse means a part of a poem or Bible, and this is a grave mistranslation of the word Ayah.", from: "Verse", to: "Ayah", enabled: true, caseSensitive: false },
  { id: "verses-to-ayat", language: "en", title: "Fix Mistranslation of Ayah", description: "", from: "Verses", to: "Ayah", enabled: true, caseSensitive: false },
  { id: "ayat-to-ayah", language: "en", title: "Use Standard English letters for Ayah", description: "", from: "Ay\xE2t", to: "Ayah", enabled: true, caseSensitive: false },
  { id: "quran-apostrophe", language: "en", title: "Use Standard English spelling for Quran", description: "", from: "Qur'an", to: "Quran", enabled: true, caseSensitive: false },
  { id: "ayesha-backtick", language: "en", title: "Use Standard English spelling for Ayesha", description: "", from: "`Ayesha", to: "Ayesha", enabled: true, caseSensitive: false },
  { id: "apostle-to-messenger", language: "en", title: "Apostle To more well known Messenger", description: "", from: "Apostle", to: "Messenger", enabled: true, caseSensitive: false },
  { id: "apostles-to-messengers", language: "en", title: "Apostles To more well known Messengers", description: "", from: "Apostles", to: "Messengers", enabled: true, caseSensitive: false }
];
function isWordCharacter(value) {
  return value !== void 0 && /[\p{L}\p{N}_]/u.test(value);
}
function replaceCustomLiteral(text2, source, replacement, caseSensitive) {
  if (!source) return text2;
  const haystack = caseSensitive ? text2 : text2.toLocaleLowerCase("en-US");
  const needle = caseSensitive ? source : source.toLocaleLowerCase("en-US");
  let output = "";
  let cursor = 0;
  while (cursor <= haystack.length - needle.length) {
    const index = haystack.indexOf(needle, cursor);
    if (index < 0) break;
    const before = text2[index - 1];
    const after = text2[index + source.length];
    if (!isWordCharacter(before) && !isWordCharacter(after)) {
      output += text2.slice(cursor, index) + replacement;
      cursor = index + source.length;
    } else {
      output += text2.slice(cursor, index + source.length);
      cursor = index + source.length;
    }
  }
  return output + text2.slice(cursor);
}
function convertToRomanEnglish(text2) {
  const protectedValue = protectExistingBlessings(text2);
  const converted = protectedValue.text.normalize("NFKD").replace(/\p{M}+/gu, "").replace(/[‘’‚‛ʻʼ]/gu, "'").replace(/[“”„‟]/gu, '"').replace(/[‐‑‒–—―]/gu, "-").replace(/…/gu, "...").replace(/\u00A0/gu, " ").replace(/[ʿʾ]/gu, "").replace(/[Ææ]/gu, (c) => c === "\xC6" ? "AE" : "ae").replace(/[Œœ]/gu, (c) => c === "\u0152" ? "OE" : "oe").replace(/[Ðð]/gu, (c) => c === "\xD0" ? "D" : "d").replace(/[Þþ]/gu, (c) => c === "\xDE" ? "TH" : "th").replace(/[Łł]/gu, (c) => c === "\u0141" ? "L" : "l").replace(/[Øø]/gu, (c) => c === "\xD8" ? "O" : "o").replace(/[Đđ]/gu, (c) => c === "\u0110" ? "D" : "d").replace(/[Ħħ]/gu, (c) => c === "\u0126" ? "H" : "h").replace(/ı/gu, "i").replace(/[Ŧŧ]/gu, (c) => c === "\u0166" ? "T" : "t").replace(/[Əə]/gu, (c) => c === "\u018F" ? "E" : "e").replace(/ß/gu, "ss");
  return restoreBlessings(converted, protectedValue.tokens);
}
var STANDALONE_RA_PATTERN = /(^|[^A-Za-z0-9])R\.?A\.?(?![.\p{L}\p{N}])/giu;
var RA_ENGLISH_PATTERNS = [
  [/,\s*May\s+Allah\s+be\s+pleased\s+with\s+Him(?:\s*,)?/giu, " \u0631\u0636\u064A \u0627\u0644\u0644\u0651\u0647 \u0639\u0646\u0647"],
  // , may Allah be pleased with Him[,] → رضي اللّه عنه
  [/,\s*May\s+Allah\s+be\s+pleased\s+with\s+Her(?:\s*,)?/giu, " \u0631\u0636\u064A \u0627\u0644\u0644\u0651\u0647 \u0639\u0646\u0647\u0627"],
  // , may Allah be pleased with Her[,] → رضي اللّه عنها
  [/,\s*May\s+Allah\s+be\s+pleased\s+with\s+them(?:\s*,)?/giu, " \u0631\u0636\u064A \u0627\u0644\u0644\u0651\u0647 \u0639\u0646\u0647\u0645"],
  // , may Allah be pleased with them[,] → رضي اللّه عنهم
  [/\bMay\s+Allah\s+be\s+pleased\s+with\s+Him\b/giu, "\u0631\u0636\u064A \u0627\u0644\u0644\u0651\u0647 \u0639\u0646\u0647"],
  // May Allah be pleased with Him → رضي اللّه عنه
  [/\bMay\s+Allah\s+be\s+pleased\s+with\s+Her\b/giu, "\u0631\u0636\u064A \u0627\u0644\u0644\u0651\u0647 \u0639\u0646\u0647\u0627"],
  // May Allah be pleased with Her → رضي اللّه عنها
  [/\bMay\s+Allah\s+be\s+pleased\s+with\s+them\b/giu, "\u0631\u0636\u064A \u0627\u0644\u0644\u0651\u0647 \u0639\u0646\u0647\u0645"]
  // May Allah be pleased with them → رضي اللّه عنهم
];
function protectExistingRa(text2) {
  const tokens = [];
  const protectedText = text2.replace(/\(\s*(?:رَضِيَ ٱللَّٰهُ عَنْهُ|رضي اللّه (?:عنه|عنها|عنهم))\s*\)|رَضِيَ ٱللَّٰهُ عَنْهُ|رضي اللّه (?:عنه|عنها|عنهم)/gu, (match) => {
    const token = `QHFRATOKEN${tokens.length}X`;
    tokens.push(match);
    return token;
  });
  return { text: protectedText, tokens };
}
function restoreRa(text2, tokens) {
  return text2.replace(/QHFRATOKEN(\d+)X/gu, (_, index) => tokens[Number(index)] ?? "");
}
function normalizeStandaloneRa(text2) {
  const protectedValue = protectExistingRa(text2);
  let out = protectedValue.text;
  for (const [pattern, replacement] of RA_ENGLISH_PATTERNS) out = out.replace(pattern, replacement);
  out = out.replace(STANDALONE_RA_PATTERN, (_match, prefix) => `${prefix}\u0631\u064E\u0636\u0650\u064A\u064E \u0671\u0644\u0644\u064E\u0651\u0670\u0647\u064F \u0639\u064E\u0646\u0652\u0647\u064F`);
  out = out.replace(/\(\s*(رَضِيَ ٱللَّٰهُ عَنْهُ|رضي اللّه (?:عنه|عنها|عنهم))\s*\)/gu, "($1)");
  return restoreRa(out, protectedValue.tokens);
}
function modifyCodeSyntax(text2, mode) {
  if (mode === "replace") return text2.replace(/`/gu, "\u02BF");
  if (mode === "remove") return text2.replace(/`/gu, "");
  return text2;
}
function applyEnglishReplacements(text2, rules) {
  return rules.filter((rule) => rule.enabled && rule.language === "en" && rule.from.trim().length > 0).reduce((current, rule) => {
    if (rule.id !== "ayat-to-ayah") {
      return replaceCustomLiteral(current, rule.from, rule.to, rule.caseSensitive);
    }
    const pattern = /(^|[^\p{L}\p{N}_])Ay(?:a|â)t(?=$|[^\p{L}\p{N}_])/giu;
    return current.replace(pattern, (_match, prefix) => `${prefix}${rule.to}`);
  }, text2);
}
function transformFetchedEnglishText(text2, options) {
  if (!options.textConversionsEnabled) return text2;
  let out = options.blessingNormalization ? normalizeBlessing(text2) : text2;
  out = applyEnglishReplacements(out, options.replacementRules);
  out = options.romanEnglish ? convertToRomanEnglish(out) : out;
  out = options.raNormalization ? normalizeStandaloneRa(out) : out;
  return modifyCodeSyntax(out, options.codeSyntaxMode);
}
function transformFetchedArabicText(text2, options) {
  if (!options.textConversionsEnabled || !options.blessingNormalization) return text2;
  return normalizeArabicBlessing(text2);
}

// src/core/url.ts
var QURAN_WEBSITES = {
  "quran-unlocked": "https://quran.islamunlocked.com/quran/en-hilali-khan/quran:$surah:$ayah",
  "quran-com": "https://quran.com/$surah/$ayah",
  "quran-wbw": "https://quranwbw.com/$surah/$ayah"
};
function validateTemplate(template) {
  const tokens = template.match(/\$[A-Za-z]+/g) ?? [];
  return [...new Set(tokens)].filter((t) => !["$surah", "$ayah", "$ayahlast"].includes(t));
}
function makeQuranUrl(website, template, surah, ayah, ayahLast, translationId = "hilali-khan") {
  if (website === "quran-unlocked") {
    const routeId = translationId === "hilali-khan" ? "en-hilali-khan" : translationId;
    const range = `${surah}:${ayah}${ayahLast > ayah ? `-${ayahLast}` : ""}`;
    return `https://quran.islamunlocked.com/quran/${encodeURIComponent(routeId)}/quran:${range}`;
  }
  const raw = website === "custom" ? template : QURAN_WEBSITES[website];
  const invalid = validateTemplate(raw);
  if (invalid.length) throw new Error(`Unknown URL placeholders: ${invalid.join(", ")}`);
  return raw.replaceAll("$surah", encodeURIComponent(String(surah))).replaceAll("$ayahlast", encodeURIComponent(String(ayahLast))).replaceAll("$ayah", encodeURIComponent(String(ayah)));
}

// src/parsing/references.ts
var HADITH_ALIASES = {
  bukhari: "bukhari",
  "sahih al-bukhari": "bukhari",
  "sahih bukhari": "bukhari",
  muslim: "muslim",
  "sahih muslim": "muslim",
  abudawud: "abudawud",
  "abu dawud": "abudawud",
  "sunan abu dawud": "abudawud",
  tirmidhi: "tirmidhi",
  "jami at-tirmidhi": "tirmidhi",
  "jami al-tirmidhi": "tirmidhi",
  nasai: "nasai",
  "sunan an-nasai": "nasai",
  "sunan al-nasai": "nasai",
  ibnmajah: "ibnmajah",
  "ibn majah": "ibnmajah",
  "sunan ibn majah": "ibnmajah",
  ahmad: "ahmad",
  darimi: "darimi",
  malik: "malik",
  "muwatta malik": "malik",
  dehlawi: "dehlawi",
  nawawi: "nawawi",
  qudsi: "qudsi",
  nawawi40: "nawawi40",
  qudsi40: "qudsi40",
  shahwaliullah40: "shahwaliullah40",
  riyadussalihin: "riyadussalihin",
  mishkat_almasabih: "mishkat_almasabih",
  aladab_almufrad: "aladab_almufrad",
  shamail_muhammadiyah: "shamail_muhammadiyah",
  bulugh_almaram: "bulugh_almaram"
};
function normalizeInput(input) {
  return input.normalize("NFKC").trim().replace(/\s+/g, " ");
}
function parseQuranReference(input) {
  const value = normalizeInput(input);
  const match = /^(\d{1,3})\s*:\s*(\d{1,3})(?:\s*-\s*(\d{1,3}))?$/.exec(value);
  if (!match) return null;
  const surah = Number(match[1]);
  const startAyah = Number(match[2]);
  const endAyah = match[3] ? Number(match[3]) : startAyah;
  return { kind: "quran", surah, startAyah, endAyah };
}
function parseHadithReference(input) {
  const value = normalizeInput(input);
  const match = /^(.+?)\s*:\s*(\d{1,6}[a-z]?)(?:\s*[-–—]\s*(\d{1,6}[a-z]?))?$/iu.exec(value);
  if (!match) return null;
  const alias = match[1]?.toLocaleLowerCase("en-US");
  if (!alias) return null;
  const collectionId = HADITH_ALIASES[alias] ?? alias;
  const parseHadithNumber = (raw) => /^\d{1,6}$/u.test(raw) ? Number(raw) : raw.toLowerCase();
  const hadithNumber = parseHadithNumber(match[2]);
  const endHadithNumber = match[3] ? parseHadithNumber(match[3]) : hadithNumber;
  return { kind: "hadith", collectionId, hadithNumber, ...endHadithNumber !== hadithNumber ? { endHadithNumber } : {} };
}

// src/parsing/validation.ts
var AYAH_COUNTS = [7, 286, 200, 176, 120, 165, 206, 75, 129, 109, 123, 111, 43, 52, 99, 128, 111, 110, 98, 135, 112, 78, 118, 64, 77, 227, 93, 88, 69, 60, 34, 30, 73, 54, 45, 83, 182, 88, 75, 85, 54, 53, 89, 59, 37, 35, 38, 29, 18, 45, 60, 49, 62, 55, 78, 96, 29, 22, 24, 13, 14, 11, 11, 18, 12, 12, 30, 52, 52, 44, 28, 28, 20, 56, 40, 31, 50, 40, 46, 42, 29, 19, 36, 25, 22, 17, 19, 26, 30, 20, 15, 21, 25, 11, 8, 9, 10, 11, 12, 12, 7, 8, 9, 11, 11, 8, 3, 9, 5, 4, 7, 3, 6, 3, 5, 4, 5, 6, 3, 6, 3, 5, 4, 5, 6];
function validateQuranReference(reference, maxRange) {
  if (!Number.isInteger(reference.surah) || reference.surah < 1 || reference.surah > 114) return "Invalid Surah.";
  const max = AYAH_COUNTS[reference.surah - 1];
  if (!max) return "Invalid Surah.";
  if (!Number.isInteger(reference.startAyah) || reference.startAyah < 1 || reference.startAyah > max) return "Invalid Ayah.";
  if (!Number.isInteger(reference.endAyah) || reference.endAyah < 1 || reference.endAyah > max) return "Invalid Ayah.";
  if (reference.startAyah > reference.endAyah) return "Invalid range: start must be less than or equal to end.";
  if (maxRange !== void 0 && reference.endAyah - reference.startAyah + 1 > maxRange) return `Quran fetch limit is ${maxRange} ayahs.`;
  return null;
}
function hadithNumberValue(value) {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
  if (typeof value === "string" && /^\d{1,6}$/u.test(value)) return Number(value);
  return null;
}
function isValidHadithNumber(value, allowAlphabetic) {
  if (typeof value === "number") return Number.isInteger(value) && value > 0;
  return allowAlphabetic ? /^\d{1,6}[a-z]?$/iu.test(value) : /^\d{1,6}$/u.test(value);
}
function validateHadithReference(reference, collections, maxRange) {
  const collection = collections.find((item) => item.id === reference.collectionId);
  if (!collection) return "Unknown collection.";
  const allowAlphabetic = collection.id === "muslim";
  if (!isValidHadithNumber(reference.hadithNumber, allowAlphabetic)) return "Invalid Hadith reference.";
  const end = reference.endHadithNumber ?? reference.hadithNumber;
  if (!isValidHadithNumber(end, allowAlphabetic)) return "Invalid Hadith range.";
  const startNumeric = hadithNumberValue(reference.hadithNumber);
  const endNumeric = hadithNumberValue(end);
  if (startNumeric === null || endNumeric === null) {
    if (reference.endHadithNumber !== void 0) return "Alphabetic Hadith ranges are not supported; enter a single reference such as 202a.";
    return null;
  }
  if (startNumeric > endNumeric) return "Invalid range: start must be less than or equal to end.";
  if (maxRange !== void 0 && endNumeric - startNumeric + 1 > maxRange) return `Hadith fetch limit is ${maxRange} hadiths.`;
  return null;
}

// src/providers/registry.ts
var ProviderRegistry = class {
  constructor() {
    __publicField(this, "quran", /* @__PURE__ */ new Map());
    __publicField(this, "hadith", /* @__PURE__ */ new Map());
  }
  registerQuran(provider) {
    this.quran.set(provider.metadata.id, provider);
  }
  registerHadith(provider) {
    this.hadith.set(provider.metadata.id, provider);
  }
  getQuran(id) {
    const p = this.quran.get(id);
    if (!p) throw new Error(`Unknown Quran provider: ${id}`);
    return p;
  }
  getHadith(id) {
    const p = this.hadith.get(id);
    if (!p) throw new Error(`Unknown Hadith provider: ${id}`);
    return p;
  }
  listQuran() {
    return [...this.quran.values()];
  }
  listHadith() {
    return [...this.hadith.values()];
  }
};

// src/core/cache.ts
var MemoryCacheStore = class {
  constructor(maxEntries = 512) {
    __publicField(this, "values", /* @__PURE__ */ new Map());
    __publicField(this, "maxEntries");
    this.maxEntries = Number.isFinite(maxEntries) ? Math.max(1, Math.floor(maxEntries)) : 512;
  }
  async get(key) {
    const entry = this.values.get(key);
    if (!entry) return null;
    this.values.delete(key);
    this.values.set(key, entry);
    return entry;
  }
  async set(entry) {
    this.values.delete(entry.key);
    this.values.set(entry.key, entry);
    while (this.values.size > this.maxEntries) {
      const oldest = this.values.keys().next().value;
      if (oldest === void 0) break;
      this.values.delete(oldest);
    }
  }
  async delete(key) {
    this.values.delete(key);
  }
  async clear() {
    this.values.clear();
  }
  /** Exposed for focused tests and diagnostics without leaking the backing map. */
  get size() {
    return this.values.size;
  }
};
var SingleFlight = class {
  constructor() {
    __publicField(this, "pending", /* @__PURE__ */ new Map());
  }
  run(key, task) {
    const existing = this.pending.get(key);
    if (existing) return existing;
    const promise = Promise.resolve().then(task);
    this.pending.set(key, promise);
    void promise.then(
      () => {
        if (this.pending.get(key) === promise) this.pending.delete(key);
      },
      () => {
        if (this.pending.get(key) === promise) this.pending.delete(key);
      }
    );
    return promise;
  }
  get size() {
    return this.pending.size;
  }
};
async function setCacheBestEffort(store, entry) {
  try {
    await store.set(entry);
  } catch (error) {
    console.warn("[Quran Hadith Fetcher] Cache write failed; continuing without cache.", error);
  }
}
async function setPersistentCacheBestEffort(store, key, value) {
  if (!store) return;
  try {
    await store.set(key, value);
  } catch (error) {
    console.warn("[Quran Hadith Fetcher] Persistent cache write failed; continuing without cache.", error);
  }
}
function makeCacheKey(parts) {
  return Object.keys(parts).sort().map((key) => `${key}=${encodeURIComponent(String(parts[key] ?? ""))}`).join("&");
}

// src/core/catalog.ts
var HADITH_CANONICAL = {
  bukhari: { name: "Sahih Al-Bukhari", author: "Imam Muhammad Ibn Ismail Al-Bukhari" },
  muslim: { name: "Sahih Muslim", author: "Imam Muslim Ibn Al-Hajjaj Al-Naysaburi" },
  abudawud: { name: "Sunan Abi Dawud", author: "Imam Sulayman Ibn Al-Ashath Abu Dawud Al-Sijistani" },
  tirmidhi: { name: "Jami' At-Tirmidhi", author: "Imam Abu Isa Muhammad Ibn Isa At-Tirmidhi" },
  nasai: { name: "Sunan An-Nasa'i", author: "Imam Ahmad Ibn Shu'ayb An-Nasa'i" },
  ibnmajah: { name: "Sunan Ibn Majah", author: "Imam Muhammad Ibn Yazid Ibn Majah Al-Qazwini" },
  malik: { name: "Muwatta Malik", author: "Imam Malik Ibn Anas" },
  ahmad: { name: "Musnad Ahmad Ibn Hanbal", author: "Imam Ahmad Ibn Hanbal" },
  darimi: { name: "Sunan Ad-Darimi", author: "Imam Abu Muhammad Abd Al-Rahman Ibn Abd Allah Al-Darimi" },
  nawawi40: { name: "The Forty Hadith of Imam Nawawi", author: "Imam Yahya Ibn Sharaf Al-Nawawi" },
  qudsi40: { name: "The Forty Hadith Qudsi" },
  shahwaliullah40: { name: "The Forty Hadith of Shah Waliullah", author: "Shah Waliullah Dahlawi" },
  riyadussalihin: { name: "Riyad As-Salihin", author: "Imam Yahya Ibn Sharaf Al-Nawawi" },
  mishkat_almasabih: { name: "Mishkat Al-Masabih", author: "Al-Khatib Al-Tabrizi" },
  aladab_almufrad: { name: "Al-Adab Al-Mufrad", author: "Imam Muhammad Ibn Ismail Al-Bukhari" },
  shamail_muhammadiyah: { name: "Shama'il Muhammadiyah", author: "Imam Tirmidhi" },
  bulugh_almaram: { name: "Bulugh Al-Maram", author: "Ibn Hajar Al-Asqalani" }
};
var HADITH_ALIASES2 = {
  riyad: "riyadussalihin",
  adab: "aladab_almufrad",
  shamail: "shamail_muhammadiyah",
  nawawi: "nawawi40",
  qudsi: "qudsi40",
  dehlawi: "shahwaliullah40"
};
function normalizeHadithCollectionMetadata(collection) {
  const canonicalId = HADITH_ALIASES2[collection.id] ?? collection.id;
  const canonical = HADITH_CANONICAL[canonicalId];
  if (!canonical) return { ...collection };
  return { ...collection, name: canonical.name, author: canonical.author };
}
var QURAN_TRANSLATION_PATTERNS = [
  { match: /hilali|muhammadtaqiudd|taqi[- ]?ud[- ]?din.*hilali.*muhsin.*khan|muhammad.*hilali.*muhsin.*khan/iu, name: "Interpretation of the Meanings of the Noble Quran", author: "Muhammad Taqi-ud-Din Al-Hilali and Muhammad Muhsin Khan" },
  { match: /abdel.?haleem|haleem/iu, name: "The Quran: A New Translation", author: "M. A. S. Abdel Haleem" },
  { match: /khattab/iu, name: "The Clear Quran", author: "Mustafa Khattab" },
  { match: /saheeh|sahih.*international|sahihinternational/iu, name: "The Quran", author: "Saheeh International" },
  { match: /bridges/iu, name: "Bridges' Translation of the Ten Qira'at of the Noble Quran", author: "Bridges Translation Center" },
  { match: /taqi[- ]?usmani|mufti.*usmani/iu, name: "The Meanings of the Noble Quran with Explanatory Notes", author: "Mufti Taqi Usmani" },
  { match: /talal.*itani|itani/iu, name: "Quran in English: Clear and Easy to Read", author: "Talal Itani" },
  { match: /bewley/iu, name: "The Noble Quran: A New Rendering of Its Meaning in English", author: "Aisha Bewley" },
  { match: /study.*quran|thestudyquran/iu, name: "The Study Quran: A New Translation and Commentary", author: "Seyyed Hossein Nasr et al." },
  { match: /ghali|muhammadmahmoud/iu, name: "Towards Understanding the Ever-glorious Quran", author: "Muhammad Mahmud Ghali" },
  { match: /ahmedraza|raza.*khan/iu, name: "The Holy Quran", author: "Ahmed Raza Khan" },
  { match: /wahiduddin/iu, name: "The Quran: Translation and Commentary with Parallel Arabic Text", author: "Wahiduddin Khan" },
  { match: /qaribullah/iu, name: "The Holy Quran", author: "Hasan Al-Fatih Qaribullah and Ahmad Darwish" },
  { match: /busool/iu, name: "The Wise Quran: These Are the Verses of the Wise Book", author: "Busool" },
  { match: /tahir[- ]?ul[- ]?qadri|qadri/iu, name: "Irfan-ul-Quran", author: "Tahir-ul-Qadri" },
  { match: /rowwad/iu, name: "Explanation of the Meanings of the Noble Quran", author: "Rowwad Translation Center" },
  { match: /asad|muhammadasad/iu, name: "The Message of the Quran", author: "Muhammad Asad" },
  { match: /sarwar|muhammadsarwar/iu, name: "The Holy Quran: The Arabic Text and English Translation", author: "Muhammad Sarwar" },
  { match: /daryabadi/iu, name: "Tafseer-e-Majidi", author: "Abdul Majid Daryabadi" },
  { match: /shakir|mohammadhabibsh/iu, name: "The Quran", author: "Mohammad Habib Shakir" },
  { match: /pickthall|marmadu/iu, name: "The Meaning of the Glorious Koran", author: "Mohammed Marmaduke William Pickthall" },
  { match: /qarai|aliquliqarai/iu, name: "The Quran with an English Paraphrase", author: "Ali Quli Qarai" },
  { match: /yusuf.?ali|yusufaliorig/iu, name: "The Meaning of the Holy Quran", author: "Abdullah Yusuf Ali" }
];
function normalizeQuranTranslationMetadata(translation) {
  const haystack = `${translation.id} ${translation.name} ${translation.author ?? ""}`;
  const canonical = QURAN_TRANSLATION_PATTERNS.find((item) => item.match.test(haystack));
  return canonical ? { ...translation, name: canonical.name, author: canonical.author } : { ...translation };
}

// src/providers/quran-unlocked/parser.ts
function isRecord(value) {
  return typeof value === "object" && value !== null;
}
function asNonEmptyString(value) {
  return typeof value === "string" && value.trim() ? value : void 0;
}
function cleanEnglishTranslation(value) {
  return value.replace(/\\n/g, "\n").replace(/\\/g, "").replace(/<br\s*\/?>(?:\s*)/gi, "\n").replace(/<\/?(?:section|p|div|span)[^>]*>/gi, "").replace(/<[^>]+>/g, "").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/\s*\n\s*/g, " ").replace(/\s{2,}/g, " ").replace(/^\d+:\d+\s+/, "").trim();
}
function capitalizeSurahName(value) {
  return value ? value[0].toUpperCase() + value.slice(1) : value;
}
function extractItems(raw) {
  if (Array.isArray(raw)) return raw.filter(isRecord);
  if (isRecord(raw) && Array.isArray(raw.result)) return raw.result.filter(isRecord);
  return [];
}
function itemAyahNumber(item) {
  if (typeof item.num === "number" && Number.isInteger(item.num)) return item.num;
  if (typeof item.num === "string") {
    const m = /:(\d+)$/.exec(item.num);
    const n = Number(m?.[1] ?? item.num);
    return Number.isInteger(n) ? n : void 0;
  }
  return void 0;
}
function cleanFootnoteText(value) {
  return value.replace(/^\(V\.\s*\d+\s*:\s*\d+\s*\)\.?\s*/i, "").replace(/^\[?\d+\]?\s*[:.)-]\s*/u, "").replace(/^[:：]\s*/u, "").trim();
}
function parseFootnoteField(value) {
  if (typeof value === "string") {
    const normalized = cleanEnglishTranslation(value);
    const chunks = normalized.split(/↩︎|↩/u).map((chunk) => chunk.trim()).filter(Boolean);
    return chunks.map((text2, index) => ({ number: index + 1, text: cleanFootnoteText(text2) })).filter((note) => note.text.length > 0);
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => {
      if (typeof entry === "string") return [{ number: index + 1, text: cleanFootnoteText(cleanEnglishTranslation(entry)) }];
      if (!isRecord(entry)) return [];
      const text2 = asNonEmptyString(entry.text) ?? asNonEmptyString(entry.body) ?? asNonEmptyString(entry.content);
      if (!text2) return [];
      const numberValue = Number(entry.number ?? entry.num ?? index + 1);
      return [{ number: Number.isInteger(numberValue) ? numberValue : index + 1, text: cleanFootnoteText(cleanEnglishTranslation(text2)) }];
    }).filter((note) => note.text.length > 0);
  }
  if (isRecord(value)) {
    const text2 = asNonEmptyString(value.text) ?? asNonEmptyString(value.body) ?? asNonEmptyString(value.content);
    if (text2) {
      const numberValue = Number(value.number ?? value.num ?? 1);
      return [{ number: Number.isInteger(numberValue) ? numberValue : 1, text: cleanFootnoteText(cleanEnglishTranslation(text2)) }];
    }
  }
  return [];
}
function extractFootnotes(value, surah, ayah, auxiliary) {
  const versePattern = surah !== void 0 && ayah !== void 0 ? new RegExp(`\\(V\\.\\s*${surah}\\s*:\\s*${ayah}\\s*\\)\\.?\\s*`, "i") : /\(V\.\s*\d+\s*:\s*\d+\s*\)\.?\s*/i;
  const noteStart = versePattern.exec(value);
  if (noteStart) {
    const mainText = value.slice(0, noteStart.index).trim();
    const noteSection = value.slice(noteStart.index + noteStart[0].length).trim();
    const footnotes = parseFootnoteField(noteSection);
    return { text: mainText, footnotes };
  }
  const auxiliaryNotes = parseFootnoteField(auxiliary);
  if (auxiliaryNotes.length) {
    const firstNote = auxiliaryNotes[0]?.text;
    if (firstNote) {
      const noteIndex = value.indexOf(firstNote);
      if (noteIndex >= 0) return { text: value.slice(0, noteIndex).trim(), footnotes: auxiliaryNotes };
    }
  }
  return { text: value.replace(/\s*↩︎\s*|\s*↩\s*/gu, " ").trim(), footnotes: [] };
}
function splitRangeItem(item, reference) {
  if (reference.startAyah === reference.endAyah) return [item];
  const start = reference.startAyah;
  const end = reference.endAyah;
  const english = asNonEmptyString(item.body_en);
  const arabic = asNonEmptyString(item.body);
  if (!english && !arabic) return [item];
  const englishByAyah = splitEnglishRangeByAyah(english, start, end);
  const arabicParts = arabic ? arabic.split(/۝/u).map((part) => part.trim()).filter(Boolean) : [];
  const count = Math.max(arabicParts.length, englishByAyah.size);
  if (count <= 1) return [item];
  const result = [];
  const auxiliaryFootnotes = asNonEmptyString(item.footnote_en) ?? asNonEmptyString(item.footnotes_en);
  for (let n = start; n <= end; n++) {
    const index = n - start;
    const child = { ...item, ref: `${reference.kind}:${reference.surah}:${n}`, num: `${reference.surah}:${n}`, body: void 0, body_en: void 0, footnote_en: void 0, footnotes_en: void 0 };
    if (arabicParts[index]) child.body = arabicParts[index];
    const en = englishByAyah.get(n);
    if (en) child.body_en = en;
    if (auxiliaryFootnotes) {
      const marker = new RegExp(`\\(V\\.\\s*${reference.surah}\\s*:\\s*${n}\\s*\\)`, "ig");
      const markers = [...auxiliaryFootnotes.matchAll(marker)];
      if (markers.length) {
        const next = n < end ? new RegExp(`\\(V\\.\\s*${reference.surah}\\s*:\\s*${n + 1}\\s*\\)`, "i").exec(auxiliaryFootnotes) : void 0;
        const from = markers[0].index ?? 0;
        const to = next?.index ?? auxiliaryFootnotes.length;
        child.footnote_en = auxiliaryFootnotes.slice(from, to);
      }
    }
    result.push(child);
  }
  return result;
}
function parseTranslation(value, surah, ayah, auxiliary) {
  const cleaned = cleanEnglishTranslation(value);
  return extractFootnotes(cleaned, surah, ayah, auxiliary);
}
function splitEnglishRangeByAyah(value, start, end) {
  const result = /* @__PURE__ */ new Map();
  if (!value) return result;
  if (start === end) {
    result.set(start, value.trim());
    return result;
  }
  let cursor = 0;
  for (let ayah = start; ayah < end; ayah++) {
    const nextAyah = ayah + 1;
    const boundary = new RegExp(`(?:^|\\s)(?:\u21A9\uFE0E\\s*)?${nextAyah}\\s+`, "u");
    const match = boundary.exec(value.slice(cursor));
    if (!match) {
      if (ayah === start) {
        result.set(start, value.trim());
      }
      return result;
    }
    const absolute = cursor + match.index;
    const boundaryText = match[0];
    result.set(ayah, value.slice(cursor, absolute).trim());
    cursor = absolute + boundaryText.length;
  }
  result.set(end, value.slice(cursor).trim());
  return result;
}
function translationTextForItem(item, translation, reference) {
  const target = translation.id.toLowerCase();
  const targetName = translation.name.toLowerCase();
  const consider = (candidate) => {
    if (typeof candidate === "string") return parseTranslation(candidate, reference.surah, itemAyahNumber(item), item.footnote_en ?? item.footnotes_en);
    if (!isRecord(candidate)) return void 0;
    const id = asNonEmptyString(candidate.id)?.toLowerCase();
    const name = asNonEmptyString(candidate.name)?.toLowerCase();
    const alias = asNonEmptyString(candidate.alias)?.toLowerCase();
    const text2 = asNonEmptyString(candidate.text) ?? asNonEmptyString(candidate.body) ?? asNonEmptyString(candidate.content);
    if (text2 && (id === target || name === targetName || alias === target || alias === "en-hilali-khan")) return parseTranslation(text2, reference.surah, itemAyahNumber(item), item.footnote_en ?? item.footnotes_en);
    return void 0;
  };
  if (isRecord(item.translations)) {
    for (const [key, value] of Object.entries(item.translations)) {
      if (key.toLowerCase() === target || key.toLowerCase() === targetName || key.toLowerCase() === "en-hilali-khan") {
        const parsed2 = consider(value);
        if (parsed2) return parsed2;
        if (typeof value === "string" && value.trim()) return parseTranslation(value, reference.surah, itemAyahNumber(item), item.footnote_en ?? item.footnotes_en);
      }
      const parsed = consider(value);
      if (parsed) return parsed;
    }
  }
  if (Array.isArray(item.translations)) {
    for (const value of item.translations) {
      const parsed = consider(value);
      if (parsed) return parsed;
    }
  }
  if (item.translation) {
    const parsed = consider(item.translation);
    if (parsed) return parsed;
  }
  if (asNonEmptyString(item.body_en)) return parseTranslation(item.body_en, reference.surah, itemAyahNumber(item), item.footnote_en ?? item.footnotes_en);
  return void 0;
}
function parseQuranUnlockedResponse(raw, reference, translation) {
  const items = extractItems(raw);
  const expandedItems = items.flatMap((item) => splitRangeItem(item, reference));
  const byAyah = /* @__PURE__ */ new Map();
  for (const item of expandedItems) {
    const n = itemAyahNumber(item);
    if (n !== void 0 && n >= reference.startAyah && n <= reference.endAyah && !byAyah.has(n)) byAyah.set(n, item);
  }
  const first = items[0];
  const surahName = asNonEmptyString(first?.chapter?.title_en) ? capitalizeSurahName(String(first?.chapter?.title_en)) : asNonEmptyString(first?.chapter?.title) ? capitalizeSurahName(String(first?.chapter?.title)) : `Surah ${reference.surah}`;
  const ayahs = [];
  for (let n = reference.startAyah; n <= reference.endAyah; n++) {
    const item = byAyah.get(n);
    if (!item) continue;
    const ayah = {
      reference: { kind: "quran", surah: reference.surah, startAyah: n, endAyah: n }
    };
    const arabic = asNonEmptyString(item.body);
    const english = translationTextForItem(item, translation, reference);
    if (arabic) ayah.arabic = arabic;
    if (english) {
      ayah.translation = {
        id: translation.id,
        language: translation.language,
        name: translation.name,
        text: english.text,
        providerId: translation.providerId
      };
      if (english.footnotes.length) ayah.footnotes = english.footnotes;
    }
    ayahs.push(ayah);
  }
  return { kind: "quran", reference, surahName, ayahs };
}

// src/core/fetch.ts
function contiguousRanges(numbers) {
  const sorted = [...new Set(numbers)].sort((a, b) => a - b);
  if (!sorted.length) return [];
  const ranges = [];
  let start = sorted[0];
  let end = start;
  for (const number of sorted.slice(1)) {
    if (number === end + 1) {
      end = number;
      continue;
    }
    ranges.push({ start, end });
    start = end = number;
  }
  ranges.push({ start, end });
  return ranges;
}
async function mapWithConcurrency(items, concurrency, worker) {
  if (!items.length) return [];
  const width = Math.max(1, Math.floor(concurrency));
  const results = new Array(items.length);
  let nextIndex = 0;
  const runners = Array.from({ length: Math.min(width, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}
var QURAN_SURAH_AYAH_COUNTS = [
  7,
  286,
  200,
  176,
  120,
  165,
  206,
  75,
  129,
  109,
  123,
  111,
  43,
  52,
  99,
  128,
  111,
  110,
  98,
  135,
  112,
  78,
  118,
  64,
  77,
  227,
  93,
  88,
  69,
  60,
  34,
  30,
  73,
  54,
  45,
  83,
  182,
  88,
  75,
  85,
  54,
  53,
  89,
  59,
  37,
  35,
  38,
  29,
  18,
  45,
  60,
  49,
  62,
  55,
  78,
  96,
  29,
  22,
  24,
  13,
  14,
  11,
  11,
  18,
  12,
  12,
  30,
  52,
  52,
  44,
  28,
  28,
  20,
  56,
  40,
  31,
  50,
  40,
  46,
  42,
  29,
  36,
  5,
  19,
  37,
  44,
  46,
  30,
  22,
  25,
  20,
  15,
  21,
  10,
  8,
  8,
  19,
  5,
  8,
  8,
  11,
  11,
  8,
  3,
  9,
  5,
  4,
  7,
  3,
  6,
  3,
  5,
  4,
  5,
  6
];
function shouldFetchWholeQuranSurah(reference, missingCount, requestsPerAyah, wholeSurahRequests, minimumMissingCount, minimumMissingCoverage = 0.2) {
  if (missingCount < minimumMissingCount) return false;
  const totalAyahs = QURAN_SURAH_AYAH_COUNTS[reference.surah - 1];
  if (!totalAyahs || totalAyahs <= 0) return false;
  const coverage = missingCount / totalAyahs;
  if (coverage < Math.max(0, Math.min(1, minimumMissingCoverage))) return false;
  const targetedRequests = missingCount * Math.max(1, requestsPerAyah);
  return targetedRequests > Math.max(1, wholeSurahRequests);
}

// src/providers/quran-unlocked/provider.ts
var TRANSLATIONS = [
  { id: "hilali-khan", language: "en", name: "Interpretation of the Meanings of the Noble Quran", author: "Muhammad Taqi-ud-Din Al-Hilali and Muhammad Muhsin Khan", providerId: "quran-unlocked" },
  { id: "en-haleem", language: "en", name: "The Quran: A New Translation", author: "M. A. S. Abdel Haleem", providerId: "quran-unlocked" },
  { id: "en-khattab", language: "en", name: "The Clear Quran", author: "Mustafa Khattab", providerId: "quran-unlocked" },
  { id: "en-saheeh-intl", language: "en", name: "The Holy Quran (Saheeh International)", author: "Saheeh International", providerId: "quran-unlocked" },
  { id: "en-bridges", language: "en", name: "Bridges' Translation of the Ten Qira'at of the Noble Quran", author: "Bridges Translation Center", providerId: "quran-unlocked" },
  { id: "en-taqi-usmani", language: "en", name: "The Meanings of the Noble Quran with Explanatory Notes", author: "Mufti Taqi Usmani", providerId: "quran-unlocked" },
  { id: "en-itani", language: "en", name: "Quran in English: Clear and Easy to Read", author: "Talal Itani", providerId: "quran-unlocked" },
  { id: "en-bewley", language: "en", name: "The Noble Quran: A New Rendering of Its Meaning in English", author: "Aisha Bewley", providerId: "quran-unlocked" },
  { id: "en-study-quran", language: "en", name: "The Study Quran: A New Translation and Commentary", author: "Seyyed Hossein Nasr et al.", providerId: "quran-unlocked" },
  { id: "en-ghali", language: "en", name: "Towards Understanding the Ever-glorious Quran", author: "Muhammad Mahmud Ghali", providerId: "quran-unlocked" },
  { id: "en-ahmedraza", language: "en", name: "The Holy Quran", author: "Ahmed Raza Khan", providerId: "quran-unlocked" },
  { id: "en-wahiduddin", language: "en", name: "The Quran: Translation and Commentary with Parallel Arabic Text", author: "Wahiduddin Khan", providerId: "quran-unlocked" },
  { id: "en-qaribullah", language: "en", name: "The Holy Quran", author: "Hasan Al-Fatih Qaribullah and Ahmad Darwish", providerId: "quran-unlocked" },
  { id: "en-busool", language: "en", name: "The Wise Quran: These Are the Verses of the Wise Book", author: "Busool", providerId: "quran-unlocked" },
  { id: "en-tahir-ul-qadri", language: "en", name: "Irfan-ul-Quran", author: "Tahir-ul-Qadri", providerId: "quran-unlocked" },
  { id: "en-rowwad", language: "en", name: "Explanation of the Meanings of the Noble Quran", author: "Rowwad Translation Center", providerId: "quran-unlocked" },
  { id: "en-asad", language: "en", name: "The Message of the Quran", author: "Muhammad Asad", providerId: "quran-unlocked" },
  { id: "en-sarwar", language: "en", name: "The Holy Quran: The Arabic Text and English Translation", author: "Muhammad Sarwar", providerId: "quran-unlocked" },
  { id: "en-daryabadi", language: "en", name: "Tafseer-e-Majidi", author: "Abdul Majid Daryabadi", providerId: "quran-unlocked" },
  { id: "en-shakir", language: "en", name: "The Quran", author: "Mohammad Habib Shakir", providerId: "quran-unlocked" },
  { id: "en-pickthall", language: "en", name: "The Meaning of the Glorious Koran", author: "Mohammed Marmaduke William Pickthall", providerId: "quran-unlocked" },
  { id: "en-qarai", language: "en", name: "The Quran with an English Paraphrase", author: "Ali Quli Qarai", providerId: "quran-unlocked" },
  { id: "yusuf-ali", language: "en", name: "The Meaning of the Holy Quran", author: "Abdullah Yusuf Ali", providerId: "quran-unlocked" }
];
var QuranUnlockedProvider = class {
  constructor(http, cacheEnabled = () => true) {
    this.http = http;
    this.cacheEnabled = cacheEnabled;
    __publicField(this, "metadata", { id: "quran-unlocked", name: "Quran Unlocked", kind: "quran", baseUrl: "https://quran.islamunlocked.com", projectUrl: "https://quran.islamunlocked.com/quran" });
    __publicField(this, "capabilities", { arabicText: true, englishTranslation: true, multipleTranslations: true, collectionListing: false, rangeRetrieval: true, grading: false, metadata: true, directSourceUrls: true, search: false });
    __publicField(this, "cache", new MemoryCacheStore());
    __publicField(this, "rangeLoads", new SingleFlight());
  }
  async listTranslations(_ctx) {
    return TRANSLATIONS.map(normalizeQuranTranslationMetadata);
  }
  async listOfflineDatabases(_ctx) {
    return [];
  }
  async fetchQuran(reference, translation, ctx) {
    if (translation.providerId !== this.metadata.id) throw new AppError("Translation belongs to a different provider.", "validation");
    const numbers = Array.from({ length: reference.endAyah - reference.startAyah + 1 }, (_, i) => reference.startAyah + i);
    const cached = /* @__PURE__ */ new Map();
    if (this.cacheEnabled()) {
      const entries = await Promise.all(numbers.map(async (number) => ({ number, entry: await this.cache.get(this.cacheKey(reference.surah, number, translation.id)) })));
      for (const { number, entry } of entries) if (entry?.value) cached.set(number, structuredClone(entry.value));
    }
    const missing = numbers.filter((number) => !cached.has(number));
    if (missing.length) {
      const ranges = contiguousRanges(missing);
      const fetched = await mapWithConcurrency(ranges, 4, (range) => this.fetchRange(reference.surah, range.start, range.end, translation, ctx));
      for (const result of fetched) {
        for (const ayah of result.ayahs) {
          const value = { surahName: result.surahName, ayah };
          cached.set(ayah.reference.startAyah, value);
          if (this.cacheEnabled()) await setCacheBestEffort(this.cache, { version: 1, key: this.cacheKey(reference.surah, ayah.reference.startAyah, translation.id), storedAt: Date.now(), value });
        }
      }
    }
    const ayahs = numbers.map((number) => cached.get(number)?.ayah).filter((ayah) => Boolean(ayah));
    if (ayahs.length !== numbers.length) throw new AppError("No Quran text was found for the selected reference.", "parse");
    const first = cached.get(reference.startAyah);
    return { kind: "quran", reference, surahName: first?.surahName ?? `Surah ${reference.surah}`, ayahs, source: { providerId: this.metadata.id, providerName: this.metadata.name, sourceUrl: this.makeSourceUrl(reference, translation.id), retrievedAt: (/* @__PURE__ */ new Date()).toISOString(), translationId: translation.id, translationName: translation.name } };
  }
  cacheKey(surah, ayah, translation) {
    return makeCacheKey({ provider: this.metadata.id, surah, ayah, translation });
  }
  makeSourceUrl(reference, translationId) {
    const routeId = translationId === "hilali-khan" ? "en-hilali-khan" : translationId;
    return `${this.metadata.baseUrl}/quran/${routeId}/quran:${reference.surah}:${reference.startAyah}${reference.endAyah > reference.startAyah ? `-${reference.endAyah}` : ""}`;
  }
  fetchRange(surah, startAyah, endAyah, translation, ctx) {
    const sourceReference = { kind: "quran", surah, startAyah, endAyah };
    const sourceUrl = this.makeSourceUrl(sourceReference, translation.id);
    const key = `${sourceUrl}?json`;
    return this.rangeLoads.run(key, async () => {
      const raw = await this.http.getJson(`${sourceUrl}?json`, ctx.signal);
      const parsed = parseQuranUnlockedResponse(raw.json, sourceReference, translation);
      if (parsed.ayahs.length === 0) throw new AppError("No Quran text was found for the selected reference.", "parse", raw.status);
      return { ...parsed, source: { providerId: this.metadata.id, providerName: this.metadata.name, sourceUrl, retrievedAt: (/* @__PURE__ */ new Date()).toISOString(), translationId: translation.id, translationName: translation.name } };
    });
  }
  async healthCheck(ctx) {
    const started = performance.now();
    try {
      const r = await this.http.getJson(`${this.metadata.baseUrl}/quran/en-hilali-khan/quran:1:1?json`, ctx.signal);
      return { providerId: this.metadata.id, ok: true, status: r.status, latencyMs: Math.round(performance.now() - started) };
    } catch (e) {
      const err = e;
      return { providerId: this.metadata.id, ok: false, status: err.status, latencyMs: Math.round(performance.now() - started), errorKind: ["network", "http", "timeout", "parse", "unknown"].includes(err.kind) ? err.kind : "unknown", message: err.userMessage };
    }
  }
};

// src/core/languages.ts
var LANGUAGE_ALIASES = {
  arabic: "ar",
  bengali: "bn",
  english: "en",
  french: "fr",
  german: "de",
  hindi: "hi",
  indonesian: "id",
  malay: "ms",
  persian: "fa",
  russian: "ru",
  spanish: "es",
  tamil: "ta",
  telugu: "te",
  turkish: "tr",
  urdu: "ur"
};
var FALLBACK_LANGUAGE_NAMES = {
  ar: "Arabic",
  bn: "Bengali",
  de: "German",
  en: "English",
  es: "Spanish",
  fa: "Persian",
  fr: "French",
  ha: "Hausa",
  hi: "Hindi",
  id: "Indonesian",
  it: "Italian",
  ko: "Korean",
  ku: "Kurdish",
  ml: "Malayalam",
  ms: "Malay",
  nl: "Dutch",
  no: "Norwegian",
  pt: "Portuguese",
  ru: "Russian",
  sd: "Sindhi",
  so: "Somali",
  sv: "Swedish",
  ta: "Tamil",
  te: "Telugu",
  tr: "Turkish",
  ur: "Urdu",
  uz: "Uzbek",
  zh: "Chinese"
};
var displayNames = typeof Intl !== "undefined" && "DisplayNames" in Intl ? new Intl.DisplayNames(["en"], { type: "language" }) : null;
function normalizeLanguageCode(value) {
  const trimmed = value.trim();
  const normalized = trimmed.toLowerCase();
  if (LANGUAGE_ALIASES[normalized]) return LANGUAGE_ALIASES[normalized];
  if (/^[a-z]{2,3}$/u.test(normalized)) return normalized;
  return trimmed;
}
function languageName(value) {
  const code = normalizeLanguageCode(value);
  try {
    const display = displayNames?.of(code);
    if (display) return display;
  } catch {
  }
  return FALLBACK_LANGUAGE_NAMES[code.toLowerCase()] || (value.trim() || code);
}

// src/providers/alquran-cloud/provider.ts
var BASE_URL = "https://api.alquran.cloud/v1";
var ARABIC_EDITION = "quran-uthmani";
function records(raw) {
  return typeof raw === "object" && raw !== null ? raw : void 0;
}
function str(value) {
  return typeof value === "string" && value.trim() ? value.trim() : void 0;
}
function editionsFrom(raw) {
  const r = records(raw);
  return r && Array.isArray(r.data) ? r.data.filter((x) => typeof x === "object" && x !== null) : [];
}
function surahFrom(raw) {
  const r = records(raw);
  return r && records(r.data) ? r.data : void 0;
}
function ayahEditionsFrom(raw) {
  const r = records(raw);
  if (!r) return [];
  const data = r.data;
  if (Array.isArray(data)) return data.filter((x) => typeof x === "object" && x !== null);
  if (records(data)) return [data];
  return [];
}
var AlQuranCloudProvider = class {
  constructor(http, cacheEnabled = () => true) {
    this.http = http;
    this.cacheEnabled = cacheEnabled;
    __publicField(this, "metadata", { id: "alquran-cloud", name: "Al Quran Cloud", kind: "quran", baseUrl: "https://alquran.cloud", projectUrl: "https://alquran.cloud" });
    __publicField(this, "capabilities", { arabicText: true, englishTranslation: true, multipleTranslations: true, collectionListing: false, rangeRetrieval: true, grading: false, metadata: true, directSourceUrls: true, search: false });
    __publicField(this, "cache", new MemoryCacheStore());
    __publicField(this, "ayahLoads", new SingleFlight());
    __publicField(this, "surahLoads", new SingleFlight());
    __publicField(this, "translationsCache", null);
  }
  async listTranslations(ctx) {
    if (this.translationsCache) return this.translationsCache.map((x) => ({ ...x }));
    const raw = await this.http.getJson(`${BASE_URL}/edition/type/translation`, ctx.signal);
    const translations = editionsFrom(raw.json).filter((e) => e.format === "text" && e.type === "translation" && !!str(e.identifier)).map((e) => normalizeQuranTranslationMetadata({ id: str(e.identifier), language: normalizeLanguageCode(str(e.language) ?? "unknown"), name: str(e.name) ?? str(e.englishName) ?? str(e.identifier), author: str(e.englishName) ?? str(e.name) ?? str(e.identifier), providerId: this.metadata.id }));
    if (!translations.length) throw new AppError("No Quran translations were found from Al Quran Cloud.", "parse", raw.status);
    translations.sort((a, b) => a.id === "en.hilali" ? -1 : b.id === "en.hilali" ? 1 : a.name.localeCompare(b.name));
    this.translationsCache = translations;
    return translations.map((x) => ({ ...x }));
  }
  async listOfflineDatabases(_ctx) {
    return [];
  }
  async fetchQuran(reference, translation, ctx) {
    if (translation.providerId !== this.metadata.id) throw new AppError("Translation belongs to a different provider.", "validation");
    const numbers = Array.from({ length: reference.endAyah - reference.startAyah + 1 }, (_, index) => reference.startAyah + index);
    const cached = /* @__PURE__ */ new Map();
    if (this.cacheEnabled()) {
      const entries = await Promise.all(numbers.map(async (number) => ({ number, entry: await this.cache.get(this.cacheKey(reference.surah, number, translation.id)) })));
      for (const { number, entry } of entries) if (entry?.value) cached.set(number, structuredClone(entry.value));
    }
    const missing = numbers.filter((number) => !this.hasComplete(cached.get(number)?.ayah));
    if (missing.length) {
      if (shouldFetchWholeQuranSurah(reference, missing.length, 2, 2, 4)) {
        const [arabicRaw, translationRaw] = await Promise.all([
          this.loadSurah(reference.surah, ARABIC_EDITION, ctx),
          this.loadSurah(reference.surah, translation.id, ctx)
        ]);
        this.seedFromSurahs(reference.surah, reference, translation, arabicRaw, translationRaw, cached);
      } else {
        const fetched = await mapWithConcurrency(missing, 4, (number) => this.fetchAyah(reference.surah, number, translation, ctx));
        for (const value of fetched) cached.set(value.ayah.reference.startAyah, value);
        if (this.cacheEnabled()) {
          for (const value of fetched) await setCacheBestEffort(this.cache, { version: 1, key: this.cacheKey(reference.surah, value.ayah.reference.startAyah, translation.id), storedAt: Date.now(), value });
        }
      }
    }
    const ayahs = numbers.map((number) => cached.get(number)?.ayah).filter((ayah) => Boolean(ayah));
    if (ayahs.length !== numbers.length || !ayahs.some((ayah) => ayah.arabic || ayah.translation)) throw new AppError("No Quran text was found for the selected reference.", "parse");
    const first = cached.get(reference.startAyah);
    return {
      kind: "quran",
      reference,
      surahName: first?.surahName ?? `Surah ${reference.surah}`,
      ayahs,
      source: { providerId: this.metadata.id, providerName: this.metadata.name, sourceUrl: this.makeSourceUrl(reference, translation.id), retrievedAt: (/* @__PURE__ */ new Date()).toISOString(), translationId: translation.id, translationName: translation.name }
    };
  }
  cacheKey(surah, ayah, translation) {
    return makeCacheKey({ provider: this.metadata.id, surah, ayah, translation });
  }
  hasComplete(ayah) {
    return Boolean(ayah?.arabic && ayah.translation?.text);
  }
  makeSourceUrl(reference, translationId) {
    if (reference.startAyah === reference.endAyah) return `${BASE_URL}/ayah/${reference.surah}:${reference.startAyah}/editions/${encodeURIComponent(translationId)}`;
    return `${BASE_URL}/surah/${reference.surah}/${encodeURIComponent(translationId)}`;
  }
  fetchAyahUrl(surah, ayah, edition) {
    return `${BASE_URL}/ayah/${surah}:${ayah}/${encodeURIComponent(edition)}`;
  }
  fetchAyah(surah, ayah, translation, ctx) {
    const key = `${surah}:${ayah}:${translation.id}`;
    return this.ayahLoads.run(key, async () => {
      const reference = { kind: "quran", surah, startAyah: ayah, endAyah: ayah };
      const [arabicRaw, translationRaw] = await Promise.all([
        this.http.getJson(this.fetchAyahUrl(surah, ayah, ARABIC_EDITION), ctx.signal),
        this.http.getJson(this.fetchAyahUrl(surah, ayah, translation.id), ctx.signal)
      ]);
      const arabicEntry = this.parseSingleAyah(arabicRaw.json, ARABIC_EDITION);
      const translationEntry = this.parseSingleAyah(translationRaw.json, translation.id);
      const arabic = arabicEntry.text;
      const translated = translationEntry.text;
      const surahName = arabicEntry.surahName ?? translationEntry.surahName;
      if (!arabic && !translated) throw new AppError("No Quran text was found for the selected reference.", "parse", translationRaw.status);
      return { surahName: surahName ?? `Surah ${surah}`, ayah: { reference, ...arabic ? { arabic } : {}, ...translated ? { translation: { id: translation.id, language: translation.language, name: translation.name, text: translated, providerId: this.metadata.id } } : {} } };
    });
  }
  loadSurah(surah, edition, ctx) {
    return this.surahLoads.run(`${surah}:${edition}`, async () => {
      const raw = await this.http.getJson(`${BASE_URL}/surah/${surah}/${encodeURIComponent(edition)}`, ctx.signal);
      return surahFrom(raw.json);
    });
  }
  parseSingleAyah(raw, expectedEdition) {
    const entries = ayahEditionsFrom(raw);
    for (const entry of entries) {
      const edition = records(entry.edition);
      const nestedAyah = records(entry.ayah);
      const ayah = nestedAyah ?? entry;
      const id = str(entry.identifier) ?? str(edition?.identifier);
      if (id !== expectedEdition) continue;
      const surah = records(ayah.surah) ?? records(entry.surah);
      return { text: str(ayah.text), surahName: str(surah?.englishName) ?? str(surah?.name) };
    }
    return {};
  }
  seedFromSurahs(surah, reference, translation, arabic, translated, cached) {
    const arabicMap = new Map((arabic?.ayahs ?? []).map((item) => [item.numberInSurah ?? -1, item.text ?? ""]));
    const translationMap = new Map((translated?.ayahs ?? []).map((item) => [item.numberInSurah ?? -1, item.text ?? ""]));
    const surahName = str(translated?.englishName) ?? str(arabic?.englishName) ?? `Surah ${surah}`;
    const numbers = /* @__PURE__ */ new Set([...arabicMap.keys(), ...translationMap.keys()]);
    for (const number of numbers) {
      if (number < 1) continue;
      const arabicText = str(arabicMap.get(number));
      const translatedText = str(translationMap.get(number));
      if (!arabicText && !translatedText) continue;
      const value = { surahName, ayah: { reference: { kind: "quran", surah, startAyah: number, endAyah: number }, ...arabicText ? { arabic: arabicText } : {}, ...translatedText ? { translation: { id: translation.id, language: translation.language, name: translation.name, text: translatedText, providerId: this.metadata.id } } : {} } };
      cached.set(number, value);
      if (this.cacheEnabled()) void setCacheBestEffort(this.cache, { version: 1, key: this.cacheKey(surah, number, translation.id), storedAt: Date.now(), value });
    }
    if (!numbers.size && reference.startAyah <= reference.endAyah) throw new AppError("No Quran text was found for the selected reference.", "parse");
  }
  async healthCheck(ctx) {
    const started = performance.now();
    try {
      const r = await this.http.getJson(`${BASE_URL}/ayah/1:1/quran-uthmani`, ctx.signal);
      return { providerId: this.metadata.id, ok: true, status: r.status, latencyMs: Math.round(performance.now() - started) };
    } catch (e) {
      const err = e;
      return { providerId: this.metadata.id, ok: false, status: err.status, latencyMs: Math.round(performance.now() - started), errorKind: ["network", "http", "timeout", "parse", "unknown"].includes(err.kind) ? err.kind : "unknown", message: err.userMessage };
    }
  }
};

// src/providers/hadith-unlocked/parser.ts
function isRecord2(value) {
  return typeof value === "object" && value !== null;
}
function str2(value) {
  return typeof value === "string" && value.trim() ? value.trim() : void 0;
}
function scalarText(value) {
  if (typeof value === "string") return value.trim() || void 0;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return void 0;
}
function decodeEntities(value) {
  return value.replace(/&#39;|&#x27;|&apos;/gi, "'").replace(/&quot;|&#x22;/gi, '"').replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").trim();
}
function nestedText(value, keys) {
  const direct = str2(value);
  if (direct) return direct;
  if (!isRecord2(value)) return void 0;
  for (const key of keys) {
    const candidate = str2(value[key]);
    if (candidate) return candidate;
  }
  return void 0;
}
function extractArabicIsnad(item) {
  const candidates = [
    nestedText(item.isnad_ar, ["text", "body", "arabic", "ar"]),
    nestedText(item.arabic_isnad, ["text", "body", "arabic", "ar"]),
    nestedText(item.chain_ar, ["text", "body", "arabic", "ar"]),
    nestedText(item.sanad_ar, ["text", "body", "arabic", "ar"]),
    nestedText(item.isnad, ["text", "body", "arabic", "ar"]),
    nestedText(item.chain, ["text", "body", "arabic", "ar"]),
    nestedText(item.sanad, ["text", "body", "arabic", "ar"])
  ];
  return candidates.find((value) => Boolean(value && /[\u0600-\u06FF]/u.test(value)));
}
function extractEnglishIsnad(item) {
  const candidates = [nestedText(item.isnad_en, ["text", "body", "english", "en"]), nestedText(item.english_isnad, ["text", "body", "english", "en"]), nestedText(item.chain_en, ["text", "body", "english", "en"]), nestedText(item.chain, ["text", "body", "english", "en"])];
  return candidates.find((value) => Boolean(value));
}
function referenceKey(value) {
  const text2 = scalarText(value);
  return text2?.toLowerCase();
}
function itemMatchesReference(item, reference) {
  const target = String(reference.hadithNumber).trim().toLowerCase();
  const expectedRef = `${reference.collectionId}:${target}`.toLowerCase();
  const source = isRecord2(item.source) ? item.source : void 0;
  const refs = [item.ref, source?.ref];
  if (refs.some((value) => referenceKey(value) === expectedRef)) return true;
  const numbers = [item.number, item.num];
  return numbers.some((value) => referenceKey(value) === target);
}
function bookEntries(raw) {
  if (!isRecord2(raw) || !Array.isArray(raw.chapters)) return void 0;
  const entries = [];
  for (const chapter of raw.chapters) {
    if (!isRecord2(chapter) || !Array.isArray(chapter.sections)) continue;
    for (const section of chapter.sections) {
      if (!isRecord2(section) || !Array.isArray(section.items)) continue;
      const sectionNumber = scalarText(section.number);
      for (const item of section.items) {
        if (isRecord2(item)) entries.push({ item, section: sectionNumber });
      }
    }
  }
  return entries;
}
function apiCandidates(raw) {
  const candidates = [];
  if (Array.isArray(raw)) candidates.push(...raw.filter(isRecord2));
  else if (isRecord2(raw) && Array.isArray(raw.result)) candidates.push(...raw.result.filter(isRecord2));
  else if (isRecord2(raw)) candidates.push(raw);
  return candidates;
}
function pickItem(raw, reference) {
  const entries = bookEntries(raw);
  if (entries) {
    const exact = entries.find((entry) => itemMatchesReference(entry.item, reference));
    if (exact) return exact.item;
    const target = String(reference.hadithNumber).trim().toLowerCase();
    return entries.find((entry) => entry.section?.toLowerCase() === target)?.item;
  }
  const candidates = apiCandidates(raw);
  return candidates.find((item) => itemMatchesReference(item, reference)) ?? candidates[0];
}
function gradeTextAndGrader(raw, item) {
  const obj = isRecord2(raw) ? raw : void 0;
  let text2 = str2(obj?.grade_en) ?? str2(obj?.grade) ?? str2(item.grade_grade_en) ?? str2(item.grade_grade);
  let grader = str2(obj?.shortName_en) ?? str2(obj?.grader_en) ?? str2(obj?.name_en) ?? str2(obj?.source_en) ?? str2(item.grader_shortName_en) ?? str2(item.grader_name_en) ?? str2(item.graded_by_en) ?? str2(obj?.shortName) ?? str2(obj?.grader) ?? str2(obj?.name) ?? str2(obj?.source) ?? str2(item.grader_shortName) ?? str2(item.grader_name) ?? str2(item.graded_by);
  if (!text2) return {};
  const match = text2.match(/^(.*?)\s*\(([^()]{2,120})\)\s*$/);
  const gradePart = match?.[1]?.trim();
  const graderPart = match?.[2]?.trim();
  if (!grader && gradePart && graderPart) {
    text2 = gradePart;
    grader = graderPart;
  }
  return { text: text2, grader };
}
function gradeFromItem(item) {
  const rawGrades = [];
  if (Array.isArray(item.grades)) rawGrades.push(...item.grades);
  const metadata = isRecord2(item.metadata) ? item.metadata : void 0;
  if (Array.isArray(metadata?.grades)) rawGrades.push(...metadata.grades);
  if (item.grade !== void 0) rawGrades.push(item.grade);
  if (!rawGrades.length && (str2(item.grade_grade_en) || str2(item.grade_grade))) rawGrades.push(item);
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  for (const raw of rawGrades) {
    const { text: text2, grader } = gradeTextAndGrader(raw, item);
    if (!text2) continue;
    const key = `${grader?.normalize("NFKC").trim().toLocaleLowerCase("en-US") ?? ""}\0${text2.normalize("NFKC").trim().toLocaleLowerCase("en-US")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ id: `grade:${key}`, text: text2, ...grader ? { author: grader } : {} });
  }
  return out;
}
function parseHadithUnlockedResponse(raw, reference, collection, sourceUrl) {
  const item = pickItem(raw, reference);
  const collectionName = decodeEntities(collection.name);
  if (!item) return { kind: "hadith", reference, collectionName, grades: [], source: { providerId: collection.providerId, providerName: "Hadith Unlocked", sourceUrl, retrievedAt: (/* @__PURE__ */ new Date()).toISOString(), collectionId: collection.id, collectionName } };
  const result = { kind: "hadith", reference, collectionName, grades: gradeFromItem(item), source: { providerId: collection.providerId, providerName: "Hadith Unlocked", sourceUrl, retrievedAt: (/* @__PURE__ */ new Date()).toISOString(), collectionId: collection.id, collectionName } };
  const text2 = (value) => value ? decodeEntities(value) : void 0;
  const arabic = text2(str2(item.body) ?? str2(item.body_ar) ?? str2(item.text_arabic) ?? str2(item.full_arabic) ?? nestedText(item.text, ["ar", "arabic"]));
  const english = text2(str2(item.body_en) ?? str2(item.text_english) ?? str2(item.full_english) ?? nestedText(item.text, ["en", "english"]));
  const arabicIsnad = text2(extractArabicIsnad(item));
  const englishIsnad = text2(extractEnglishIsnad(item));
  const title = text2(nestedText(item.title, ["en", "english"]) ?? str2(item.title_en));
  if (title) result.title = title;
  if (arabicIsnad) result.arabicIsnad = arabicIsnad;
  if (englishIsnad) result.englishIsnad = englishIsnad;
  if (arabic) result.arabic = arabic;
  if (english) result.english = english;
  return result;
}

// src/providers/hadith-unlocked/collections.ts
var HADITH_UNLOCKED_COLLECTIONS = [
  { id: "ibnrajab50", name: "Jami' Al-Ulum wal-Hikam", providerId: "hadith-unlocked", author: "Abd Al-Rahman Ibn Ahmad Ibn Rajab Al-Hanbali" },
  { id: "riyad", name: "Riyad As-Salihin", providerId: "hadith-unlocked", author: "Abu Zakariyya Yahya Ibn Sharaf Al-Nawawi" },
  { id: "adab", name: "Al-Adab Al-Mufrad", providerId: "hadith-unlocked", author: "Abu Abdullah Muhammad Ibn Ismail Al-Bukhari" },
  { id: "shamail", name: "Ash-Shama'il Al-Muhammadiyyah", providerId: "hadith-unlocked", author: "Abu Isa Muhammad Ibn Isa Al-Tirmidhi" },
  { id: "lulu-marjan", name: "Al-Lu'lu' wal-Marjan", providerId: "hadith-unlocked", author: "Muhammad Fuad Abd Al-Baqi" },
  { id: "bukhari", name: "Sahih Al-Bukhari", providerId: "hadith-unlocked", author: "Muhammad Ibn Ismail Al-Bukhari" },
  { id: "muslim", name: "Sahih Al-Muslim", providerId: "hadith-unlocked", author: "Muslim Ibn Al-Hajjaj" },
  { id: "abudawud", name: "Sunan Abi Dawud", providerId: "hadith-unlocked", author: "Abu Dawud Sulayman Ibn Ishaq Al-Sijistani" },
  { id: "tirmidhi", name: "Sunan At-Tirmidhi", providerId: "hadith-unlocked", author: "Abu Isa Muhammad Ibn Isa Al-Tirmidhi" },
  { id: "nasai", name: "Sunan An-Nasa'i", providerId: "hadith-unlocked", author: "Abu Abd Al-Rahman Ahmad Al-Nasai" },
  { id: "ibnmajah", name: "Sunan Ibn Majah", providerId: "hadith-unlocked", author: "Abu Abdullah Muhammad Ibn Yazid Ibn Majah Al-Qazwini" },
  { id: "darimi", name: "Sunan Ad-Darimi", providerId: "hadith-unlocked", author: "Abu Muhammad Abdullah Ibn Abd Al-Rahman Al-Darimi Al-Samarqandi" },
  { id: "ahmad", name: "Musnad Ahmad", providerId: "hadith-unlocked", author: "Abu Abdullah Ahmad Ibn Hanbal" },
  { id: "malik", name: "Muwatta Malik", providerId: "hadith-unlocked", author: "Malik Ibn Anas" },
  { id: "hakim", name: "Al-Mustadrak", providerId: "hadith-unlocked", author: "Abu Abdullah Muhammad Ibn Abdullah Al-Hakim Al-Naysaburi" },
  { id: "ibnhibban", name: "Sahih Ibn Hibban", providerId: "hadith-unlocked", author: "Muhammad Ibn Hibban Al-Busti" },
  { id: "ibnkhuzaymah", name: "Sahih Ibn Khuzaymah", providerId: "hadith-unlocked", author: "Abu Bakr Muhammad Ibn Ishaq Ibn Khuzaymah" },
  { id: "bazzar", name: "Musnad Al-Bazzar", providerId: "hadith-unlocked", author: "Abu Bakr Ahmad Ibn Amr Al-Bazzar" },
  { id: "daraqutni", name: "Sunan Ad-Daraqutni", providerId: "hadith-unlocked", author: "Abu Al-Hasan Ali Ibn Umar Al-Daraqutni" },
  { id: "abdalrazzaq", name: "Musannaf Abd Ar-Razzaq", providerId: "hadith-unlocked", author: "Abu Bakr Abd Al-Razzaq Ibn Hammam Al-Sanani" },
  { id: "ibnabishaybah", name: "Musannaf Ibn Abi Shaybah", providerId: "hadith-unlocked", author: "Abu Bakr Abdullah Ibn Muhammad Ibn Abu Shaybah" },
  { id: "nasai-kubra", name: "As-Sunan Al-Kubra (An-Nasa'i)", providerId: "hadith-unlocked", author: "Abu Abd Al-Rahman Ahmad Al-Nasai" },
  { id: "bayhaqi", name: "As-Sunan Al-Kubra (Al-Bayhaqi)", providerId: "hadith-unlocked", author: "Abu Bakr Ahmad Ibn Al-Husayn Al-Bayhaqi" },
  { id: "tayalisi", name: "Musnad At-Tayalisi", providerId: "hadith-unlocked", author: "Abu Dawud Sulayman Ibn Dawud Al-Tayalisi" },
  { id: "abuyaala", name: "Musnad Abu Ya'la", providerId: "hadith-unlocked", author: "Abu Yaala Ahmad Ibn Ali Al-Mawsili" },
  { id: "matalib", name: "Al-Matalib Al-Aliya", providerId: "hadith-unlocked", author: "Ibn Hajar Al-Asqalani" },
  { id: "tabarani-saghir", name: "Al-Mu'jam As-Saghir", providerId: "hadith-unlocked", author: "Abu Al-Qasim Sulayman Ibn Ahmad Al-Tabarani" },
  { id: "tabarani-awsat", name: "Al-Mu'jam Al-Awsat", providerId: "hadith-unlocked", author: "Abu Al-Qasim Sulayman Ibn Ahmad Al-Tabarani" },
  { id: "tabarani", name: "Al-Mu'jam Al-Kabir", providerId: "hadith-unlocked", author: "Abu Al-Qasim Sulayman Ibn Ahmad Al-Tabarani" },
  { id: "suyuti", name: "Suyuti", providerId: "hadith-unlocked", author: "Jalal Al-Din Abd Al-Rahman Ibn Abi Bakr Al-Suyuti" }
];

// src/providers/hadith-unlocked/provider.ts
var HadithUnlockedProvider = class {
  constructor(http, cacheEnabled = () => true, offline) {
    this.http = http;
    this.cacheEnabled = cacheEnabled;
    this.offline = offline;
    __publicField(this, "metadata", { id: "hadith-unlocked", name: "Hadith Unlocked", kind: "hadith", baseUrl: "https://hadithunlocked.com", projectUrl: "https://hadithunlocked.com" });
    __publicField(this, "capabilities", { arabicText: true, englishTranslation: true, multipleTranslations: false, collectionListing: true, rangeRetrieval: true, grading: true, metadata: true, directSourceUrls: true, search: true });
    __publicField(this, "cache", new MemoryCacheStore());
    __publicField(this, "hadithLoads", new SingleFlight());
    __publicField(this, "installedBooks", /* @__PURE__ */ new Map());
    __publicField(this, "maxMemoryBooks", 2);
    __publicField(this, "collectionsCache", null);
  }
  async listCollections(_ctx) {
    if (!this.collectionsCache) this.collectionsCache = HADITH_UNLOCKED_COLLECTIONS.map((x) => normalizeHadithCollectionMetadata(x));
    return this.collectionsCache.map((x) => ({ ...x }));
  }
  async listTranslations(_ctx) {
    return [{ id: "en", language: "en", name: "English", providerId: this.metadata.id }];
  }
  async listOfflineDatabases(_ctx) {
    return (await this.listCollections(_ctx)).map((c) => ({ id: `hadith-unlocked:${c.id}`, providerId: this.metadata.id, kind: "hadith", label: c.name, description: `Complete Arabic and English ${c.name} database from Hadith Unlocked.`, parts: [{ id: "book", label: c.name, url: `${this.metadata.baseUrl}/${c.id}.json`, fileName: "book.json" }] }));
  }
  /**
   * Read an installed book through a small LRU cache. Parsing a complete Hadith
   * Unlocked book is the expensive part of an offline lookup, so repeated single
   * fetches keep the parsed book in memory. `revision()` invalidates the entry when
   * the database is reinstalled or removed; stores without it keep the entry for
   * the session.
   */
  async loadInstalledBook(collectionId) {
    const store = this.offline;
    if (!store) return null;
    const databaseId = `hadith-unlocked:${collectionId}`;
    const caching = this.cacheEnabled();
    const revision = caching && store.revision ? await store.revision(databaseId) : void 0;
    if (!caching) {
      this.installedBooks.clear();
      const data2 = await store.getJson(databaseId, "book");
      return data2 ?? null;
    }
    const cached = this.installedBooks.get(collectionId);
    if (cached && (revision === void 0 || cached.revision === revision)) {
      this.installedBooks.delete(collectionId);
      this.installedBooks.set(collectionId, cached);
      return cached.data;
    }
    if (revision === null) {
      this.installedBooks.delete(collectionId);
      return null;
    }
    const data = await store.getJson(databaseId, "book");
    if (data === null || data === void 0) {
      this.installedBooks.delete(collectionId);
      return null;
    }
    this.installedBooks.set(collectionId, { revision, data });
    while (this.installedBooks.size > this.maxMemoryBooks) {
      const oldest = this.installedBooks.keys().next().value;
      if (oldest === void 0) break;
      this.installedBooks.delete(oldest);
    }
    return data;
  }
  parseInstalled(raw, reference, collection) {
    const pageUrl = `${this.metadata.baseUrl}/${reference.collectionId}:${reference.hadithNumber}`;
    const result = parseHadithUnlockedResponse(raw, reference, collection, pageUrl);
    if (!result.arabic && !result.english) {
      throw new AppError(`Hadith ${reference.hadithNumber} was not found in the installed ${collection.name} offline database.`, "parse");
    }
    return result;
  }
  async fetchHadith(reference, translation, ctx) {
    const key = makeCacheKey({ provider: this.metadata.id, collection: reference.collectionId, hadith: reference.hadithNumber, translation: translation.id });
    return this.hadithLoads.run(key, async () => {
      const collections = await this.listCollections(ctx);
      const collection = collections.find((x) => x.id === reference.collectionId);
      if (!collection) throw new AppError("Unknown collection.", "validation");
      if (translation.providerId !== this.metadata.id || translation.id !== "en") throw new AppError("Translation is not supported by Hadith Unlocked.", "validation");
      const pageUrl = `${this.metadata.baseUrl}/${reference.collectionId}:${reference.hadithNumber}`;
      const offline = await this.loadInstalledBook(collection.id);
      if (offline !== null && offline !== void 0) return this.parseInstalled(offline, reference, collection);
      if (this.cacheEnabled()) {
        const cached = await this.cache.get(key);
        if (cached) return structuredClone(cached.value);
      }
      const raw = (await this.http.getJson(`${pageUrl}?json`, ctx.signal)).json;
      const result = parseHadithUnlockedResponse(raw, reference, collection, pageUrl);
      if (this.cacheEnabled()) await setCacheBestEffort(this.cache, { version: 1, key, storedAt: Date.now(), value: result });
      return result;
    });
  }
  async fetchHadithRange(reference, translation, ctx) {
    const end = reference.endHadithNumber ?? reference.hadithNumber;
    if (end === reference.hadithNumber) return [await this.fetchHadith(reference, translation, ctx)];
    if (typeof reference.hadithNumber !== "number" || typeof end !== "number") {
      throw new AppError("Alphabetic Hadith ranges are not supported.", "validation");
    }
    const collection = (await this.listCollections(ctx)).find((x) => x.id === reference.collectionId);
    if (!collection) throw new AppError("Unknown collection.", "validation");
    if (translation.providerId !== this.metadata.id || translation.id !== "en") throw new AppError("Translation is not supported by Hadith Unlocked.", "validation");
    const offline = await this.loadInstalledBook(collection.id);
    if (offline !== null && offline !== void 0) {
      const results2 = [];
      for (let hadithNumber = reference.hadithNumber; hadithNumber <= end; hadithNumber++) {
        results2.push(this.parseInstalled(offline, { kind: "hadith", collectionId: reference.collectionId, hadithNumber }, collection));
      }
      return results2;
    }
    const results = [];
    const concurrency = 4;
    for (let start = reference.hadithNumber; start <= end; start += concurrency) {
      const batch = Array.from({ length: Math.min(concurrency, end - start + 1) }, (_, index) => start + index);
      const batchResults = await Promise.all(batch.map((hadithNumber) => this.fetchHadith({ kind: "hadith", collectionId: reference.collectionId, hadithNumber }, translation, ctx)));
      results.push(...batchResults);
    }
    return results;
  }
  async healthCheck(ctx) {
    const started = performance.now();
    try {
      const r = await this.http.getJson(`${this.metadata.baseUrl}/bukhari:1?json`, ctx.signal);
      return { providerId: this.metadata.id, ok: true, status: r.status, latencyMs: Math.round(performance.now() - started) };
    } catch (e) {
      const err = e;
      return { providerId: this.metadata.id, ok: false, status: err.status, latencyMs: Math.round(performance.now() - started), errorKind: ["network", "http", "timeout", "parse", "unknown"].includes(err.kind) ? err.kind : "unknown", message: err.userMessage };
    }
  }
};

// src/providers/hadith-api/parser.ts
function gradeKey(value) {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim().toLocaleLowerCase("en-US");
}
function str3(value) {
  return typeof value === "string" && value.trim() ? value.trim() : void 0;
}
function isRecord3(value) {
  return typeof value === "object" && value !== null;
}
function normalizeGrades(value) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((g) => {
    if (!isRecord3(g)) return [];
    const grade = str3(g.grade) ?? str3(g.text) ?? str3(g.grade_en) ?? str3(g.grade_ar);
    const name = str3(g.name) ?? str3(g.grader) ?? str3(g.author) ?? str3(g.source) ?? str3(g.name_en) ?? str3(g.name_ar) ?? str3(g.grader_en) ?? str3(g.grader_ar);
    return grade ? [{ name, grade }] : [];
  });
}
function gradesFromHadith(...hadiths) {
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  for (const hadith of hadiths) {
    for (const g of normalizeGrades(hadith?.grades)) {
      if (!g.grade) continue;
      const key = `${gradeKey(g.name ?? "")}\0${gradeKey(g.grade)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ id: key, text: g.grade, ...g.name ? { author: g.name } : {} });
    }
  }
  return out;
}
function parseHadithApiResponse(arabicRaw, englishRaw, reference, collectionName, providerId, translation) {
  const arHadith = selectHadith(arabicRaw, reference.hadithNumber);
  const enHadith = selectHadith(englishRaw, reference.hadithNumber);
  const ar = arHadith?.text;
  const grades = gradesFromHadith(enHadith, arHadith);
  const result = { kind: "hadith", reference, collectionName, grades, source: { providerId, providerName: providerId, sourceUrl: `https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/editions/${translation?.id ?? "eng"}-${reference.collectionId}/${reference.hadithNumber}.min.json`, retrievedAt: (/* @__PURE__ */ new Date()).toISOString(), collectionId: reference.collectionId, collectionName } };
  if (ar) result.arabic = ar;
  if (enHadith?.text) result.english = enHadith.text;
  return result;
}
function selectHadith(raw, no) {
  if (!raw || typeof raw !== "object") return void 0;
  const root = raw;
  const target = String(no).trim().toLowerCase();
  const matches = (h) => h != null && String(h.hadithnumber ?? "").trim().toLowerCase() === target;
  return root.hadiths?.find(matches) ?? ("hadithnumber" in root && matches(root) ? root : void 0);
}

// src/providers/hadith-api/collections.ts
var HADITH_API_COLLECTIONS = [
  { id: "abudawud", name: "Sunan Abi Dawud", providerId: "hadith-api", author: "Abu Dawud Sulayman Ibn Al-Ashath Al-Sijistani", arabicEdition: "ara-abudawud", englishEdition: "eng-abudawud" },
  { id: "bukhari", name: "Sahih Al-Bukhari", providerId: "hadith-api", author: "Muhammad Ibn Ismail Al-Bukhari", arabicEdition: "ara-bukhari", englishEdition: "eng-bukhari" },
  { id: "dehlawi", name: "Forty Hadith of Shah Waliullah Dehlawi", providerId: "hadith-api", author: "Shah Waliullah Al-Dihlawi", arabicEdition: "ara-dehlawi", englishEdition: "eng-dehlawi" },
  { id: "ibnmajah", name: "Sunan Ibn Majah", providerId: "hadith-api", author: "Muhammad Ibn Yazid Ibn Majah Al-Qazwini", arabicEdition: "ara-ibnmajah", englishEdition: "eng-ibnmajah" },
  { id: "malik", name: "Muwatta Malik", providerId: "hadith-api", author: "Malik Ibn Anas", arabicEdition: "ara-malik", englishEdition: "eng-malik" },
  { id: "muslim", name: "Sahih Al-Muslim", providerId: "hadith-api", author: "Muslim Ibn Al-Hajjaj Al-Naysaburi", arabicEdition: "ara-muslim", englishEdition: "eng-muslim" },
  { id: "nasai", name: "Sunan An-Nasa'i", providerId: "hadith-api", author: "Ahmad Ibn Shuayb Al-Nasai", arabicEdition: "ara-nasai", englishEdition: "eng-nasai" },
  { id: "nawawi", name: "Forty Hadith of an-Nawawi", providerId: "hadith-api", author: "Yahya Ibn Sharaf Al-Nawawi", arabicEdition: "ara-nawawi", englishEdition: "eng-nawawi" },
  { id: "qudsi", name: "Forty Hadith Qudsi", providerId: "hadith-api", author: "Ezzeddin Ibrahim", arabicEdition: "ara-qudsi", englishEdition: "eng-qudsi" },
  { id: "tirmidhi", name: "Sunan At-Tirmidhi", providerId: "hadith-api", author: "Abu Isa Muhammad Ibn Isa Al-Tirmidhi", arabicEdition: "ara-tirmidhi", englishEdition: "eng-tirmidhi" }
];

// src/providers/hadith-api/provider.ts
var BASE = "https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1";
var EDITIONS_URL = `${BASE}/editions.min.json`;
function languageCode(value, fallback) {
  const map = { english: "en", bengali: "bn", french: "fr", indonesian: "id", russian: "ru", turkish: "tr", urdu: "ur", persian: "fa" };
  return map[value.toLowerCase()] ?? fallback;
}
var HadithApiProvider = class {
  constructor(http, cacheEnabled = () => true, offline) {
    this.http = http;
    this.cacheEnabled = cacheEnabled;
    this.offline = offline;
    __publicField(this, "metadata", { id: "hadith-api", name: "hadith-api", kind: "hadith", baseUrl: BASE, projectUrl: "https://github.com/fawazahmed0/hadith-api" });
    __publicField(this, "capabilities", { arabicText: true, englishTranslation: true, multipleTranslations: true, collectionListing: true, rangeRetrieval: true, grading: true, metadata: true, directSourceUrls: true, search: false });
    __publicField(this, "cache", new MemoryCacheStore());
    __publicField(this, "hadithLoads", new SingleFlight());
    __publicField(this, "collectionsCache", null);
    __publicField(this, "translationsCache", null);
  }
  async listCollections(ctx) {
    if (this.collectionsCache) return this.collectionsCache.map((x) => ({ ...x }));
    try {
      const raw = await this.http.getJson(EDITIONS_URL, ctx.signal);
      const root = raw.json && typeof raw.json === "object" ? raw.json : {};
      const fallbackById = new Map(HADITH_API_COLLECTIONS.map((item) => [item.id, item]));
      const discovered = [];
      for (const [bookId, value] of Object.entries(root)) {
        if (!value || typeof value !== "object") continue;
        const book = value;
        const collection = Array.isArray(book.collection) ? book.collection : [];
        const editions = collection.filter((item) => item && typeof item === "object");
        const arabic = editions.find((item) => typeof item.name === "string" && typeof item.language === "string" && /^Arabic$/iu.test(item.language));
        const english = editions.find((item) => typeof item.name === "string" && typeof item.language === "string" && /^English$/iu.test(item.language));
        const fallback = fallbackById.get(bookId);
        const name = typeof book.name === "string" && book.name.trim() ? book.name.trim() : fallback?.name;
        if (!name) continue;
        const arabicEdition = typeof arabic?.name === "string" ? arabic.name : fallback?.arabicEdition;
        const englishEdition = typeof english?.name === "string" ? english.name : fallback?.englishEdition;
        const rawAuthor = typeof english?.author === "string" && english.author.trim() && !/^unknown$/iu.test(english.author.trim()) ? english.author.trim() : fallback?.author;
        discovered.push(normalizeHadithCollectionMetadata({ id: bookId, name, providerId: this.metadata.id, author: rawAuthor, arabicEdition, englishEdition }));
      }
      if (discovered.length) this.collectionsCache = discovered.sort((a, b) => a.name.localeCompare(b.name));
      else this.collectionsCache = HADITH_API_COLLECTIONS.map((x) => normalizeHadithCollectionMetadata(x));
    } catch {
      this.collectionsCache = HADITH_API_COLLECTIONS.map((x) => normalizeHadithCollectionMetadata(x));
    }
    return this.collectionsCache.map((x) => ({ ...x }));
  }
  async listTranslations(ctx) {
    if (this.translationsCache) return this.translationsCache.map((x) => ({ ...x }));
    let raw;
    try {
      raw = await this.http.getJson(EDITIONS_URL, ctx.signal);
    } catch (error) {
      const installed = await this.offline?.listInstalled() ?? [];
      if (installed.some((item) => item.providerId === this.metadata.id && item.id.endsWith(":eng"))) {
        const fallback = { id: "eng", language: "en", name: "English", providerId: this.metadata.id };
        this.translationsCache = [fallback];
        return [{ ...fallback }];
      }
      throw error;
    }
    const root = raw.json && typeof raw.json === "object" ? raw.json : {};
    const byCode = /* @__PURE__ */ new Map();
    for (const value of Object.values(root)) {
      if (!value || typeof value !== "object") continue;
      const collection = value.collection;
      if (!Array.isArray(collection)) continue;
      for (const entry of collection) {
        if (!entry || typeof entry !== "object") continue;
        const item = entry;
        const edition = typeof item.name === "string" ? item.name : "";
        const language = typeof item.language === "string" ? item.language.trim() : "";
        if (!edition || !language || /^Arabic$/iu.test(language)) continue;
        const code = edition.split("-")[0]?.trim().toLowerCase();
        if (code) byCode.set(code, language);
      }
    }
    const translations = [...byCode.entries()].sort(([aId, aLanguage], [bId, bLanguage]) => {
      const aEnglish = aId === "eng" || /^english$/iu.test(aLanguage);
      const bEnglish = bId === "eng" || /^english$/iu.test(bLanguage);
      if (aEnglish !== bEnglish) return aEnglish ? -1 : 1;
      return aLanguage.localeCompare(bLanguage);
    }).map(([id, language]) => ({ id, language: languageCode(language, id), name: language, providerId: this.metadata.id }));
    if (!translations.some((t) => t.id === "eng" && t.language === "en")) translations.unshift({ id: "eng", language: "en", name: "English", providerId: this.metadata.id });
    this.translationsCache = translations;
    return translations.map((x) => ({ ...x }));
  }
  async listOfflineDatabases(_ctx) {
    return (await this.listCollections(_ctx)).filter((c) => c.arabicEdition && c.englishEdition).map((c) => ({ id: `hadith-api:${c.id}:eng`, providerId: this.metadata.id, kind: "hadith", label: `${c.name} \u2014 English`, description: "Arabic and English full edition for offline use.", parts: [{ id: "arabic", label: "Arabic", url: `${BASE}/editions/${c.arabicEdition}.min.json`, fileName: "arabic.json" }, { id: "translation", label: "English", url: `${BASE}/editions/${c.englishEdition}.min.json`, fileName: "translation.json" }] }));
  }
  async fetchHadith(reference, translation, ctx) {
    if (translation.providerId !== this.metadata.id) throw new AppError("Translation belongs to a different provider.", "validation");
    const key = makeCacheKey({ provider: this.metadata.id, collection: reference.collectionId, hadith: reference.hadithNumber, translation: translation.id });
    return this.hadithLoads.run(key, async () => this.fetchHadithCore(reference, translation, ctx, key));
  }
  async fetchHadithCore(reference, translation, ctx, key) {
    let ar = null;
    let en = null;
    let collection;
    if (translation.id === "eng") {
      const offlineId = `hadith-api:${reference.collectionId}:eng`;
      const offlineArabic = await this.offline?.getJson(offlineId, "arabic");
      const offlineEnglish = await this.offline?.getJson(offlineId, "translation");
      if (offlineArabic != null && offlineEnglish != null) {
        ar = { status: 200, json: offlineArabic, headers: {} };
        en = { status: 200, json: offlineEnglish, headers: {} };
        collection = this.collectionsCache?.find((x) => x.id === reference.collectionId) ?? HADITH_API_COLLECTIONS.find((x) => x.id === reference.collectionId);
        if (!collection) collection = { id: reference.collectionId, name: reference.collectionId, providerId: this.metadata.id };
      }
    }
    if (!collection && this.cacheEnabled()) {
      const cached = await this.cache.get(key);
      if (cached) return structuredClone(cached.value);
    }
    if (!collection) {
      const collections = await this.listCollections(ctx);
      collection = collections.find((x) => x.id === reference.collectionId);
    }
    if (!collection) throw new AppError("Unknown collection.", "validation");
    const arabicEdition = collection.arabicEdition;
    const englishEdition = `${translation.id}-${reference.collectionId}`;
    if (!ar || !en) {
      [ar, en] = await Promise.all([
        arabicEdition ? this.getEditionHadith(arabicEdition, reference.hadithNumber, ctx.signal) : Promise.resolve(null),
        englishEdition ? this.getEditionHadith(englishEdition, reference.hadithNumber, ctx.signal) : Promise.resolve(null)
      ]);
    }
    const result = parseHadithApiResponse(ar?.json, en?.json, reference, collection.name, this.metadata.id, translation);
    if (this.cacheEnabled()) await setCacheBestEffort(this.cache, { version: 1, key, storedAt: Date.now(), value: result });
    return result;
  }
  async fetchHadithRange(reference, translation, ctx) {
    const end = reference.endHadithNumber ?? reference.hadithNumber;
    if (end === reference.hadithNumber) return [await this.fetchHadith(reference, translation, ctx)];
    if (typeof reference.hadithNumber !== "number" || typeof end !== "number") {
      throw new AppError("Alphabetic Hadith ranges are not supported.", "validation");
    }
    const results = [];
    const concurrency = 4;
    for (let start = reference.hadithNumber; start <= end; start += concurrency) {
      const batch = Array.from({ length: Math.min(concurrency, end - start + 1) }, (_, index) => start + index);
      const batchResults = await Promise.all(batch.map((hadithNumber) => this.fetchHadith({ kind: "hadith", collectionId: reference.collectionId, hadithNumber }, translation, ctx)));
      results.push(...batchResults);
    }
    return results;
  }
  /**
   * Try the documented CDN first, then raw GitHub mirrors only for failures where
   * a mirror can realistically help. A 429 must not fan out into multiple mirrors:
   * the shared HTTP client has already honored Retry-After, and switching mirrors
   * would multiply load during an upstream rate-limit event. Authentication/
   * authorization failures likewise indicate that another mirror will not fix the
   * request.
   */
  async getEditionHadith(edition, hadithNumber, signal) {
    const urls = [
      `${BASE}/editions/${edition}/${encodeURIComponent(String(hadithNumber))}.min.json`,
      `${BASE}/editions/${edition}/${encodeURIComponent(String(hadithNumber))}.json`,
      `https://raw.githubusercontent.com/fawazahmed0/hadith-api/1/editions/${edition}/${encodeURIComponent(String(hadithNumber))}.min.json`,
      `https://raw.githubusercontent.com/fawazahmed0/hadith-api/1/editions/${edition}/${encodeURIComponent(String(hadithNumber))}.json`
    ];
    let lastError;
    for (const url of urls) {
      if (signal.aborted) throw new DOMException("Aborted", "AbortError");
      try {
        return await this.http.getJson(url, signal);
      } catch (error) {
        lastError = error;
        if (signal.aborted) throw new DOMException("Aborted", "AbortError");
        if (error instanceof AppError) {
          if (error.kind === "cancelled") throw error;
          if (error.kind === "http" && [401, 403, 429].includes(error.status ?? 0)) throw error;
        }
      }
    }
    if (lastError) throw lastError instanceof Error ? lastError : new AppError("Hadith API could not return the requested Hadith.", "network");
    throw new AppError("Hadith API could not return the requested Hadith.", "network");
  }
  async healthCheck(ctx) {
    const started = performance.now();
    try {
      const r = await this.http.getJson(`${BASE}/editions/eng-bukhari/1.min.json`, ctx.signal);
      return { providerId: this.metadata.id, ok: true, status: r.status, latencyMs: Math.round(performance.now() - started) };
    } catch (e) {
      const err = e;
      return { providerId: this.metadata.id, ok: false, status: err.status, latencyMs: Math.round(performance.now() - started), errorKind: ["network", "http", "timeout", "parse", "unknown"].includes(err.kind) ? err.kind : "unknown", message: err.userMessage };
    }
  }
};

// src/core/quran.ts
var SURAH_NAMES = ["Al-Fatihah", "Al-Baqarah", "Aal-E-Imran", "An-Nisa", "Al-Ma\u2019idah", "Al-An\u2019am", "Al-A\u2019raf", "Al-Anfal", "At-Tawbah", "Yunus", "Hud", "Yusuf", "Ar-Ra\u2019d", "Ibrahim", "Al-Hijr", "An-Nahl", "Al-Isra", "Al-Kahf", "Maryam", "Ta-Ha", "Al-Anbiya", "Al-Hajj", "Al-Mu\u2019minun", "An-Nur", "Al-Furqan", "Ash-Shu\u2019ara", "An-Naml", "Al-Qasas", "Al-Ankabut", "Ar-Rum", "Luqman", "As-Sajdah", "Al-Ahzab", "Saba", "Fatir", "Ya-Sin", "As-Saffat", "Sad", "Az-Zumar", "Ghafir", "Fussilat", "Ash-Shura", "Az-Zukhruf", "Ad-Dukhan", "Al-Jathiyah", "Al-Ahqaf", "Muhammad", "Al-Fath", "Al-Hujurat", "Qaf", "Adh-Dhariyat", "At-Tur", "An-Najm", "Al-Qamar", "Ar-Rahman", "Al-Waqi\u2019ah", "Al-Hadid", "Al-Mujadilah", "Al-Hashr", "Al-Mumtahanah", "As-Saff", "Al-Jumu\u2019ah", "Al-Munafiqun", "At-Taghabun", "At-Talaq", "At-Tahrim", "Al-Mulk", "Al-Qalam", "Al-Haqqah", "Al-Ma\u2019arij", "Nuh", "Al-Jinn", "Al-Muzzammil", "Al-Muddaththir", "Al-Qiyamah", "Al-Insan", "Al-Mursalat", "An-Naba", "An-Nazi\u2019at", "Abasa", "At-Takwir", "Al-Infitar", "Al-Mutaffifin", "Al-Inshiqaq", "Al-Buruj", "At-Tariq", "Al-A\u2019la", "Al-Ghashiyah", "Al-Fajr", "Al-Balad", "Ash-Shams", "Al-Layl", "Ad-Duha", "Ash-Sharh", "At-Tin", "Al-Alaq", "Al-Qadr", "Al-Bayyinah", "Az-Zalzalah", "Al-Adiyat", "Al-Qari\u2019ah", "At-Takathur", "Al-Asr", "Al-Humazah", "Al-Fil", "Quraysh", "Al-Ma\u2019un", "Al-Kawthar", "Al-Kafirun", "An-Nasr", "Al-Masad", "Al-Ikhlas", "Al-Falaq", "An-Nas"];

// src/providers/quran-api/parser.ts
function record(value) {
  return typeof value === "object" && value !== null ? value : void 0;
}
function numberOf(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^\d+$/.test(value.trim())) return Number(value);
  return void 0;
}
function verseNumber(item) {
  return numberOf(item.aya) ?? numberOf(item.ayah) ?? numberOf(item.verse) ?? numberOf(item.numberInSurah) ?? numberOf(item.number);
}
function surahNumber(item) {
  return numberOf(item.sura) ?? numberOf(item.surah) ?? numberOf(item.chapterNumber) ?? numberOf(item.chapter);
}
function collect(value, out) {
  if (Array.isArray(value)) {
    for (const item of value) collect(item, out);
    return;
  }
  const r = record(value);
  if (!r) return;
  const text2 = typeof r.text === "string" ? r.text : void 0;
  if (text2) out.push(r);
  for (const key of ["data", "quran", "chapter", "ayahs", "verses", "items", "result"]) {
    if (key in r) collect(r[key], out);
  }
  for (const [key, child] of Object.entries(r)) {
    if (/^\d+:\d+$/u.test(key) && typeof child === "string") {
      const [sura, aya] = key.split(":").map(Number);
      out.push({ sura, aya, text: child });
    }
  }
}
function parseQuranApiEdition(raw, reference) {
  const items = [];
  collect(raw, items);
  const verses = /* @__PURE__ */ new Map();
  for (const item of items) {
    const surah = surahNumber(item);
    const number = verseNumber(item);
    const text2 = typeof item.text === "string" ? item.text.trim() : "";
    if (!text2 || number === void 0) continue;
    if (surah !== void 0 && surah !== reference.surah) continue;
    verses.set(number, text2);
  }
  return {
    surahName: SURAH_NAMES[reference.surah - 1] ?? `Surah ${reference.surah}`,
    verses
  };
}

// src/providers/quran-api/provider.ts
var BASE2 = "https://cdn.jsdelivr.net/gh/fawazahmed0/quran-api@1";
var EDITIONS_URL2 = `${BASE2}/editions.min.json`;
var ARABIC_EDITION2 = "ara-quranacademy";
function mergeCached(base, extra) {
  if (!base) return structuredClone(extra);
  return { surahName: extra.surahName || base.surahName, ayah: { ...base.ayah, ...extra.ayah, reference: base.ayah.reference, arabic: extra.ayah.arabic ?? base.ayah.arabic, translation: extra.ayah.translation ?? base.ayah.translation } };
}
function object(value) {
  return typeof value === "object" && value !== null ? value : void 0;
}
var QuranApiProvider = class {
  constructor(http, cacheEnabled = () => true, offline) {
    this.http = http;
    this.cacheEnabled = cacheEnabled;
    this.offline = offline;
    __publicField(this, "metadata", { id: "quran-api", name: "Quran API", kind: "quran", baseUrl: BASE2, projectUrl: "https://github.com/fawazahmed0/quran-api" });
    __publicField(this, "capabilities", { arabicText: true, englishTranslation: true, multipleTranslations: true, collectionListing: false, rangeRetrieval: true, grading: false, metadata: true, directSourceUrls: true, search: false });
    __publicField(this, "cache", new MemoryCacheStore());
    __publicField(this, "verseLoads", new SingleFlight());
    __publicField(this, "chapterLoads", new SingleFlight());
    __publicField(this, "translationsCache", null);
  }
  async listTranslations(ctx) {
    if (this.translationsCache) return this.translationsCache.map((x) => ({ ...x }));
    let raw;
    try {
      raw = await this.http.getJson(EDITIONS_URL2, ctx.signal);
    } catch (error) {
      const installed = await this.offline?.listInstalled() ?? [];
      const installedTranslations = installed.filter((item) => item.providerId === this.metadata.id && item.id.startsWith("quran-api:") && item.id !== "quran-api:arabic").map((item) => {
        const edition = item.id.slice("quran-api:".length);
        const language = edition.split("-")[0]?.toLowerCase() || "en";
        const separator = item.label.lastIndexOf(" \u2014 ");
        const author = separator > 0 ? item.label.slice(0, separator) : item.label;
        return normalizeQuranTranslationMetadata({ id: edition, language, name: author, author, providerId: this.metadata.id });
      });
      if (installedTranslations.length) return installedTranslations;
      throw error;
    }
    const root = object(raw.json) ?? {};
    const translations = [];
    for (const value of Object.values(root)) {
      const edition = object(value);
      if (!edition) continue;
      const id = typeof edition.name === "string" ? edition.name.trim() : "";
      const language = typeof edition.language === "string" ? edition.language.trim() : "";
      if (!id || !language || /^arabic$/iu.test(language)) continue;
      translations.push(normalizeQuranTranslationMetadata({ id, language: normalizeLanguageCode(language), name: id, author: typeof edition.author === "string" && edition.author.trim() ? edition.author.trim() : id, providerId: this.metadata.id }));
    }
    const unique = [...new Map(translations.map((t) => [`${t.language}\0${t.id}`, t])).values()];
    unique.sort((a, b) => {
      const ah = /^en$/iu.test(a.language) && /muhammadtaqiudd/iu.test(a.id);
      const bh = /^en$/iu.test(b.language) && /muhammadtaqiudd/iu.test(b.id);
      if (ah !== bh) return ah ? -1 : 1;
      const ae = a.language === "en", be = b.language === "en";
      if (ae !== be) return ae ? -1 : 1;
      return a.author.localeCompare(b.author);
    });
    this.translationsCache = unique;
    return unique.map((x) => ({ ...x }));
  }
  async listOfflineDatabases(ctx) {
    const translations = await this.listTranslations(ctx);
    return [
      {
        id: "quran-api:arabic",
        providerId: this.metadata.id,
        kind: "quran",
        category: "quran",
        categories: ["quran"],
        label: "Quran Arabic \u2014 Quran Academy",
        description: "Complete Arabic Quran edition for offline use; shared by all Quran API translations.",
        parts: [{ id: "arabic", label: "Arabic Quran", url: `${BASE2}/editions/${ARABIC_EDITION2}.min.json`, fileName: "arabic.json" }]
      },
      ...translations.map((t) => ({
        id: `quran-api:${t.id}`,
        providerId: this.metadata.id,
        kind: "quran",
        category: "quran-translation",
        categories: ["quran-translation"],
        label: `${t.author ?? t.name} \u2014 ${t.language.toUpperCase()}`,
        description: `Complete ${t.language} translation for offline use.`,
        parts: [{ id: "translation", label: `${t.author ?? t.name}`, url: `${BASE2}/editions/${encodeURIComponent(t.id)}.min.json`, fileName: "translation.json" }]
      }))
    ];
  }
  async fetchQuran(reference, translation, ctx) {
    if (translation.providerId !== this.metadata.id) throw new AppError("Translation belongs to a different provider.", "validation");
    const numbers = Array.from({ length: reference.endAyah - reference.startAyah + 1 }, (_, i) => reference.startAyah + i);
    const cached = /* @__PURE__ */ new Map();
    const [offlineArabic, offlineTranslation] = await Promise.all([
      this.offline?.getJson("quran-api:arabic", "arabic"),
      this.offline?.getJson(`quran-api:${translation.id}`, "translation")
    ]);
    const arabicOffline = offlineArabic !== null && offlineArabic !== void 0 ? parseQuranApiEdition(offlineArabic, reference) : null;
    const translationOffline = offlineTranslation !== null && offlineTranslation !== void 0 ? parseQuranApiEdition(offlineTranslation, reference) : null;
    for (const number of numbers) {
      const arabic = arabicOffline?.verses.get(number);
      const text2 = translationOffline?.verses.get(number);
      if (arabic || text2) cached.set(number, this.makeCachedAyah(reference, number, translation, arabic, text2, arabicOffline?.surahName));
    }
    const missing = numbers.filter((number) => {
      const ayah = cached.get(number)?.ayah;
      return !ayah?.arabic || !ayah.translation;
    });
    if (missing.length && this.cacheEnabled()) {
      const entries = await Promise.all(missing.map(async (number) => ({ number, entry: await this.cache.get(this.cacheKey(reference.surah, number, translation.id)) })));
      for (const { number, entry } of entries) if (entry?.value) cached.set(number, mergeCached(cached.get(number), entry.value));
    }
    const stillMissing = numbers.filter((number) => {
      const ayah = cached.get(number)?.ayah;
      return !ayah?.arabic || !ayah.translation;
    });
    if (stillMissing.length && shouldFetchWholeQuranSurah(reference, stillMissing.length, 2, 2, 4)) {
      const [arabicRaw, translationRaw] = await Promise.all([this.loadChapter(ARABIC_EDITION2, reference, ctx), this.loadChapter(translation.id, reference, ctx)]);
      const allNumbers = /* @__PURE__ */ new Set([...arabicRaw.verses.keys(), ...translationRaw.verses.keys(), ...stillMissing]);
      for (const number of allNumbers) {
        const arabic = arabicRaw.verses.get(number);
        const text2 = translationRaw.verses.get(number);
        if (!arabic && !text2) continue;
        const value = this.makeCachedAyah(reference, number, translation, arabic, text2, arabicRaw.surahName);
        cached.set(number, mergeCached(cached.get(number), value));
        if (this.cacheEnabled()) await setCacheBestEffort(this.cache, { version: 1, key: this.cacheKey(reference.surah, number, translation.id), storedAt: Date.now(), value: cached.get(number) });
      }
    } else if (stillMissing.length) {
      const fetched = await mapWithConcurrency(stillMissing, 4, (number) => {
        const existing = cached.get(number)?.ayah;
        return this.fetchVerse(reference.surah, number, translation, ctx, !existing?.arabic, !existing?.translation);
      });
      for (const value of fetched) {
        const number = value.ayah.reference.startAyah;
        const merged = mergeCached(cached.get(number), value);
        cached.set(number, merged);
        if (this.cacheEnabled()) await setCacheBestEffort(this.cache, { version: 1, key: this.cacheKey(reference.surah, number, translation.id), storedAt: Date.now(), value: merged });
      }
    }
    const ayahs = numbers.map((number) => cached.get(number)?.ayah).filter((ayah) => Boolean(ayah));
    if (ayahs.length !== numbers.length || !ayahs.some((a) => a.arabic || a.translation)) throw new AppError("No Quran text was found for the selected reference.", "parse");
    const first = cached.get(reference.startAyah);
    return { kind: "quran", reference, surahName: first?.surahName ?? arabicOffline?.surahName ?? `Surah ${reference.surah}`, ayahs, source: { providerId: this.metadata.id, providerName: this.metadata.name, sourceUrl: this.makeSourceUrl(reference, translation.id), retrievedAt: (/* @__PURE__ */ new Date()).toISOString(), translationId: translation.id, translationName: translation.name } };
  }
  cacheKey(surah, ayah, translation) {
    return makeCacheKey({ provider: this.metadata.id, surah, ayah, translation });
  }
  makeSourceUrl(reference, translationId) {
    if (reference.startAyah === reference.endAyah) return `${BASE2}/editions/${encodeURIComponent(translationId)}/${reference.surah}/${reference.startAyah}.json`;
    return `${BASE2}/editions/${encodeURIComponent(translationId)}/${reference.surah}.json`;
  }
  makeCachedAyah(reference, number, translation, arabic, text2, surahName) {
    return { surahName: surahName ?? `Surah ${reference.surah}`, ayah: { reference: { kind: "quran", surah: reference.surah, startAyah: number, endAyah: number }, ...arabic ? { arabic } : {}, ...text2 ? { translation: { id: translation.id, language: translation.language, name: translation.name, text: text2, providerId: this.metadata.id } } : {} } };
  }
  fetchVerse(surah, ayah, translation, ctx, needArabic, needTranslation) {
    const key = `${surah}:${ayah}:${translation.id}:ar=${needArabic}:en=${needTranslation}`;
    return this.verseLoads.run(key, async () => {
      const reference = { kind: "quran", surah, startAyah: ayah, endAyah: ayah };
      const [arabicRaw, translationRaw] = await Promise.all([
        needArabic ? this.http.getJson(`${BASE2}/editions/${encodeURIComponent(ARABIC_EDITION2)}/${surah}/${ayah}.min.json`, ctx.signal) : Promise.resolve(null),
        needTranslation ? this.http.getJson(`${BASE2}/editions/${encodeURIComponent(translation.id)}/${surah}/${ayah}.min.json`, ctx.signal) : Promise.resolve(null)
      ]);
      const arabic = arabicRaw ? parseQuranApiEdition(arabicRaw.json, reference) : { surahName: `Surah ${surah}`, verses: /* @__PURE__ */ new Map() };
      const translated = translationRaw ? parseQuranApiEdition(translationRaw.json, reference) : { surahName: arabic.surahName, verses: /* @__PURE__ */ new Map() };
      const value = this.makeCachedAyah(reference, ayah, translation, arabic.verses.get(ayah), translated.verses.get(ayah), arabic.surahName);
      if (!value.ayah.arabic && !value.ayah.translation) throw new AppError("No Quran text was found for the selected reference.", "parse");
      return value;
    });
  }
  loadChapter(edition, reference, ctx) {
    const key = `${edition}:${reference.surah}`;
    return this.chapterLoads.run(key, async () => {
      const url = `${BASE2}/editions/${encodeURIComponent(edition)}/${reference.surah}.min.json`;
      const raw = await this.http.getJson(url, ctx.signal);
      return parseQuranApiEdition(raw.json, reference);
    });
  }
  async healthCheck(ctx) {
    const started = performance.now();
    try {
      const r = await this.http.getJson(`${BASE2}/editions/${encodeURIComponent(ARABIC_EDITION2)}/1/1.min.json`, ctx.signal);
      return { providerId: this.metadata.id, ok: true, status: r.status, latencyMs: Math.round(performance.now() - started) };
    } catch (e) {
      const err = e;
      return { providerId: this.metadata.id, ok: false, status: err.status, latencyMs: Math.round(performance.now() - started), errorKind: ["network", "http", "timeout", "parse", "unknown"].includes(err.kind) ? err.kind : "unknown", message: err.userMessage };
    }
  }
};

// src/providers/quran-project/parser.ts
function strings(value) {
  return Array.isArray(value) ? value.map((item) => typeof item === "string" ? item.trim() : "").filter(Boolean) : [];
}
function text(value) {
  return typeof value === "string" && value.trim() ? value.trim() : void 0;
}
function parseQuranProjectChapter(raw, reference) {
  const root = typeof raw === "object" && raw !== null ? raw : {};
  const arabic = strings(root.arabic1);
  const translations = /* @__PURE__ */ new Map();
  const add = (language, values) => {
    const map = /* @__PURE__ */ new Map();
    values.forEach((value, index) => map.set(index + 1, value));
    translations.set(language, map);
  };
  add("en", strings(root.english));
  add("bn", strings(root.bengali));
  add("ur", strings(root.urdu));
  return { surahName: typeof root.surahName === "string" && root.surahName.trim() ? root.surahName.trim() : SURAH_NAMES[reference.surah - 1] ?? `Surah ${reference.surah}`, arabic: new Map(arabic.map((value, index) => [index + 1, value])), translations };
}
function parseQuranProjectVerse(raw, reference, translation) {
  const root = typeof raw === "object" && raw !== null ? raw : {};
  const languageKey = translation.language === "bn" ? "bengali" : translation.language === "ur" ? "urdu" : "english";
  const surahName = text(root.surahName) ?? SURAH_NAMES[reference.surah - 1] ?? `Surah ${reference.surah}`;
  return { surahName, arabic: text(root.arabic1), translation: text(root[languageKey]) };
}

// src/providers/quran-project/provider.ts
var BASE3 = "https://quranapi.pages.dev/api";
var TRANSLATIONS2 = [
  { id: "en", language: "en", name: "English", providerId: "quran-project" },
  { id: "bn", language: "bn", name: "Bengali", providerId: "quran-project" },
  { id: "ur", language: "ur", name: "Urdu", providerId: "quran-project" }
];
var QuranProjectProvider = class {
  constructor(http, cacheEnabled = () => true, offline) {
    this.http = http;
    this.cacheEnabled = cacheEnabled;
    __publicField(this, "metadata", { id: "quran-project", name: "Quran Project API", kind: "quran", baseUrl: "https://quranapi.pages.dev", projectUrl: "https://github.com/The-Quran-Project/Quran-API" });
    __publicField(this, "capabilities", { arabicText: true, englishTranslation: true, multipleTranslations: true, collectionListing: false, rangeRetrieval: true, grading: false, metadata: true, directSourceUrls: true, search: false });
    __publicField(this, "cache", new MemoryCacheStore());
    __publicField(this, "verseLoads", new SingleFlight());
    __publicField(this, "chapterLoads", new SingleFlight());
    __publicField(this, "offline");
    this.offline = offline;
  }
  async listTranslations(_ctx) {
    return TRANSLATIONS2.map(normalizeQuranTranslationMetadata);
  }
  async listOfflineDatabases(_ctx) {
    return [{ id: "quran-project:complete", providerId: this.metadata.id, kind: "quran", category: "quran", categories: ["quran", "quran-translation"], label: "Quran Project \u2014 Complete Quran", description: "Complete Arabic Quran plus English, Bengali and Urdu translations across all 114 Surahs.", parts: Array.from({ length: 114 }, (_, index) => ({ id: String(index + 1), label: `Surah ${index + 1}`, url: `${BASE3}/${index + 1}.json`, fileName: `${index + 1}.json` })) }];
  }
  async fetchQuran(reference, translation, ctx) {
    if (translation.providerId !== this.metadata.id || !TRANSLATIONS2.some((item) => item.id === translation.id)) throw new AppError("Translation belongs to a different provider.", "validation");
    const numbers = Array.from({ length: reference.endAyah - reference.startAyah + 1 }, (_, index) => reference.startAyah + index);
    const cached = /* @__PURE__ */ new Map();
    const offlineRaw = await this.offline?.getJson("quran-project:complete", String(reference.surah));
    if (offlineRaw !== null && offlineRaw !== void 0) {
      const parsed = parseQuranProjectChapter(offlineRaw, reference);
      this.seedChapter(parsed, reference, translation, cached);
      return this.buildResult(reference, translation, cached, "offline");
    }
    if (this.cacheEnabled()) {
      const entries = await Promise.all(numbers.map(async (number) => ({ number, entry: await this.cache.get(this.cacheKey(reference.surah, number, translation.id)) })));
      for (const { number, entry } of entries) if (entry?.value) cached.set(number, structuredClone(entry.value));
    }
    const missing = numbers.filter((number) => !this.hasComplete(cached.get(number)?.ayah));
    if (missing.length && shouldFetchWholeQuranSurah(reference, missing.length, 1, 1, 3)) {
      const parsed = await this.loadChapter(reference.surah, ctx, reference);
      this.seedChapter(parsed, reference, translation, cached);
    } else if (missing.length) {
      const fetched = await mapWithConcurrency(missing, 4, (number) => this.fetchVerse(reference.surah, number, translation, ctx));
      for (const value of fetched) cached.set(value.ayah.reference.startAyah, value);
      if (this.cacheEnabled()) for (const value of fetched) await setCacheBestEffort(this.cache, { version: 1, key: this.cacheKey(reference.surah, value.ayah.reference.startAyah, translation.id), storedAt: Date.now(), value });
    }
    return this.buildResult(reference, translation, cached, "online");
  }
  buildResult(reference, translation, cached, sourceMode) {
    const numbers = Array.from({ length: reference.endAyah - reference.startAyah + 1 }, (_, index) => reference.startAyah + index);
    const ayahs = numbers.map((number) => cached.get(number)?.ayah).filter((ayah) => Boolean(ayah));
    if (ayahs.length !== numbers.length) throw new AppError("No Quran text was found for the selected reference.", "parse");
    const first = cached.get(reference.startAyah);
    const sourceUrl = sourceMode === "offline" ? `${BASE3}/${reference.surah}.json` : reference.startAyah === reference.endAyah ? `${BASE3}/${reference.surah}/${reference.startAyah}.json` : `${BASE3}/${reference.surah}.json`;
    return { kind: "quran", reference, surahName: first?.surahName ?? `Surah ${reference.surah}`, ayahs, source: { providerId: this.metadata.id, providerName: this.metadata.name, sourceUrl, retrievedAt: (/* @__PURE__ */ new Date()).toISOString(), translationId: translation.id, translationName: translation.name } };
  }
  cacheKey(surah, ayah, translation) {
    return makeCacheKey({ provider: this.metadata.id, surah, ayah, translation });
  }
  hasComplete(ayah) {
    return Boolean(ayah?.arabic && ayah.translation?.text);
  }
  seedChapter(parsed, reference, translation, cached) {
    const languageMap = parsed.translations.get(translation.id);
    const allNumbers = /* @__PURE__ */ new Set([...parsed.arabic.keys(), ...languageMap?.keys() ?? []]);
    for (const number of allNumbers) {
      const arabic = parsed.arabic.get(number);
      const text2 = languageMap?.get(number);
      if (!arabic && !text2) continue;
      const value = { surahName: parsed.surahName, ayah: { reference: { kind: "quran", surah: reference.surah, startAyah: number, endAyah: number }, ...arabic ? { arabic } : {}, ...text2 ? { translation: { id: translation.id, language: translation.language, name: translation.name, text: text2, providerId: this.metadata.id } } : {} } };
      cached.set(number, value);
      if (this.cacheEnabled()) void setCacheBestEffort(this.cache, { version: 1, key: this.cacheKey(reference.surah, number, translation.id), storedAt: Date.now(), value });
    }
  }
  fetchVerse(surah, ayah, translation, ctx) {
    const key = `${surah}:${ayah}:${translation.id}`;
    return this.verseLoads.run(key, async () => {
      const reference = { kind: "quran", surah, startAyah: ayah, endAyah: ayah };
      const raw = await this.http.getJson(`${BASE3}/${surah}/${ayah}.json`, ctx.signal);
      const parsed = parseQuranProjectVerse(raw.json, reference, translation);
      if (!parsed.arabic && !parsed.translation) throw new AppError("No Quran text was found for the selected reference.", "parse", raw.status);
      return { surahName: parsed.surahName, ayah: { reference, ...parsed.arabic ? { arabic: parsed.arabic } : {}, ...parsed.translation ? { translation: { id: translation.id, language: translation.language, name: translation.name, text: parsed.translation, providerId: this.metadata.id } } : {} } };
    });
  }
  loadChapter(surah, ctx, reference) {
    return this.chapterLoads.run(String(surah), async () => {
      const raw = (await this.http.getJson(`${BASE3}/${surah}.json`, ctx.signal)).json;
      return parseQuranProjectChapter(raw, reference);
    });
  }
  async healthCheck(ctx) {
    const started = performance.now();
    try {
      const response = await this.http.getJson(`${BASE3}/1/1.json`, ctx.signal);
      return { providerId: this.metadata.id, ok: true, status: response.status, latencyMs: Math.round(performance.now() - started) };
    } catch (error) {
      const err = error;
      return { providerId: this.metadata.id, ok: false, status: err.status, latencyMs: Math.round(performance.now() - started), errorKind: ["network", "http", "timeout", "parse", "unknown"].includes(err.kind) ? err.kind : "unknown", message: err.userMessage };
    }
  }
};

// src/providers/hadith-json/provider.ts
var BASE4 = "https://raw.githubusercontent.com/AhmedBaset/hadith-json/v1.2.0";
var DATASET_VERSION = "v1.2.0";
var TRANSLATION = { id: "en", language: "en", name: "English", providerId: "hadith-json" };
var COLLECTIONS = [
  { id: "bukhari", name: "Sahih Al-Bukhari", providerId: "hadith-json", author: "Imam Muhammad Ibn Ismail Al-Bukhari" },
  { id: "muslim", name: "Sahih Muslim", providerId: "hadith-json", author: "Imam Muslim Ibn Al-Hajjaj Al-Naysaburi" },
  { id: "abudawud", name: "Sunan Abi Dawud", providerId: "hadith-json", author: "Imam Sulayman Ibn Al-Ashath Abu Dawud Al-Sijistani" },
  { id: "tirmidhi", name: "Jami' At-Tirmidhi", providerId: "hadith-json", author: "Imam Abu Isa Muhammad Ibn Isa At-Tirmidhi" },
  { id: "nasai", name: "Sunan An-Nasa'i", providerId: "hadith-json", author: "Imam Ahmad Ibn Shu'ayb An-Nasa'i" },
  { id: "ibnmajah", name: "Sunan Ibn Majah", providerId: "hadith-json", author: "Imam Muhammad Ibn Yazid Ibn Majah Al-Qazwini" },
  { id: "malik", name: "Muwatta Malik", providerId: "hadith-json", author: "Imam Malik Ibn Anas" },
  { id: "ahmad", name: "Musnad Ahmad Ibn Hanbal", providerId: "hadith-json", author: "Imam Ahmad Ibn Hanbal" },
  { id: "darimi", name: "Sunan Ad-Darimi", providerId: "hadith-json", author: "Imam Abu Muhammad Abd Al-Rahman Ibn Abd Allah Al-Darimi" },
  { id: "nawawi40", name: "The Forty Hadith of Imam Nawawi", providerId: "hadith-json", author: "Imam Yahya Ibn Sharaf Al-Nawawi" },
  { id: "qudsi40", name: "The Forty Hadith Qudsi", providerId: "hadith-json" },
  { id: "shahwaliullah40", name: "The Forty Hadith of Shah Waliullah", providerId: "hadith-json", author: "Shah Waliullah Dahlawi" },
  { id: "riyadussalihin", name: "Riyad As-Salihin", providerId: "hadith-json", author: "Imam Yahya Ibn Sharaf Al-Nawawi" },
  { id: "mishkat_almasabih", name: "Mishkat Al-Masabih", providerId: "hadith-json", author: "Al-Khatib Al-Tabrizi" },
  { id: "aladab_almufrad", name: "Al-Adab Al-Mufrad", providerId: "hadith-json", author: "Imam Muhammad Ibn Ismail Al-Bukhari" },
  { id: "shamail_muhammadiyah", name: "Shama'il Muhammadiyah", providerId: "hadith-json", author: "Imam Tirmidhi" },
  { id: "bulugh_almaram", name: "Bulugh Al-Maram", providerId: "hadith-json", author: "Ibn Hajar Al-Asqalani" }
];
var BOOK_PATHS = {
  bukhari: "the_9_books/bukhari",
  muslim: "the_9_books/muslim",
  abudawud: "the_9_books/abudawud",
  tirmidhi: "the_9_books/tirmidhi",
  nasai: "the_9_books/nasai",
  ibnmajah: "the_9_books/ibnmajah",
  malik: "the_9_books/malik",
  ahmad: "the_9_books/ahmad",
  darimi: "the_9_books/darimi",
  nawawi40: "forties/nawawi40",
  qudsi40: "forties/qudsi40",
  shahwaliullah40: "forties/shahwaliullah40",
  riyadussalihin: "other_books/riyad_assalihin",
  mishkat_almasabih: "other_books/mishkat_almasabih",
  aladab_almufrad: "other_books/aladab_almufrad",
  shamail_muhammadiyah: "other_books/shamail_muhammadiyah",
  bulugh_almaram: "other_books/bulugh_almaram"
};
function asRecord(value) {
  return typeof value === "object" && value !== null ? value : void 0;
}
function cleanText(value) {
  const normalized = value.replace(/\\n/gu, " ").replace(/\r?\n/gu, " ").replace(/\s+/gu, " ").trim();
  return normalized.replace(/:/gu, (colon, index, text2) => {
    const before = text2[index - 1] ?? "";
    const after = text2[index + 1] ?? "";
    if (/\d/u.test(before) && /\d/u.test(after)) return colon;
    return after && !/\s/u.test(after) ? `${colon} ` : colon;
  });
}
function asText(value) {
  if (typeof value !== "string") return void 0;
  const cleaned = cleanText(value);
  return cleaned || void 0;
}
function pickBookData(raw) {
  if (Array.isArray(raw)) return raw;
  const r = asRecord(raw);
  if (!r) return [];
  for (const key of ["data", "hadiths", "items"]) if (Array.isArray(r[key])) return r[key];
  return [];
}
var HadithJsonProvider = class {
  constructor(http, cacheEnabled = () => true, offline, persistentCache) {
    this.http = http;
    this.cacheEnabled = cacheEnabled;
    this.offline = offline;
    this.persistentCache = persistentCache;
    __publicField(this, "metadata", { id: "hadith-json", name: "Hadith JSON", kind: "hadith", baseUrl: BASE4, projectUrl: "https://github.com/AhmedBaset/hadith-json" });
    __publicField(this, "capabilities", { arabicText: true, englishTranslation: true, multipleTranslations: false, collectionListing: true, rangeRetrieval: true, grading: false, metadata: true, directSourceUrls: true, search: false });
    __publicField(this, "bookMemoryCache", /* @__PURE__ */ new Map());
    __publicField(this, "bookIndexCache", /* @__PURE__ */ new Map());
    __publicField(this, "maxMemoryBooks", 3);
    __publicField(this, "bookLoads", /* @__PURE__ */ new Map());
  }
  async listCollections(_ctx) {
    return COLLECTIONS.map((x) => normalizeHadithCollectionMetadata(x));
  }
  async listTranslations(_ctx) {
    return [{ ...TRANSLATION }];
  }
  async listOfflineDatabases(_ctx) {
    return COLLECTIONS.map((c) => ({ id: `hadith-json:${c.id}`, providerId: this.metadata.id, kind: "hadith", label: c.name, description: `Arabic and English hadith database for ${c.name}, pinned to hadith-json v1.2.0.`, parts: [{ id: "book", label: c.name, url: `${BASE4}/db/by_book/${BOOK_PATHS[c.id]}.json`, fileName: "book.json" }] }));
  }
  async fetchHadith(reference, translation, ctx) {
    const collection = this.getCollection(reference.collectionId);
    this.validateTranslation(translation);
    const data = await this.loadBook(collection.id, ctx);
    return this.parseFromBook(reference, collection, translation, data);
  }
  async fetchHadithRange(reference, translation, ctx) {
    const collection = this.getCollection(reference.collectionId);
    this.validateTranslation(translation);
    const end = reference.endHadithNumber ?? reference.hadithNumber;
    if (end === reference.hadithNumber) {
      const data2 = await this.loadBook(collection.id, ctx);
      return [this.parseFromBook(reference, collection, translation, data2)];
    }
    if (typeof reference.hadithNumber !== "number" || typeof end !== "number") throw new AppError("Alphabetic Hadith ranges are not supported.", "validation");
    if (end < reference.hadithNumber) throw new AppError("Hadith range end must not be before its start.", "validation");
    const data = await this.loadBook(collection.id, ctx);
    const results = [];
    for (let number = reference.hadithNumber; number <= end; number++) results.push(this.parseFromBook({ kind: "hadith", collectionId: collection.id, hadithNumber: number }, collection, translation, data));
    return results;
  }
  getCollection(id) {
    const collection = COLLECTIONS.find((c) => c.id === id);
    if (!collection) throw new AppError("Unknown collection.", "validation");
    return collection;
  }
  validateTranslation(translation) {
    if (translation.providerId !== this.metadata.id || translation.id !== "en") throw new AppError("Translation is not supported by Hadith JSON.", "validation");
  }
  persistentKey(collectionId) {
    return `hadith-json:${DATASET_VERSION}:${collectionId}:book`;
  }
  rememberBook(collectionId, data) {
    this.bookMemoryCache.delete(collectionId);
    this.bookMemoryCache.set(collectionId, data);
    while (this.bookMemoryCache.size > this.maxMemoryBooks) {
      const oldest = this.bookMemoryCache.keys().next().value;
      if (oldest === void 0) break;
      this.bookMemoryCache.delete(oldest);
      this.bookIndexCache.delete(oldest);
    }
  }
  /**
   * Build a number -> raw-record index once per cached book object. Hadith JSON is
   * book-oriented, so repeated Array.find() calls would rescan the whole book for
   * every lookup. One O(book-size) pass followed by O(1) lookups is cheaper for
   * ranges/repeated requests; source identity prevents stale indexes.
   */
  indexBook(collectionId, data) {
    const existing = this.bookIndexCache.get(collectionId);
    if (existing && existing.source === data) {
      const cachedIndex = existing.index;
      this.bookIndexCache.delete(collectionId);
      this.bookIndexCache.set(collectionId, existing);
      return cachedIndex;
    }
    const index = /* @__PURE__ */ new Map();
    const items = pickBookData(data);
    items.forEach((value, position) => {
      const positionKey = String(position + 1);
      if (!index.has(positionKey)) index.set(positionKey, value);
      const record2 = asRecord(value);
      for (const candidate of [record2?.hadithnumber, record2?.hadithNumber, record2?.num, record2?.ref]) {
        if (typeof candidate !== "string" && typeof candidate !== "number") continue;
        const raw = String(candidate).trim();
        if (!raw) continue;
        const key = raw.includes(":") ? raw.slice(raw.lastIndexOf(":") + 1).toLowerCase() : raw.toLowerCase();
        if (!key) continue;
        if (!index.has(key)) index.set(key, value);
      }
    });
    this.bookIndexCache.set(collectionId, { source: data, index });
    while (this.bookIndexCache.size > this.maxMemoryBooks) {
      const oldest = this.bookIndexCache.keys().next().value;
      if (oldest === void 0) break;
      this.bookIndexCache.delete(oldest);
    }
    return index;
  }
  /**
   * Resolve a complete book through the layered offline/memory/persistent/network
   * strategy. `bookLoads` is the single-flight guard that prevents concurrent calls
   * for the same collection from downloading the same large JSON file twice.
   */
  async loadBook(collectionId, ctx) {
    const offline = await this.offline?.getJson(`hadith-json:${collectionId}`, "book");
    if (offline !== null && offline !== void 0) return offline;
    if (this.cacheEnabled()) {
      const memory = this.bookMemoryCache.get(collectionId);
      if (memory !== void 0) {
        this.bookMemoryCache.delete(collectionId);
        this.bookMemoryCache.set(collectionId, memory);
        return memory;
      }
    }
    const existingLoad = this.bookLoads.get(collectionId);
    if (existingLoad) return existingLoad;
    const load = (async () => {
      if (this.cacheEnabled()) {
        const persistent = await this.persistentCache?.get(this.persistentKey(collectionId));
        if (persistent !== null && persistent !== void 0) {
          this.rememberBook(collectionId, persistent);
          return persistent;
        }
      }
      const path = BOOK_PATHS[collectionId];
      if (!path) throw new AppError("Unknown collection.", "validation");
      const raw = await this.http.getJson(`${BASE4}/db/by_book/${path}.json`, ctx.signal);
      const data = raw.json;
      if (this.cacheEnabled()) {
        this.rememberBook(collectionId, data);
        await setPersistentCacheBestEffort(this.persistentCache, this.persistentKey(collectionId), data);
      }
      return data;
    })();
    this.bookLoads.set(collectionId, load);
    try {
      return await load;
    } finally {
      if (this.bookLoads.get(collectionId) === load) this.bookLoads.delete(collectionId);
    }
  }
  parseFromBook(reference, collection, translation, data) {
    const item = this.indexBook(collection.id, data).get(String(reference.hadithNumber).trim().toLowerCase());
    if (!item) throw new AppError(`Hadith ${reference.hadithNumber} was not found in ${collection.name}.`, "parse");
    const record2 = asRecord(item);
    const english = asRecord(record2?.english);
    const arabic = asText(record2?.arabic);
    const englishText = asText(english?.text);
    const narrator = asText(english?.narrator);
    const sourceUrl = `${BASE4}/db/by_book/${BOOK_PATHS[collection.id]}.json`;
    return { kind: "hadith", reference, collectionName: collection.name, title: void 0, arabic, english: englishText, englishIsnad: narrator, grades: [], source: { providerId: this.metadata.id, providerName: this.metadata.name, sourceUrl, retrievedAt: (/* @__PURE__ */ new Date()).toISOString(), collectionId: collection.id, collectionName: collection.name, translationId: translation.id, translationName: translation.name } };
  }
  // Health checks must stay lightweight: downloading a complete Bukhari file just to
  // prove GitHub reachability would be an unnecessary multi-megabyte operation.
  async healthCheck(ctx) {
    const started = performance.now();
    try {
      const r = await this.http.getText(`${BASE4}/README.md`, ctx.signal);
      return { providerId: this.metadata.id, ok: true, status: r.status, latencyMs: Math.round(performance.now() - started) };
    } catch (e) {
      const err = e;
      return { providerId: this.metadata.id, ok: false, status: err.status, latencyMs: Math.round(performance.now() - started), errorKind: ["network", "http", "timeout", "parse", "unknown"].includes(err.kind) ? err.kind : "unknown", message: err.userMessage };
    }
  }
};

// src/obsidian/offline-store.ts
var import_obsidian2 = require("obsidian");
var MANIFEST_FILE = "manifest.json";
var DB_ROOT_NAME = "offline";
function safePartFileName(part) {
  const name = part.fileName.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^\.+/, "");
  return name || `${part.id}.json`;
}
function safeDatabaseName(id) {
  return encodeURIComponent(id);
}
async function sha256(text2) {
  const subtle = activeWindow.crypto?.subtle;
  if (!subtle) return void 0;
  const bytes = new TextEncoder().encode(text2);
  const digest = await subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
function byteLength(text2) {
  return new TextEncoder().encode(text2).byteLength;
}
var ObsidianOfflineDatabaseStore = class {
  constructor(app, pluginId) {
    __publicField(this, "verifiedParts", /* @__PURE__ */ new Set());
    __publicField(this, "installLocks", /* @__PURE__ */ new Map());
    __publicField(this, "adapter");
    __publicField(this, "root");
    this.adapter = app.vault.adapter;
    this.root = (0, import_obsidian2.normalizePath)(`${app.vault.configDir}/plugins/${pluginId}/${DB_ROOT_NAME}`);
  }
  async ensureDirectory(path) {
    const normalized = (0, import_obsidian2.normalizePath)(path);
    const parts = normalized.split("/").filter(Boolean);
    let current = normalized.startsWith("/") ? "/" : "";
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      if (!await this.adapter.exists(current)) await this.adapter.mkdir(current);
    }
  }
  manifestPath(databaseId) {
    return (0, import_obsidian2.normalizePath)(`${this.root}/${safeDatabaseName(databaseId)}/${MANIFEST_FILE}`);
  }
  async readManifest(databaseId) {
    const path = this.manifestPath(databaseId);
    if (!await this.adapter.exists(path)) return null;
    try {
      const raw = await this.adapter.read(path);
      const parsed = JSON.parse(raw);
      if (parsed.version !== 1 || parsed.id !== databaseId || typeof parsed.providerId !== "string" || parsed.kind !== "quran" && parsed.kind !== "hadith" || parsed.category !== void 0 && parsed.category !== "quran" && parsed.category !== "quran-translation" && parsed.category !== "hadith" || parsed.categories !== void 0 && (!Array.isArray(parsed.categories) || parsed.categories.some((value) => value !== "quran" && value !== "quran-translation" && value !== "hadith")) || typeof parsed.label !== "string" || !parsed.parts || typeof parsed.parts !== "object") {
        throw new Error("Invalid offline manifest");
      }
      const partEntries = Object.entries(parsed.parts);
      const fileNames = /* @__PURE__ */ new Set();
      for (const [partId, value] of partEntries) {
        if (!partId || !value || typeof value !== "object") throw new Error("Invalid offline manifest part");
        const item = value;
        if (typeof item.fileName !== "string" || !item.fileName || typeof item.bytes !== "number" || !Number.isFinite(item.bytes) || item.bytes < 0) throw new Error("Invalid offline manifest part");
        if (fileNames.has(item.fileName)) throw new Error("Duplicate offline manifest file");
        fileNames.add(item.fileName);
        if (item.sha256 !== void 0 && (typeof item.sha256 !== "string" || !/^[0-9a-f]{64}$/iu.test(item.sha256))) throw new Error("Invalid offline manifest checksum");
      }
      return parsed;
    } catch (error) {
      throw new AppError("The offline database manifest is corrupted. Reinstall it.", "parse", void 0, { cause: error });
    }
  }
  async tryRemovePath(path) {
    const delays = [0, 100, 250, 500, 1e3, 2e3, 4e3];
    for (const delay of delays) {
      if (delay) await new Promise((resolve) => window.setTimeout(resolve, delay));
      try {
        if (!await this.adapter.exists(path)) return true;
        await this.adapter.remove(path, true);
        return true;
      } catch {
      }
    }
    return false;
  }
  async cleanupRemovingDirectories() {
    if (!await this.adapter.exists(this.root)) return;
    const listing = await this.adapter.list(this.root);
    await Promise.all(listing.folders.filter((folder) => folder.includes(".removing-")).map((folder) => this.tryRemovePath((0, import_obsidian2.normalizePath)(`${this.root}/${folder}`))));
  }
  categoriesForManifest(manifest) {
    if (manifest.categories?.length) return manifest.categories;
    if (manifest.category) return [manifest.category];
    if (manifest.kind === "hadith") return ["hadith"];
    if (manifest.providerId === "quran-project") return ["quran", "quran-translation"];
    if (manifest.providerId === "quran-api") return manifest.id === "quran-api:arabic" ? ["quran"] : ["quran-translation"];
    return ["quran"];
  }
  async listInstalled() {
    await this.cleanupRemovingDirectories();
    if (!await this.adapter.exists(this.root)) return [];
    const listing = await this.adapter.list(this.root);
    const ids = listing.folders.filter((folder) => !folder.endsWith(".installing") && !folder.endsWith(".backup") && !folder.includes(".installing-") && !folder.includes(".backup-") && !folder.includes(".removing-")).map((folder) => {
      const encoded = folder.slice(this.root.length + 1);
      try {
        return decodeURIComponent(encoded);
      } catch {
        return encoded;
      }
    });
    const manifests = await Promise.all(ids.map((id) => this.readManifest(id)));
    const installed = [];
    for (const manifest of manifests) {
      if (!manifest) continue;
      installed.push({
        id: manifest.id,
        providerId: manifest.providerId,
        kind: manifest.kind,
        category: manifest.category ?? this.categoriesForManifest(manifest)[0],
        categories: this.categoriesForManifest(manifest),
        label: manifest.label,
        description: manifest.description,
        installedAt: manifest.installedAt,
        sizeBytes: manifest.sizeBytes,
        parts: Object.keys(manifest.parts)
      });
    }
    return installed.sort((a, b) => a.label.localeCompare(b.label));
  }
  /**
   * Read and parse one installed offline database part. Checksums are verified lazily
   * on first access so installation stays fast while later disk corruption is still
   * detected before data is returned; verification is process-local by design.
   */
  async getJson(databaseId, partId) {
    const manifest = await this.readManifest(databaseId);
    if (!manifest) return null;
    const part = manifest.parts[partId];
    if (!part) return null;
    const key = `${databaseId}:${partId}`;
    const path = (0, import_obsidian2.normalizePath)(`${this.root}/${safeDatabaseName(databaseId)}/${part.fileName}`);
    try {
      const text2 = await this.adapter.read(path);
      const parsed = JSON.parse(text2);
      if (!this.verifiedParts.has(key) && part.sha256) {
        const actual = await sha256(text2);
        if (actual && actual !== part.sha256) {
          this.verifiedParts.delete(key);
          throw new AppError("The offline database is corrupted. Please reinstall it.", "parse");
        }
        this.verifiedParts.add(key);
      }
      return parsed;
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError("The offline database could not be read. Please reinstall it.", "parse", void 0, { cause: error });
    }
  }
  /**
   * Report the identity of the installed copy without reading its data. Providers
   * use this to keep a small parsed-book cache while still noticing reinstalls.
   */
  async revision(databaseId) {
    try {
      const manifest = await this.readManifest(databaseId);
      return manifest ? `${manifest.installedAt}:${manifest.sizeBytes}` : null;
    } catch {
      return null;
    }
  }
  /**
   * Install an offline database through the transactional install path. A per-ID
   * promise lock deduplicates concurrent installs, preventing two UI actions from
   * writing competing partial copies of the same database.
   */
  async install(definition, http, signal, onProgress) {
    const existing = this.installLocks.get(definition.id);
    if (existing) return existing;
    const promise = this.installUnlocked(definition, http, signal, onProgress);
    this.installLocks.set(definition.id, promise);
    try {
      return await promise;
    } finally {
      this.installLocks.delete(definition.id);
    }
  }
  async renameWithRetry(oldPath, newPath) {
    const delays = [0, 100, 250, 500, 1e3, 2e3, 4e3];
    let lastError;
    for (const delay of delays) {
      if (delay) await new Promise((resolve) => window.setTimeout(resolve, delay));
      try {
        await this.adapter.rename(oldPath, newPath);
        return;
      } catch (error) {
        lastError = error;
      }
    }
    const detail = lastError instanceof Error ? lastError.message : "unknown error";
    throw new AppError(`The offline database is currently in use and cannot be replaced. Close any process using its files and try again. (${detail})`, "unknown", void 0, { cause: lastError });
  }
  async installUnlocked(definition, http, signal, onProgress) {
    if (!definition.parts.length) throw new AppError("This offline database has no downloadable data.", "validation");
    const uniqueParts = new Set(definition.parts.map((part) => part.id));
    if (uniqueParts.size !== definition.parts.length) throw new AppError("This offline database has duplicate data parts.", "validation");
    const uniqueFiles = /* @__PURE__ */ new Set();
    for (const part of definition.parts) {
      if (!/^https?:\/\//iu.test(part.url)) throw new AppError(`Offline source for \u201C${part.label}\u201D must use HTTP(S).`, "validation");
      const fileName = safePartFileName(part);
      if (uniqueFiles.has(fileName)) throw new AppError("This offline database has duplicate file names.", "validation");
      uniqueFiles.add(fileName);
    }
    await this.ensureDirectory(this.root);
    const finalDir = (0, import_obsidian2.normalizePath)(`${this.root}/${safeDatabaseName(definition.id)}`);
    const tempDir = `${finalDir}.installing-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await this.ensureDirectory(tempDir);
    const manifestParts = {};
    let sizeBytes = 0;
    try {
      for (let index = 0; index < definition.parts.length; index++) {
        if (signal.aborted) throw new AppError("Operation cancelled.", "cancelled");
        const part = definition.parts[index];
        onProgress?.({ databaseId: definition.id, completed: index, total: definition.parts.length, partLabel: part.label });
        const raw = await http.getText(part.url, signal);
        if (!raw.text.trim()) throw new AppError(`Downloaded data for \u201C${part.label}\u201D is empty.`, "parse", raw.status);
        try {
          JSON.parse(raw.text);
        } catch (error) {
          throw new AppError(`Downloaded data for \u201C${part.label}\u201D is not valid JSON.`, "parse", raw.status, { cause: error });
        }
        const fileName = safePartFileName(part);
        const path = (0, import_obsidian2.normalizePath)(`${tempDir}/${fileName}`);
        await this.adapter.write(path, raw.text);
        const bytes = byteLength(raw.text);
        sizeBytes += bytes;
        manifestParts[part.id] = { fileName, bytes, sha256: await sha256(raw.text) };
        onProgress?.({ databaseId: definition.id, completed: index + 1, total: definition.parts.length, partLabel: part.label });
      }
      const manifest = {
        version: 1,
        id: definition.id,
        providerId: definition.providerId,
        kind: definition.kind,
        category: definition.category,
        categories: definition.categories,
        label: definition.label,
        description: definition.description,
        installedAt: Date.now(),
        sizeBytes,
        parts: manifestParts
      };
      await this.adapter.write((0, import_obsidian2.normalizePath)(`${tempDir}/${MANIFEST_FILE}`), JSON.stringify(manifest));
      const backupDir = `${finalDir}.backup-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      if (await this.adapter.exists(finalDir)) await this.renameWithRetry(finalDir, backupDir);
      try {
        await this.renameWithRetry(tempDir, finalDir);
      } catch (error) {
        if (await this.adapter.exists(backupDir) && !await this.adapter.exists(finalDir)) {
          try {
            await this.adapter.rename(backupDir, finalDir);
          } catch {
          }
        }
        throw error;
      }
      if (await this.adapter.exists(backupDir)) {
        if (!await this.tryRemovePath(backupDir)) {
          const cleanupPath = `${backupDir}.removing-${Date.now()}`;
          try {
            await this.adapter.rename(backupDir, cleanupPath);
            void this.tryRemovePath(cleanupPath);
          } catch {
          }
        }
      }
      for (const part of definition.parts) this.verifiedParts.delete(`${definition.id}:${part.id}`);
      return {
        id: manifest.id,
        providerId: manifest.providerId,
        kind: manifest.kind,
        category: manifest.category ?? this.categoriesForManifest(manifest)[0],
        categories: this.categoriesForManifest(manifest),
        label: manifest.label,
        description: manifest.description,
        installedAt: manifest.installedAt,
        sizeBytes: manifest.sizeBytes,
        parts: Object.keys(manifest.parts)
      };
    } catch (error) {
      try {
        if (await this.adapter.exists(tempDir)) await this.adapter.remove(tempDir, true);
      } catch {
      }
      throw error;
    }
  }
  async removeWithRetry(path) {
    if (await this.tryRemovePath(path)) return;
    const removingPath = (0, import_obsidian2.normalizePath)(`${path}.removing-${Date.now()}`);
    try {
      if (await this.adapter.exists(path)) {
        await this.adapter.rename(path, removingPath);
        void this.tryRemovePath(removingPath);
        return;
      }
      return;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new AppError(`The offline database could not be removed. Close any process using its files and try again. (${detail})`, "unknown", void 0, { cause: error });
    }
  }
  async remove(databaseId) {
    const finalDir = (0, import_obsidian2.normalizePath)(`${this.root}/${safeDatabaseName(databaseId)}`);
    if (await this.adapter.exists(finalDir)) await this.removeWithRetry(finalDir);
    for (const key of [...this.verifiedParts]) if (key.startsWith(`${databaseId}:`)) this.verifiedParts.delete(key);
  }
};

// src/obsidian/persistent-json-store.ts
var import_obsidian3 = require("obsidian");
function hashKey(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(16).padStart(8, "0");
}
var ObsidianPersistentJsonStore = class {
  constructor(app, pluginId, subdir = "provider-cache") {
    __publicField(this, "adapter");
    __publicField(this, "root");
    __publicField(this, "rootReady", false);
    // Concurrent writes must share mkdir work so Vault adapters do not race on folders.
    __publicField(this, "rootPromise");
    this.adapter = app.vault.adapter;
    this.root = (0, import_obsidian3.normalizePath)(`${app.vault.configDir}/plugins/${pluginId}/${subdir}`);
  }
  async ensureRoot() {
    if (this.rootReady) return;
    if (this.rootPromise) return this.rootPromise;
    const pending = (async () => {
      const parts = this.root.split("/").filter(Boolean);
      let current = this.root.startsWith("/") ? "/" : "";
      for (const part of parts) {
        current = current ? `${current}/${part}` : part;
        if (!await this.adapter.exists(current)) await this.adapter.mkdir(current);
      }
      this.rootReady = true;
    })();
    this.rootPromise = pending;
    try {
      await pending;
    } finally {
      if (this.rootPromise === pending) this.rootPromise = void 0;
    }
  }
  path(key) {
    return (0, import_obsidian3.normalizePath)(`${this.root}/${hashKey(key)}.json`);
  }
  /**
   * Read a cached value and verify the embedded key. Because the filename uses a
   * small hash, a theoretical collision must become a cache miss rather than return
   * another provider's data.
   */
  async get(key) {
    try {
      const path = this.path(key);
      if (!await this.adapter.exists(path)) return null;
      const parsed = JSON.parse(await this.adapter.read(path));
      if (parsed.version !== 1 || parsed.key !== key) return null;
      return parsed.value === void 0 ? null : parsed.value;
    } catch {
      return null;
    }
  }
  async set(key, value) {
    await this.ensureRoot();
    await this.adapter.write(this.path(key), JSON.stringify({ version: 1, key, value }));
  }
  async delete(key) {
    const path = this.path(key);
    if (await this.adapter.exists(path)) await this.adapter.remove(path);
  }
  async clear() {
    if (!await this.adapter.exists(this.root)) return;
    const listing = await this.adapter.list(this.root);
    await Promise.all([...listing.files, ...listing.folders].map((path) => this.adapter.remove((0, import_obsidian3.normalizePath)(path), true).catch(() => void 0)));
  }
};

// src/core/commands.ts
var COMMAND_DEFINITIONS = [
  { id: "fetch-quran", name: "Fetch Quran", defaultEnabled: true },
  { id: "fetch-hadith", name: "Fetch Hadith", defaultEnabled: true },
  { id: "set-quran-provider", name: "Set Quran content provider", defaultEnabled: false },
  { id: "set-quran-language", name: "Set Quran translation language", defaultEnabled: false },
  { id: "set-quran-translation", name: "Set Quran translation", defaultEnabled: false },
  { id: "set-quran-website", name: "Set Quran link website", defaultEnabled: false },
  { id: "set-hadith-provider", name: "Set Hadith content provider", defaultEnabled: false },
  { id: "set-hadith-translation", name: "Set Hadith translation", defaultEnabled: false },
  { id: "manage-offline-databases", name: "Manage offline databases", defaultEnabled: false },
  { id: "check-provider-health", name: "Check provider health", defaultEnabled: true },
  { id: "normalize-salutations", name: "Normalize all salutations to \uFDFA", defaultEnabled: true },
  { id: "convert-ra", name: "Convert Variants of RA used for the Sahaba to \u0631\u064E\u0636\u0650\u064A\u064E \u0627\u0644\u0644\u0647\u064F \u0639\u064E\u0646\u0652\u0647\u064F", defaultEnabled: false },
  { id: "toggle-text-conversions", name: "Toggle Text Conversions", defaultEnabled: false }
];
function defaultCommandVisibility() {
  return Object.fromEntries(COMMAND_DEFINITIONS.map((command) => [command.id, command.defaultEnabled]));
}

// src/settings/model.ts
var DEFAULT_QURAN_OPTIONS = {
  arabic: true,
  english: true,
  grading: false,
  link: true,
  quranRangeMode: "line-by-line",
  quranFootnotes: false,
  hadithSeparateIsnad: true
};
var DEFAULT_HADITH_OPTIONS = {
  arabic: true,
  english: true,
  grading: true,
  link: true,
  quranRangeMode: "line-by-line",
  quranFootnotes: false,
  hadithSeparateIsnad: true
};
function mergeReplacementRules(raw, legacyRabbConversion) {
  const source = Array.isArray(raw) ? raw : [];
  const defaults = structuredClone(DEFAULT_REPLACEMENT_RULES);
  const byId = /* @__PURE__ */ new Map();
  for (const rule of source) {
    if (!rule || typeof rule !== "object") continue;
    const value = rule;
    if (typeof value.id !== "string" || typeof value.from !== "string" || typeof value.to !== "string") continue;
    if (value.id.startsWith("custom-") && (!value.from.trim() || !value.to.trim())) continue;
    const base = defaults.find((item) => item.id === value.id);
    byId.set(value.id, {
      ...base ?? { id: value.id, language: "en", title: value.title ?? value.description ?? "Custom replacement", description: "", from: value.from, to: value.to, enabled: true, caseSensitive: false },
      ...value,
      language: "en",
      title: typeof value.title === "string" ? value.title : base?.title ?? (value.description ?? "Custom replacement"),
      description: typeof value.description === "string" ? value.description : base?.description ?? "",
      caseSensitive: false
    });
  }
  for (const rule of defaults) {
    if (!byId.has(rule.id)) byId.set(rule.id, rule);
  }
  const lord = byId.get("lord-to-rabb");
  if (lord && typeof legacyRabbConversion === "boolean") lord.enabled = legacyRabbConversion;
  return [...byId.values()];
}
var DEFAULT_SETTINGS = {
  schemaVersion: 14,
  quranProvider: "alquran-cloud",
  hadithProvider: "hadith-api",
  quranLanguage: "en",
  quranTranslation: "hilali-khan",
  hadithLanguage: "en",
  hadithTranslation: "eng",
  quranWebsite: "quran-unlocked",
  customQuranUrl: "https://www.myquranwebsite.com/$surah/$ayah-$ayahlast",
  formatting: { ...DEFAULT_FORMATTING, showLink: true, quranAyahOpen: "{", quranAyahClose: "}", quranAyahStyle: "curly", callout: "quote", customCalloutType: "" },
  replacementRules: DEFAULT_REPLACEMENT_RULES.map((x) => ({ ...x })),
  blessingNormalization: true,
  cacheEnabled: true,
  romanEnglish: true,
  raNormalization: false,
  textConversionsEnabled: true,
  quranFetchLimit: 30,
  hadithFetchLimit: 15,
  commandVisibility: defaultCommandVisibility(),
  lastQuranOptions: structuredClone(DEFAULT_QURAN_OPTIONS),
  lastHadithOptions: structuredClone(DEFAULT_HADITH_OPTIONS)
};
function normalizeOptions(raw, defaults) {
  const source = raw && typeof raw === "object" ? raw : {};
  return {
    ...defaults,
    ...source,
    quranRangeMode: ["line-by-line", "merged", "alternate", "numbered"].includes(source.quranRangeMode) ? source.quranRangeMode : source.quranMergeAyahs === true ? "merged" : defaults.quranRangeMode,
    quranFootnotes: source.quranFootnotes === true,
    hadithSeparateIsnad: source.hadithSeparateIsnad !== false
  };
}
function normalizeFormatting(raw) {
  const allowed = /* @__PURE__ */ new Set(["none", "quote", "note", "abstract", "info", "todo", "tip", "success", "question", "warning", "failure", "danger", "bug", "example", "cite", "custom"]);
  const callout = allowed.has(raw.callout) ? raw.callout : "quote";
  return { ...raw, callout, customCalloutType: typeof raw.customCalloutType === "string" ? raw.customCalloutType : "" };
}
function migrateSettings(raw) {
  if (!raw || typeof raw !== "object") return structuredClone(DEFAULT_SETTINGS);
  const rawSource = raw;
  const { arabicEnabled: _arabicEnabled, englishEnabled: _englishEnabled, hadithGradingEnabled: _hadithGradingEnabled, linkInsertion: _linkInsertion, rabbConversion: _legacyRabbConversion, romanEnglish: _sourceRomanEnglish, romanEnglishAyat: _legacyRomanEnglishAyat, disableAllTextConversions: _legacyDisableAllTextConversions, ...source } = rawSource;
  const legacyApiHadithDefault = source.schemaVersion !== void 0 && source.schemaVersion < 8 && source.hadithProvider === "hadith-api";
  const legacyProviderDefaults = source.schemaVersion !== void 0 && source.schemaVersion < 11;
  const legacyQuran = {
    ...DEFAULT_QURAN_OPTIONS,
    arabic: _arabicEnabled ?? DEFAULT_QURAN_OPTIONS.arabic,
    english: _englishEnabled ?? DEFAULT_QURAN_OPTIONS.english,
    link: _linkInsertion ?? DEFAULT_QURAN_OPTIONS.link
  };
  const legacyHadith = {
    ...DEFAULT_HADITH_OPTIONS,
    arabic: _arabicEnabled ?? DEFAULT_HADITH_OPTIONS.arabic,
    english: _englishEnabled ?? DEFAULT_HADITH_OPTIONS.english,
    grading: _hadithGradingEnabled ?? DEFAULT_HADITH_OPTIONS.grading,
    link: _linkInsertion ?? DEFAULT_HADITH_OPTIONS.link
  };
  const sourceCommandVisibility = source.commandVisibility;
  const normalizedCommandVisibility = { ...sourceCommandVisibility ?? {} };
  if (typeof normalizedCommandVisibility["insert-quran"] === "boolean" && typeof normalizedCommandVisibility["fetch-quran"] !== "boolean") normalizedCommandVisibility["fetch-quran"] = normalizedCommandVisibility["insert-quran"];
  if (typeof normalizedCommandVisibility["insert-hadith"] === "boolean" && typeof normalizedCommandVisibility["fetch-hadith"] !== "boolean") normalizedCommandVisibility["fetch-hadith"] = normalizedCommandVisibility["insert-hadith"];
  if (typeof normalizedCommandVisibility["disable-all-text-conversions"] === "boolean" && typeof normalizedCommandVisibility["toggle-text-conversions"] !== "boolean") normalizedCommandVisibility["toggle-text-conversions"] = normalizedCommandVisibility["disable-all-text-conversions"];
  delete normalizedCommandVisibility["insert-quran"];
  delete normalizedCommandVisibility["insert-hadith"];
  delete normalizedCommandVisibility["disable-all-text-conversions"];
  const knownDefaults = defaultCommandVisibility();
  const legacyAllEnabledIds = Object.keys(knownDefaults);
  const isPreV13Settings = source.schemaVersion === void 0 || source.schemaVersion < 13;
  const allLegacyCommandsWereEnabled = isPreV13Settings && !!sourceCommandVisibility && legacyAllEnabledIds.every((id) => normalizedCommandVisibility[id] === true);
  const migratedCommandVisibility = allLegacyCommandsWereEnabled ? knownDefaults : { ...knownDefaults, ...normalizedCommandVisibility };
  return {
    ...structuredClone(DEFAULT_SETTINGS),
    ...source,
    schemaVersion: 14,
    quranProvider: legacyProviderDefaults && source.quranProvider === "quran-unlocked" ? "alquran-cloud" : typeof source.quranProvider === "string" && source.quranProvider.trim() ? source.quranProvider : DEFAULT_SETTINGS.quranProvider,
    replacementRules: mergeReplacementRules(source.replacementRules, _legacyRabbConversion),
    formatting: normalizeFormatting({ ...DEFAULT_FORMATTING, ...source.formatting }),
    quranLanguage: typeof source.quranLanguage === "string" && source.quranLanguage.trim() ? source.quranLanguage : "en",
    quranTranslation: typeof source.quranTranslation === "string" && source.quranTranslation.trim() ? source.quranTranslation : "hilali-khan",
    hadithLanguage: legacyApiHadithDefault ? "en" : typeof source.hadithLanguage === "string" && source.hadithLanguage.trim() ? source.hadithLanguage : "en",
    hadithTranslation: legacyApiHadithDefault ? "eng" : typeof source.hadithTranslation === "string" && source.hadithTranslation.trim() ? source.hadithTranslation : "eng",
    romanEnglish: typeof _sourceRomanEnglish === "boolean" ? _sourceRomanEnglish : _legacyRomanEnglishAyat === true || _sourceRomanEnglish === void 0,
    raNormalization: source.raNormalization === true,
    // Legacy setting was named `disableAllTextConversions`, so its boolean had the opposite meaning.
    textConversionsEnabled: typeof source.textConversionsEnabled === "boolean" ? source.textConversionsEnabled : typeof _legacyDisableAllTextConversions === "boolean" ? !_legacyDisableAllTextConversions : DEFAULT_SETTINGS.textConversionsEnabled,
    quranFetchLimit: typeof source.quranFetchLimit === "number" && Number.isInteger(source.quranFetchLimit) && source.quranFetchLimit > 0 ? source.quranFetchLimit : DEFAULT_SETTINGS.quranFetchLimit,
    hadithFetchLimit: typeof source.hadithFetchLimit === "number" && Number.isInteger(source.hadithFetchLimit) && source.hadithFetchLimit > 0 ? source.hadithFetchLimit : DEFAULT_SETTINGS.hadithFetchLimit,
    commandVisibility: migratedCommandVisibility,
    lastQuranOptions: normalizeOptions(source.lastQuranOptions, legacyQuran),
    lastHadithOptions: normalizeOptions(source.lastHadithOptions, legacyHadith)
  };
}

// src/obsidian/modals.ts
var import_obsidian4 = require("obsidian");
function decodeHtmlEntities2(value) {
  return value.replace(/&#39;|&#x27;|&apos;/gi, "'").replace(/&quot;|&#x22;/gi, '"').replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}
var InputModal = class extends import_obsidian4.Modal {
  constructor(app, title, placeholder, initial, onSubmit, onCancel, validateInput, inputMode = "numeric", inputType = "text") {
    super(app);
    this.title = title;
    this.placeholder = placeholder;
    this.initial = initial;
    this.onSubmit = onSubmit;
    this.onCancel = onCancel;
    this.validateInput = validateInput;
    this.inputMode = inputMode;
    this.inputType = inputType;
    __publicField(this, "input");
    __publicField(this, "errorEl");
  }
  onOpen() {
    this.contentEl.empty();
    this.titleEl.setText(this.title);
    new import_obsidian4.Setting(this.contentEl).setName("Reference").addText((t) => {
      this.input = t.inputEl;
      t.setPlaceholder(this.placeholder).setValue(this.initial);
      this.input.type = this.inputType;
      this.input.inputMode = this.inputMode;
      this.input.autocomplete = "off";
      this.input.spellcheck = false;
    });
    this.errorEl = this.contentEl.createDiv({ cls: "qhf-input-error" });
    const row = this.contentEl.createDiv({ cls: "qhf-modal-actions" });
    row.createEl("button", { text: "Cancel" }).onclick = () => {
      this.close();
      this.onCancel();
    };
    const submit = row.createEl("button", { text: "Continue", cls: "mod-cta" });
    const submitValue = () => {
      const value = this.input.value.trim();
      const error = this.validateInput?.(value) ?? null;
      if (error) {
        this.errorEl.setText(error);
        this.input.addClass("qhf-invalid");
        this.input.setAttribute("aria-invalid", "true");
        this.input.focus();
        return;
      }
      this.input.removeClass("qhf-invalid");
      this.input.removeAttribute("aria-invalid");
      this.errorEl.empty();
      this.close();
      void this.onSubmit(value);
    };
    submit.onclick = submitValue;
    this.input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        submitValue();
      }
      if (e.key === "Escape") {
        this.close();
        this.onCancel();
      }
    });
    window.setTimeout(() => this.input.focus(), 0);
  }
  onClose() {
    this.contentEl.empty();
  }
};
var ChoiceModal = class extends import_obsidian4.FuzzySuggestModal {
  constructor(app, items, getText, onChoose, placeholder = "Choose\u2026") {
    super(app);
    this.items = items;
    this.getText = getText;
    this.onChoose = onChoose;
    this.setPlaceholder(placeholder);
  }
  getItems() {
    return this.items;
  }
  getItemText(item) {
    return this.getText(item);
  }
  onChooseItem(item) {
    this.close();
    void this.onChoose(item);
  }
};
var CommandVisibilityModal = class extends import_obsidian4.Modal {
  constructor(app, items, onSave) {
    super(app);
    this.items = items;
    this.onSave = onSave;
  }
  onOpen() {
    this.contentEl.empty();
    this.titleEl.setText("Command palette");
    const draft = Object.fromEntries(this.items.map((item) => [item.id, item.enabled]));
    for (const item of this.items) {
      new import_obsidian4.Setting(this.contentEl).setName(item.name).addToggle((t) => t.setValue(item.enabled).onChange((v) => {
        draft[item.id] = v;
      }));
    }
    const row = this.contentEl.createDiv({ cls: "qhf-modal-actions" });
    row.createEl("button", { text: "Cancel" }).onclick = () => this.close();
    row.createEl("button", { text: "Save", cls: "mod-cta" }).onclick = () => {
      this.close();
      void this.onSave(draft);
    };
  }
  onClose() {
    this.contentEl.empty();
  }
};
var QuranSurahModal = class extends import_obsidian4.FuzzySuggestModal {
  constructor(app, onChoose) {
    super(app);
    this.onChoose = onChoose;
    this.setPlaceholder("Search surah\u2026");
  }
  getItems() {
    return SURAH_NAMES.map((name, i) => ({ number: i + 1, name }));
  }
  getItemText(item) {
    return `${String(item.number).padStart(3, "0")} ${item.name}`;
  }
  onChooseItem(item) {
    this.close();
    void this.onChoose(item.number);
  }
};
var CollectionModal = class extends import_obsidian4.FuzzySuggestModal {
  constructor(app, collections, onChoose, offlineCollectionIds = /* @__PURE__ */ new Set()) {
    super(app);
    this.collections = collections;
    this.onChoose = onChoose;
    this.offlineCollectionIds = offlineCollectionIds;
    this.setPlaceholder("Search collection\u2026");
  }
  getItems() {
    return this.collections;
  }
  getItemText(item) {
    const normalized = normalizeHadithCollectionMetadata(item);
    const name = decodeHtmlEntities2(normalized.name);
    const author = normalized.author ? formatScholarName(decodeHtmlEntities2(normalized.author)) : "";
    const base = author ? `${name} \u2014 ${author}` : name;
    return this.offlineCollectionIds.has(item.id) ? `${base} \u2B07\uFE0F` : base;
  }
  onChooseItem(item) {
    this.close();
    this.onChoose(item);
  }
};
var OptionsModal = class extends import_obsidian4.Modal {
  constructor(app, initial, capabilities, onSubmit, onCancel) {
    super(app);
    this.initial = initial;
    this.capabilities = capabilities;
    this.onSubmit = onSubmit;
    this.onCancel = onCancel;
  }
  onOpen() {
    this.contentEl.empty();
    this.titleEl.setText("Output options");
    const opts = { ...this.initial };
    const make = (name, label, enabled) => {
      const setting = new import_obsidian4.Setting(this.contentEl).setName(label);
      if (!enabled) {
        setting.setDisabled(true);
        opts[name] = false;
      }
      setting.addToggle((t) => t.setValue(enabled && opts[name]).onChange((v) => {
        opts[name] = v;
      }));
    };
    make("arabic", "Arabic text", this.capabilities.arabic);
    make("english", "English text", this.capabilities.english);
    if (this.capabilities.grading && !this.capabilities.quran) make("grading", "Grading", true);
    make("link", "Insert link", true);
    if (this.capabilities.quran) {
      make("quranFootnotes", "Footnotes", true);
      new import_obsidian4.Setting(this.contentEl).setName("Ayah formatting").setDesc("Choose how a Quran range is arranged.").addDropdown((d) => d.addOptions({
        "line-by-line": "Line by line",
        "merged": "Merge ayahs",
        "alternate": "Alternate Arabic / English",
        "numbered": "Line by line with numbering"
      }).setValue(opts.quranRangeMode).onChange((v) => {
        opts.quranRangeMode = v;
      }));
    }
    if (this.capabilities.isnad) make("hadithSeparateIsnad", "Chain of Narration (Isnaad)", true);
    const row = this.contentEl.createDiv({ cls: "qhf-modal-actions" });
    const cancel = row.createEl("button", { text: "Cancel" });
    cancel.onclick = () => {
      this.close();
      this.onCancel();
    };
    const submit = row.createEl("button", { text: "Fetch", cls: "mod-cta" });
    let fetching = false;
    const submitOptions = async () => {
      if (fetching) return;
      fetching = true;
      submit.disabled = true;
      cancel.disabled = true;
      submit.empty();
      (0, import_obsidian4.setIcon)(submit, "loader-circle");
      const label = submit.createSpan({ text: " Fetching\u2026" });
      label.addClass("qhf-fetching-label");
      try {
        await this.onSubmit(opts);
      } finally {
        this.close();
      }
    };
    submit.onclick = () => {
      void submitOptions();
    };
    this.contentEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        void submitOptions();
      }
    }, true);
    window.setTimeout(() => submit.focus(), 0);
  }
};
var ReplacementRuleModal = class extends import_obsidian4.Modal {
  constructor(app, rule, onSave, onDelete, onCancel, textConversionsEnabled = true, isNew = false) {
    super(app);
    this.rule = rule;
    this.onSave = onSave;
    this.onDelete = onDelete;
    this.onCancel = onCancel;
    this.textConversionsEnabled = textConversionsEnabled;
    this.isNew = isNew;
  }
  onOpen() {
    this.contentEl.empty();
    this.titleEl.setText(this.isNew ? "Add text conversion" : "Edit text conversion");
    const textConversionsEnabled = typeof this.textConversionsEnabled === "function" ? this.textConversionsEnabled() : this.textConversionsEnabled;
    if (!textConversionsEnabled) {
      const warning = this.contentEl.createDiv({ cls: "qhf-text-conversion-warning mod-warning", attr: { role: "alert" } });
      warning.createEl("strong", { text: "Text conversions are currently disabled." });
      warning.createDiv({ text: "Changes made here will still be saved, but they will not be applied to fetched text until Text Conversions is enabled in settings." });
    }
    const draft = { ...this.rule };
    new import_obsidian4.Setting(this.contentEl).setName("Title").setDesc("Name shown in Text Conversion settings.").addText((t) => t.setValue(draft.title).onChange((v) => {
      draft.title = v;
    }));
    new import_obsidian4.Setting(this.contentEl).setName("Description").setDesc("Optional description.").addTextArea((t) => {
      t.setValue(draft.description);
      t.inputEl.rows = 2;
      t.onChange((v) => {
        draft.description = v;
      });
    });
    new import_obsidian4.Setting(this.contentEl).setName("Preconversion").setDesc("Whole words only; matching is case-insensitive.").addText((t) => t.setValue(draft.from).onChange((v) => {
      draft.from = v;
      updateValidation();
    }));
    new import_obsidian4.Setting(this.contentEl).setName("Postconversion").addText((t) => t.setValue(draft.to).onChange((v) => {
      draft.to = v;
      updateValidation();
    }));
    new import_obsidian4.Setting(this.contentEl).setName("Enabled").addToggle((t) => t.setValue(draft.enabled).onChange((v) => {
      draft.enabled = v;
    }));
    const validation = this.contentEl.createDiv({ cls: "qhf-validation-message" });
    const isValid = () => draft.from.trim().length > 0 && draft.to.trim().length > 0;
    const updateValidation = () => {
      validation.setText(isValid() ? "" : "Preconversion and postconversion are required.");
      saveButton.disabled = !isValid();
    };
    const actions = this.contentEl.createDiv({ cls: "qhf-modal-actions" });
    actions.createEl("button", { text: "Cancel" }).onclick = () => {
      this.close();
      this.onCancel();
    };
    actions.createEl("button", { text: "Delete" }).onclick = () => {
      this.close();
      void this.onDelete();
    };
    const saveButton = actions.createEl("button", { text: "Save", cls: "mod-cta" });
    saveButton.onclick = () => {
      if (!isValid()) {
        updateValidation();
        return;
      }
      Object.assign(this.rule, draft);
      this.close();
      void this.onSave(draft);
    };
    updateValidation();
  }
};
var PreviewModal = class extends import_obsidian4.Modal {
  constructor(app, markdown, onInsert, onBack) {
    super(app);
    this.markdown = markdown;
    this.onInsert = onInsert;
    this.onBack = onBack;
    __publicField(this, "textarea");
    __publicField(this, "insertButton");
  }
  onOpen() {
    this.contentEl.empty();
    this.modalEl.addClass("qhf-preview-modal");
    this.titleEl.setText("Preview");
    this.textarea = this.contentEl.createEl("textarea", { cls: "qhf-preview" });
    this.textarea.value = this.markdown;
    this.textarea.readOnly = false;
    this.textarea.rows = 30;
    this.textarea.spellcheck = false;
    const row = this.contentEl.createDiv({ cls: "qhf-modal-actions" });
    if (this.onBack) row.createEl("button", { text: "Back" }).onclick = () => {
      this.close();
      this.onBack?.();
    };
    row.createEl("button", { text: "Cancel" }).onclick = () => this.close();
    row.createEl("button", { text: "Copy" }).onclick = () => {
      void (async () => {
        try {
          if (!navigator.clipboard?.writeText) throw new Error("Clipboard copy is unavailable.");
          await navigator.clipboard.writeText(this.textarea.value);
          this.close();
          new import_obsidian4.Notice("Copied to clipboard.");
        } catch {
          new import_obsidian4.Notice("Could not copy to clipboard.");
        }
      })();
    };
    this.insertButton = row.createEl("button", { text: "Insert", cls: "mod-cta" });
    this.insertButton.onclick = () => {
      const value = this.textarea.value;
      this.close();
      this.onInsert(value);
    };
    const focusInsertButton = () => {
      this.textarea.blur();
      this.insertButton.focus({ preventScroll: true });
    };
    window.requestAnimationFrame(() => {
      focusInsertButton();
      window.requestAnimationFrame(focusInsertButton);
    });
    window.setTimeout(focusInsertButton, 50);
  }
  onClose() {
    this.modalEl.removeClass("qhf-preview-modal");
    this.contentEl.empty();
  }
};
var OfflineDatabaseModal = class extends import_obsidian4.Modal {
  constructor(app, definitions, installed, providers, onInstall, onRemove) {
    super(app);
    this.onInstall = onInstall;
    this.onRemove = onRemove;
    __publicField(this, "states", /* @__PURE__ */ new Map());
    __publicField(this, "controllers", /* @__PURE__ */ new Set());
    __publicField(this, "searchInput");
    __publicField(this, "listEl");
    __publicField(this, "statusEl");
    __publicField(this, "definitions");
    __publicField(this, "providers");
    __publicField(this, "showDownloadedOnly", false);
    __publicField(this, "showQuran", true);
    __publicField(this, "showQuranTranslation", true);
    __publicField(this, "showHadith", true);
    this.providers = providers;
    for (const item of installed) this.states.set(item.id, item);
    const known = new Set(definitions.map((item) => item.id));
    const installedDefinitions = installed.filter((item) => !known.has(item.id)).map((item) => ({
      id: item.id,
      providerId: item.providerId,
      kind: item.kind,
      label: item.label,
      description: item.description || "Installed offline database.",
      parts: []
    }));
    this.definitions = [...definitions, ...installedDefinitions];
  }
  onOpen() {
    this.contentEl.empty();
    this.titleEl.setText("Offline databases");
    new import_obsidian4.Setting(this.contentEl).setName("Search").addText((t) => {
      this.searchInput = t.inputEl;
      t.setPlaceholder("Search provider, book, language, or author\u2026");
      this.searchInput.oninput = () => this.render();
    });
    const filterRow = this.contentEl.createDiv({ cls: "qhf-offline-filters" });
    this.createFilterButton(filterRow, "Downloaded", () => {
      this.showDownloadedOnly = !this.showDownloadedOnly;
      this.render();
    }, () => this.showDownloadedOnly);
    this.createFilterButton(filterRow, "Quran", () => {
      this.showQuran = !this.showQuran;
      this.render();
    }, () => this.showQuran);
    this.createFilterButton(filterRow, "Quran Translation", () => {
      this.showQuranTranslation = !this.showQuranTranslation;
      this.render();
    }, () => this.showQuranTranslation);
    this.createFilterButton(filterRow, "Hadith", () => {
      this.showHadith = !this.showHadith;
      this.render();
    }, () => this.showHadith);
    this.statusEl = this.contentEl.createDiv({ cls: "qhf-offline-status" });
    this.listEl = this.contentEl.createDiv({ cls: "qhf-offline-list" });
    this.render();
    window.setTimeout(() => this.searchInput.focus(), 0);
  }
  createFilterButton(parent, label, onClick, isActive) {
    const button = parent.createEl("button", { text: label, cls: "qhf-filter-button" });
    button.type = "button";
    const sync = () => {
      const active = isActive();
      button.setAttribute("aria-pressed", String(active));
      button.toggleClass("qhf-filter-active", active);
    };
    button.onclick = () => {
      onClick();
      sync();
    };
    sync();
    return button;
  }
  matches(definition, query) {
    const downloaded = this.states.has(definition.id);
    if (this.showDownloadedOnly && !downloaded) return false;
    const categories = definition.categories?.length ? definition.categories : definition.category ? [definition.category] : [definition.kind];
    const hasQuran = categories.includes("quran");
    const hasQuranTranslation = categories.includes("quran-translation");
    const hasHadith = categories.includes("hadith");
    if (hasHadith && !this.showHadith) return false;
    if ((hasQuran || hasQuranTranslation) && !(hasQuran && this.showQuran) && !(hasQuranTranslation && this.showQuranTranslation)) return false;
    return !query || `${definition.providerId} ${definition.label} ${definition.description}`.toLocaleLowerCase("en-US").includes(query);
  }
  providerMatches(provider, query) {
    if (this.showDownloadedOnly) return false;
    if (provider.kind === "hadith" && !this.showHadith) return false;
    if (provider.kind === "quran" && !this.showQuran && !this.showQuranTranslation) return false;
    return !query || `${provider.id} ${provider.name}`.toLocaleLowerCase("en-US").includes(query);
  }
  render() {
    const query = this.searchInput?.value.trim().toLocaleLowerCase("en-US") ?? "";
    const matches = this.definitions.filter((def) => this.matches(def, query)).sort((a, b) => `${a.providerId}:${a.label}`.localeCompare(`${b.providerId}:${b.label}`));
    const matchingProviderIds = new Set(matches.map((def) => def.providerId));
    const emptyProviders = this.providers.filter(
      (provider) => !matchingProviderIds.has(provider.id) && this.providerMatches(provider, query) && !this.definitions.some((def) => def.providerId === provider.id)
    ).sort((a, b) => a.name.localeCompare(b.name));
    this.listEl.empty();
    const visible = query || matches.length <= 120 ? matches : matches.slice(0, 120);
    const total = matches.length + emptyProviders.length;
    this.statusEl.setText(query || total <= 120 ? `${total} offline database${total === 1 ? "" : "s"} / provider${total === 1 ? "" : "s"}` : `Showing 120 of ${total} offline databases. Search to find a specific database.`);
    for (const provider of emptyProviders) {
      const row = this.listEl.createDiv({ cls: "qhf-offline-row qhf-offline-unavailable" });
      const info = row.createDiv({ cls: "qhf-offline-info" });
      info.createDiv({ text: provider.name, cls: "qhf-offline-label" });
      info.createDiv({ text: "No downloadable offline database is currently implemented for this provider.", cls: "qhf-offline-description" });
      info.createDiv({ text: provider.id, cls: "qhf-offline-provider" });
    }
    if (!visible.length && !emptyProviders.length) {
      this.listEl.createDiv({ text: "No matching offline databases." });
      return;
    }
    for (const definition of visible) {
      const row = this.listEl.createDiv({ cls: "qhf-offline-row" });
      const info = row.createDiv({ cls: "qhf-offline-info" });
      info.createDiv({ text: definition.label, cls: "qhf-offline-label" });
      info.createDiv({ text: definition.description, cls: "qhf-offline-description" });
      info.createDiv({ text: definition.providerId, cls: "qhf-offline-provider" });
      if (this.states.has(definition.id)) {
        if (definition.parts.length) {
          const reinstall = row.createEl("button", { text: "Reinstall" });
          reinstall.onclick = () => void this.install(definition, reinstall);
        }
        const remove = row.createEl("button", { text: "Remove" });
        remove.onclick = () => void this.remove(definition, remove);
      } else {
        const install = row.createEl("button", { text: "Install" });
        install.onclick = () => void this.install(definition, install);
      }
    }
  }
  setLoadingButton(button, label) {
    button.empty();
    (0, import_obsidian4.setIcon)(button, "loader-circle");
    const icon = button.querySelector("svg");
    if (icon) icon.addClass("qhf-loading-icon");
    return button.createSpan({ text: label, cls: "qhf-loading-label" });
  }
  async install(definition, button) {
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    button.setAttribute("aria-label", `Installing ${definition.label}`);
    const label = this.setLoadingButton(button, "0%");
    const controller = new AbortController();
    this.controllers.add(controller);
    try {
      const installed = await this.onInstall(definition, controller.signal, (progress) => {
        const percent = progress.total > 0 ? Math.round(progress.completed / progress.total * 100) : 0;
        label.setText(`${percent}% (${progress.completed}/${progress.total})`);
      });
      this.states.set(installed.id, installed);
      new import_obsidian4.Notice(`Installed ${definition.label} for offline use.`);
    } catch (error) {
      new import_obsidian4.Notice(error instanceof Error ? error.message : "Offline database installation failed.");
    } finally {
      this.controllers.delete(controller);
      this.render();
    }
  }
  async remove(definition, button) {
    button.disabled = true;
    button.setAttribute("aria-label", `Removing ${definition.label}`);
    button.setAttribute("aria-busy", "true");
    this.setLoadingButton(button, "Removing\u2026");
    try {
      await this.onRemove(definition.id);
      this.states.delete(definition.id);
      new import_obsidian4.Notice(`Removed ${definition.label}.`);
    } catch (error) {
      new import_obsidian4.Notice(error instanceof Error ? error.message : "Offline database removal failed.");
    } finally {
      button.disabled = false;
      button.removeAttribute("aria-busy");
      this.render();
    }
  }
  onClose() {
    for (const controller of this.controllers) controller.abort();
    this.controllers.clear();
    this.contentEl.empty();
  }
};

// src/obsidian/settings-tab.ts
var import_obsidian5 = require("obsidian");
var QURAN_PROVIDERS = { "alquran-cloud": "Al Quran Cloud", "quran-unlocked": "Quran Unlocked", "quran-api": "Quran API", "quran-project": "Quran Project API" };
var HADITH_PROVIDERS = { "hadith-api": "hadith-api", "hadith-unlocked": "Hadith Unlocked", "hadith-json": "Hadith JSON" };
var FetcherSettingTab = class extends import_obsidian5.PluginSettingTab {
  constructor(app, plugin, healthChecks) {
    super(app, plugin);
    this.plugin = plugin;
    this.healthChecks = healthChecks;
    __publicField(this, "displayToken", 0);
    __publicField(this, "pendingScrollPosition");
    __publicField(this, "translationCache", /* @__PURE__ */ new Map());
  }
  /**
   * Rebuild the settings view from current plugin state. `displayToken` invalidates
   * stale asynchronous translation results, while the scroll snapshot/restore path
   * below prevents a harmless refresh from jumping the user back to the top of a long
   * settings page.
   */
  display() {
    this.renderAll();
  }
  /**
   * Obsidian 1.13 uses getSettingDefinitions() for settings search. This plugin still
   * supports Obsidian 1.9, where display() is the only available renderer, and several
   * controls load provider data asynchronously or use custom rule editors. Returning
   * an empty definition list keeps display() active on every supported version until
   * the declarative migration can cover the whole tab.
   */
  getSettingDefinitions() {
    return [];
  }
  renderAll() {
    const token = ++this.displayToken;
    const { containerEl } = this;
    containerEl.empty();
    new import_obsidian5.Setting(containerEl).setName("Quran & Hadith Fetcher").setHeading();
    this.renderSectionHeading(containerEl, "Provider Settings for Quran & Hadith", "");
    this.renderProvidersSection(containerEl, token);
    this.renderSectionHeading(containerEl, "Auto-Formatting Settings", "Control exactly how fetched Quran and Hadith content is displayed and inserted, including links, numbering, callouts, and punctuation handling.");
    this.renderFormattingSection(containerEl);
    this.renderSectionHeading(containerEl, "Text Conversion Settings", "Optionally standardize common Islamic text variants after fetching, including salutations, Sahaba honorifics, transliteration, and your custom replacement rules.");
    this.renderTextConversionSection(containerEl);
    const pending = this.pendingScrollPosition;
    if (pending) {
      const restore = () => {
        const host = this.getSettingsScrollHost();
        host.scrollTop = pending.top;
        host.scrollLeft = pending.left;
      };
      window.requestAnimationFrame(() => {
        restore();
        window.requestAnimationFrame(() => restore());
      });
      window.setTimeout(() => {
        restore();
        if (this.pendingScrollPosition === pending) this.pendingScrollPosition = void 0;
      }, 500);
    }
  }
  renderSectionHeading(containerEl, text2, description) {
    const heading = containerEl.createDiv({ cls: "qhf-settings-section-heading" });
    new import_obsidian5.Setting(heading).setName(text2).setHeading();
    if (description) heading.createDiv({ text: description, cls: "qhf-settings-section-description" });
  }
  renderProvidersSection(containerEl, token) {
    new import_obsidian5.Setting(containerEl).setName("Quran content provider").setDesc("Choose the online project used to retrieve Quran Arabic text and translations. The provider project URL is shown for reference. URL: " + (this.plugin.getQuranProviderSummaries().find((p) => p.id === this.plugin.pluginSettings.quranProvider)?.url ?? "Unknown")).addDropdown((d) => d.addOptions(QURAN_PROVIDERS).setValue(this.plugin.pluginSettings.quranProvider).onChange(async (v) => {
      this.plugin.pluginSettings.quranProvider = v;
      if (v === "alquran-cloud") {
        this.plugin.pluginSettings.quranLanguage = "en";
        this.plugin.pluginSettings.quranTranslation = "en.hilali";
      } else if (v === "quran-unlocked") {
        this.plugin.pluginSettings.quranLanguage = "en";
        this.plugin.pluginSettings.quranTranslation = "hilali-khan";
      } else if (v === "quran-api") {
        this.plugin.pluginSettings.quranLanguage = "en";
        this.plugin.pluginSettings.quranTranslation = "eng-muhammadtaqiudd";
      } else if (v === "quran-project") {
        this.plugin.pluginSettings.quranLanguage = "en";
        this.plugin.pluginSettings.quranTranslation = "en";
      }
      await this.plugin.saveSettings();
      this.renderAll();
    }));
    void this.renderQuranTranslationSelectors(containerEl, this.plugin.pluginSettings.quranProvider, token);
    new import_obsidian5.Setting(containerEl).setName("Quran link website").addDropdown((d) => d.addOptions({ ...QURAN_WEBSITES, custom: "Custom" }).setValue(this.plugin.pluginSettings.quranWebsite).onChange(async (v) => {
      this.plugin.pluginSettings.quranWebsite = v;
      await this.plugin.saveSettings();
      this.renderAll();
    }));
    if (this.plugin.pluginSettings.quranWebsite === "custom") {
      new import_obsidian5.Setting(containerEl).setName("Custom Quran link template").setDesc("Use $surah, $ayah, and $ayahlast in the URL template.").addTextArea((t) => {
        t.setValue(this.plugin.pluginSettings.customQuranUrl);
        t.inputEl.rows = 4;
        t.inputEl.addClass("qhf-url-template");
        t.onChange(async (v) => {
          this.plugin.pluginSettings.customQuranUrl = v;
          const bad = validateTemplate(v);
          t.inputEl.toggleClass("qhf-invalid", bad.length > 0);
          if (!bad.length) await this.plugin.saveSettings();
        });
      });
    }
    new import_obsidian5.Setting(containerEl).setName("Hadith content provider").setDesc("Choose the online project used to retrieve Hadith text, translations, and grading where supported. The provider project URL is shown for reference. URL: " + (this.plugin.getHadithProviderSummaries().find((p) => p.id === this.plugin.pluginSettings.hadithProvider)?.url ?? "Unknown")).addDropdown((d) => d.addOptions(HADITH_PROVIDERS).setValue(this.plugin.pluginSettings.hadithProvider).onChange(async (v) => {
      this.plugin.pluginSettings.hadithProvider = v;
      if (v === "hadith-api") {
        this.plugin.pluginSettings.hadithLanguage = "en";
        this.plugin.pluginSettings.hadithTranslation = "eng";
      } else if (v === "hadith-unlocked") {
        this.plugin.pluginSettings.hadithLanguage = "en";
        this.plugin.pluginSettings.hadithTranslation = "en";
      } else if (v === "hadith-json") {
        this.plugin.pluginSettings.hadithLanguage = "en";
        this.plugin.pluginSettings.hadithTranslation = "en";
      }
      await this.plugin.saveSettings();
      this.renderAll();
    }));
    void this.renderHadithTranslationSelector(containerEl, this.plugin.pluginSettings.hadithProvider, token);
    new import_obsidian5.Setting(containerEl).setName("Cache fetched content").setDesc("Reuse previously fetched content before making a network request.").addToggle((t) => t.setValue(this.plugin.pluginSettings.cacheEnabled).onChange(async (v) => {
      this.plugin.pluginSettings.cacheEnabled = v;
      await this.plugin.saveSettings();
    }));
    this.renderFetchLimitSetting(containerEl, "Maximum Quran ayahs per fetch", "Maximum ayahs requested by one Fetch Quran operation.", "quranFetchLimit");
    this.renderFetchLimitSetting(containerEl, "Maximum Hadith per fetch", "Maximum Hadith requested by one Fetch Hadith operation.", "hadithFetchLimit");
    new import_obsidian5.Setting(containerEl).setName("Offline databases").setDesc("Install Quran or Hadith datasets for offline fetching.").addButton((b) => b.setButtonText("Manage").onClick(async () => {
      b.setDisabled(true);
      try {
        const [definitions, installed] = await Promise.all([this.plugin.listOfflineDatabases(), this.plugin.listInstalledOfflineDatabases()]);
        const providers = [
          ...this.plugin.getQuranProviderSummaries(),
          ...this.plugin.getHadithProviderSummaries()
        ];
        new OfflineDatabaseModal(
          this.app,
          definitions,
          installed,
          providers,
          async (definition, signal, progress) => this.plugin.installOfflineDatabase(definition, signal, progress),
          async (databaseId) => this.plugin.removeOfflineDatabase(databaseId)
        ).open();
      } catch (error) {
        new import_obsidian5.Notice(error instanceof Error ? error.message : "Could not load offline databases.");
      } finally {
        b.setDisabled(false);
      }
    }));
    new import_obsidian5.Setting(containerEl).setName("Check provider health").setDesc("Test whether the configured providers are reachable.").addButton((b) => b.setButtonText("Check now").onClick(async () => {
      b.setDisabled(true);
      new import_obsidian5.Notice("Checking provider health\u2026");
      try {
        for (const result of await this.healthChecks()) {
          new import_obsidian5.Notice(result.ok ? `SUCCESS: ${result.providerId} is reachable!` : `ERROR: ${result.message ?? `HTTP Code ${result.status ?? "unknown"}`}`);
        }
      } finally {
        b.setDisabled(false);
      }
    }));
    new import_obsidian5.Setting(containerEl).setName("Command palette commands").setDesc("Choose which plugin commands appear in Obsidian\u2019s command palette.").addButton((b) => b.setButtonText("Configure").onClick(() => {
      const items = COMMAND_DEFINITIONS.map((command) => ({ id: command.id, name: command.name, enabled: this.plugin.pluginSettings.commandVisibility[command.id] !== false }));
      new CommandVisibilityModal(this.app, items, async (enabled) => {
        this.plugin.pluginSettings.commandVisibility = { ...this.plugin.pluginSettings.commandVisibility, ...enabled };
        await this.plugin.saveSettings();
      }).open();
    }));
  }
  renderFetchLimitSetting(containerEl, name, description, key) {
    new import_obsidian5.Setting(containerEl).setName(name).setDesc(description).addText((t) => {
      t.setValue(String(this.plugin.pluginSettings[key]));
      t.inputEl.type = "number";
      t.inputEl.min = "1";
      t.inputEl.max = "1000";
      t.inputEl.step = "1";
      t.onChange(async (value) => {
        const number = Number(value);
        const valid = Number.isInteger(number) && number >= 1 && number <= 1e3;
        t.inputEl.toggleClass("qhf-invalid", !valid);
        if (valid) {
          this.plugin.pluginSettings[key] = number;
          await this.plugin.saveSettings();
        }
      });
    });
  }
  /**
   * Load translation metadata asynchronously, but render it only if this display
   * instance is still current. Without the token check, a slower provider response
   * could overwrite controls after the user has already selected another provider.
   */
  async renderQuranTranslationSelectors(containerEl, providerId, token) {
    const languageSetting = new import_obsidian5.Setting(containerEl).setName("Quran translation language");
    const translationSetting = new import_obsidian5.Setting(containerEl).setName("Quran translation").setDesc("Choose the specific translation inserted alongside Arabic Quran text. Available translations depend on the selected provider and language. Recommended: Hilali-Khan for English.");
    let languageSelect;
    let translationSelect;
    languageSetting.addDropdown((d) => {
      languageSelect = d.selectEl;
      d.addOption("", "Loading\u2026").setValue("");
    });
    translationSetting.addDropdown((d) => {
      translationSelect = d.selectEl;
      d.addOption("", "Loading\u2026").setValue("");
    });
    try {
      const translations = await this.getTranslations("quran", providerId);
      if (token !== this.displayToken) return;
      const groups = [...new Map(translations.map((t) => [t.language.toLowerCase(), t.language])).entries()].sort((a, b) => languageName(a[0]).localeCompare(languageName(b[0])));
      const storedLang = this.plugin.pluginSettings.quranLanguage.toLowerCase();
      const storedTranslation = this.plugin.pluginSettings.quranTranslation;
      const selectedTranslation = translations.find((t) => t.id === storedTranslation);
      const initial = groups.find(([code]) => code === storedLang)?.[0] ?? selectedTranslation?.language.toLowerCase() ?? "en";
      languageSelect.replaceChildren(...groups.map(([code]) => new Option(languageName(code), code)));
      languageSelect.value = groups.some(([code]) => code === initial) ? initial : groups[0]?.[0] ?? "";
      const renderTranslations = (lang, preferred) => {
        let matches = translations.filter((t) => t.language.toLowerCase() === lang.toLowerCase());
        if (lang.toLowerCase() === "ur") matches = [...matches].sort((a, b) => {
          const aJun = /junagar/iu.test(`${a.id} ${a.name} ${a.author ?? ""}`);
          const bJun = /junagar/iu.test(`${b.id} ${b.name} ${b.author ?? ""}`);
          if (aJun !== bJun) return aJun ? -1 : 1;
          return (a.author ?? a.name).localeCompare(b.author ?? b.name);
        });
        translationSelect.replaceChildren(...matches.map((t) => new Option(formatScholarName(t.author ?? t.name), t.id)));
        const chosen = matches.find((t) => t.id === preferred) ?? (lang.toLowerCase() === "ur" ? matches.find((t) => /junagar/iu.test(`${t.id} ${t.name} ${t.author ?? ""}`)) : void 0) ?? (lang.toLowerCase() === "en" ? matches.find((t) => t.id === "hilali-khan" || t.id === "en.hilali") : void 0) ?? matches[0];
        if (!chosen) return;
        translationSelect.value = chosen.id;
        this.plugin.pluginSettings.quranLanguage = chosen.language;
        this.plugin.pluginSettings.quranTranslation = chosen.id;
      };
      renderTranslations(languageSelect.value, storedTranslation);
      languageSelect.onchange = async () => {
        renderTranslations(languageSelect.value, "");
        await this.plugin.saveSettings();
      };
      translationSelect.onchange = async () => {
        const chosen = translations.find((t) => t.id === translationSelect.value);
        if (!chosen) return;
        this.plugin.pluginSettings.quranLanguage = chosen.language;
        this.plugin.pluginSettings.quranTranslation = chosen.id;
        await this.plugin.saveSettings();
      };
    } catch {
      if (token !== this.displayToken) return;
      languageSelect.replaceChildren(new Option("Unavailable", ""));
      translationSelect.replaceChildren(new Option("Unavailable", ""));
    }
  }
  async renderHadithTranslationSelector(containerEl, providerId, token) {
    const setting = new import_obsidian5.Setting(containerEl).setName("Hadith translation");
    let select;
    setting.addDropdown((d) => {
      select = d.selectEl;
      d.addOption("", "Loading\u2026").setValue("");
    });
    try {
      const translations = await this.getTranslations("hadith", providerId);
      if (token !== this.displayToken) return;
      const currentId = this.plugin.pluginSettings.hadithTranslation;
      const currentLang = this.plugin.pluginSettings.hadithLanguage.toLowerCase();
      const english = translations.find((t) => t.language.toLowerCase() === "en");
      const chosen = translations.find((t) => t.id === currentId && t.language.toLowerCase() === currentLang) ?? translations.find((t) => t.id === currentId) ?? english ?? translations[0];
      if (!chosen) return;
      const optionLabel = (t) => {
        const lang = languageName(t.language);
        return t.name === lang ? lang : `${lang} \u2014 ${t.name}`;
      };
      const options = translations.map((t) => ({ value: `${t.language.toLowerCase()}\0${t.id}`, label: optionLabel(t) }));
      select.replaceChildren(...options.map((o) => new Option(o.label, o.value)));
      select.value = `${chosen.language.toLowerCase()}\0${chosen.id}`;
      this.plugin.pluginSettings.hadithLanguage = chosen.language;
      this.plugin.pluginSettings.hadithTranslation = chosen.id;
      select.onchange = async () => {
        const [language, id] = select.value.split("\0");
        const item = translations.find((t) => t.id === id && t.language.toLowerCase() === language);
        if (!item) return;
        this.plugin.pluginSettings.hadithLanguage = item.language;
        this.plugin.pluginSettings.hadithTranslation = item.id;
        await this.plugin.saveSettings();
      };
    } catch {
      if (token !== this.displayToken) return;
      select.replaceChildren(new Option("Unavailable", ""));
    }
  }
  async getTranslations(kind, providerId) {
    const key = `${kind}:${providerId}`;
    const cached = this.translationCache.get(key);
    if (cached) return cached.map((x) => ({ ...x }));
    const translations = await (kind === "quran" ? this.plugin.listQuranTranslations(providerId) : this.plugin.listHadithTranslations(providerId));
    this.translationCache.set(key, translations.map((x) => ({ ...x })));
    return translations.map((x) => ({ ...x }));
  }
  renderFormattingSection(containerEl) {
    new import_obsidian5.Setting(containerEl).setName("Use Arabic-Indic ayah numbers").setDesc("Show Quran ayah numbers with Arabic-Indic digits (\u0661\u060C \u0662\u060C \u0663) instead of Western digits (1, 2, 3) in inserted output.").addToggle((t) => t.setValue(this.plugin.pluginSettings.formatting.arabicAyahNumbers).onChange(async (v) => {
      this.plugin.pluginSettings.formatting.arabicAyahNumbers = v;
      await this.plugin.saveSettings();
    }));
    this.renderBracketSetting(containerEl, "Ayah number brackets", this.currentAyahBracketStyle(), "ayahNumberStyle", "Choose the opening and closing characters placed around visible ayah numbers in inserted output.", {
      angle: ["\u27EA", "\u27EB"],
      square: ["[", "]"],
      round: ["(", ")"],
      curly: ["{", "}"],
      heavyAngle: ["\u2770", "\u2771"],
      ceiling: ["\u2308", "\u2309"],
      floor: ["\u230A", "\u230B"],
      heavyAngleAlt: ["\u276E", "\u276F"],
      lenticular: ["\u3016", "\u3017"]
    }, "ayahNumberOpen", "ayahNumberClose", "ayahNumberStyle");
    this.renderBracketSetting(containerEl, "Quran Ayah brackets", this.currentQuranAyahStyle(), "quranAyahStyle", "Choose the opening and closing characters placed around Quran ayah references when reference formatting is enabled.", {
      curly: ["{", "}"],
      square: ["[", "]"],
      round: ["(", ")"],
      angle: ["\u27EA", "\u27EB"],
      heavyAngle: ["\u2770", "\u2771"],
      ceiling: ["\u2308", "\u2309"],
      floor: ["\u230A", "\u230B"],
      heavyAngleAlt: ["\u276E", "\u276F"],
      lenticular: ["\u3016", "\u3017"]
    }, "quranAyahOpen", "quranAyahClose", "quranAyahStyle");
    new import_obsidian5.Setting(containerEl).setName("Handle code-like apostrophes").setDesc("Choose how backticks in inserted Quran and Hadith text are handled, so transliteration marks do not look like Markdown code syntax.").addDropdown((d) => d.addOptions({
      replace: "Replace ` with \u02BF",
      remove: "Remove `",
      none: "Do not modify"
    }).setValue(this.plugin.pluginSettings.formatting.codeSyntaxMode).onChange(async (v) => {
      this.plugin.pluginSettings.formatting.codeSyntaxMode = v;
      await this.plugin.saveSettings();
    }));
    new import_obsidian5.Setting(containerEl).setName("Callout style").setDesc("Choose the Obsidian callout used to wrap fetched Quran or Hadith content. Select None for plain Markdown without a callout.").addDropdown((d) => d.addOptions({
      none: "None",
      quote: "Quote",
      note: "Note",
      abstract: "Abstract",
      info: "Info",
      todo: "Todo",
      tip: "Tip",
      success: "Success",
      question: "Question",
      warning: "Warning",
      failure: "Failure",
      danger: "Danger",
      bug: "Bug",
      example: "Example",
      cite: "Cite",
      custom: "Custom"
    }).setValue(this.plugin.pluginSettings.formatting.callout).onChange(async (v) => {
      this.plugin.pluginSettings.formatting.callout = v;
      await this.plugin.saveSettings();
      this.renderAll();
    }));
    if (this.plugin.pluginSettings.formatting.callout === "custom") {
      new import_obsidian5.Setting(containerEl).setName("Custom callout type").setDesc("Enter the Obsidian callout type used when Callout style is Custom. Enter the type only, without the [!] marker; for example, my-callout.").addText((t) => t.setValue(this.plugin.pluginSettings.formatting.customCalloutType).onChange(async (v) => {
        this.plugin.pluginSettings.formatting.customCalloutType = v.trim();
        await this.plugin.saveSettings();
      }));
    }
  }
  renderBracketSetting(containerEl, name, current, _styleKey, description, presets, openKey, closeKey, styleKey) {
    new import_obsidian5.Setting(containerEl).setName(name).setDesc(description).addDropdown((d) => d.addOptions({ ...Object.fromEntries(Object.entries(presets).map(([k, [open, close]]) => [k, `${open}${close}`])), custom: "Custom" }).setValue(current).onChange(async (v) => {
      this.plugin.pluginSettings.formatting[styleKey] = v;
      if (v !== "custom") {
        const [open, close] = presets[v];
        this.plugin.pluginSettings.formatting[openKey] = open;
        this.plugin.pluginSettings.formatting[closeKey] = close;
      }
      await this.plugin.saveSettings();
      this.renderAll();
    }));
    if (current === "custom") {
      new import_obsidian5.Setting(containerEl).setName(`${name} opening`).setDesc("Character placed before the formatted value.").addText((t) => t.setValue(this.plugin.pluginSettings.formatting[openKey]).onChange(async (v) => {
        this.plugin.pluginSettings.formatting[openKey] = v;
        await this.plugin.saveSettings();
      }));
      new import_obsidian5.Setting(containerEl).setName(`${name} closing`).setDesc("Character placed after the formatted value.").addText((t) => t.setValue(this.plugin.pluginSettings.formatting[closeKey]).onChange(async (v) => {
        this.plugin.pluginSettings.formatting[closeKey] = v;
        await this.plugin.saveSettings();
      }));
    }
  }
  getSettingsScrollHost() {
    const verticalTabContent = this.containerEl.closest(".vertical-tab-content");
    if (verticalTabContent) return verticalTabContent;
    const candidates = this.getSettingsScrollElements();
    const scrollable = candidates.find((el) => el.scrollHeight > el.clientHeight || el.scrollWidth > el.clientWidth);
    return scrollable ?? this.containerEl;
  }
  getSettingsScrollElements() {
    const elements = [];
    const seen = /* @__PURE__ */ new Set();
    let el = this.containerEl;
    while (el) {
      if (!seen.has(el)) {
        seen.add(el);
        elements.push(el);
      }
      el = el.parentElement;
    }
    if (document.scrollingElement instanceof HTMLElement && !seen.has(document.scrollingElement)) {
      elements.push(document.scrollingElement);
    }
    return elements;
  }
  captureSettingsScroll() {
    const host = this.getSettingsScrollHost();
    const candidates = this.getSettingsScrollElements();
    const elements = [host, ...candidates.filter((el) => el !== host)];
    return elements.filter((el) => el.scrollTop > 0 || el.scrollLeft > 0 || el === host).map((element) => ({ element, top: element.scrollTop, left: element.scrollLeft }));
  }
  restoreSettingsScroll(positions) {
    for (const position of positions) {
      position.element.scrollTop = position.top;
      position.element.scrollLeft = position.left;
    }
  }
  /**
   * Preserve every relevant settings scroll container during a setting save. Obsidian uses
   * `.vertical-tab-content` on desktop, while some layouts (including mobile) can scroll a
   * higher-level container. Capture the full ancestor chain instead of assuming one host.
   */
  preserveSettingsScroll(action) {
    const positions = this.captureSettingsScroll();
    const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const restore = () => {
      this.restoreSettingsScroll(positions);
      if (active?.isConnected) {
        try {
          active.focus({ preventScroll: true });
        } catch {
          active.focus();
        }
      }
    };
    this.pendingScrollPosition = positions[0] ? { top: positions[0].top, left: positions[0].left } : void 0;
    restore();
    return Promise.resolve(action()).finally(() => {
      restore();
      window.requestAnimationFrame(() => {
        restore();
        window.requestAnimationFrame(() => {
          restore();
          window.setTimeout(restore, 50);
          window.setTimeout(restore, 200);
          window.setTimeout(restore, 500);
        });
      });
    });
  }
  /**
   * Rebuild only the conversion-rule portion of the settings while preserving the
   * current settings scroll position. Callers use this after adding, editing, or
   * deleting a custom conversion rule.
   */
  // Rule-list changes require a redraw because rows are created/removed. The master
  // Text Conversions toggle is different: it updates existing DOM state in place and
  // must not call this redraw path, otherwise Obsidian can reset the settings scroll.
  refreshAfterRuleChange() {
    const positions = this.captureSettingsScroll();
    const first = positions[0];
    this.pendingScrollPosition = first ? { top: first.top, left: first.left } : void 0;
    this.renderAll();
  }
  renderTextConversionSection(containerEl) {
    const conversionsEnabled = this.plugin.pluginSettings.textConversionsEnabled === true;
    let controls;
    new import_obsidian5.Setting(containerEl).setName("Toggle Text Conversions").setDesc("Enable or disable every automatic text conversion applied after fetching. Rule settings remain editable while this master switch is off, but their conversions are not applied.").addToggle((t) => t.setValue(conversionsEnabled).onChange(async (v) => {
      const enabled = v === true;
      await this.preserveSettingsScroll(async () => {
        this.plugin.pluginSettings.textConversionsEnabled = enabled;
        controls.toggleClass("qhf-text-conversions-disabled", !enabled);
        controls.setAttribute("aria-disabled", String(!enabled));
        await this.plugin.saveSettings();
      });
    }));
    controls = containerEl.createDiv({ cls: `qhf-text-conversion-controls${conversionsEnabled ? "" : " qhf-text-conversions-disabled"}`, attr: { "aria-disabled": String(!conversionsEnabled) } });
    const blessingSetting = new import_obsidian5.Setting(controls).setName("Normalize salutations to \uFDFA").setDesc("Convert common salutation variants to \uFDFA. Examples: SAW, S.A.W., S.A.W.S., and P.B.U.H. \u2192 \uFDFA; (O Muhammad SAW) \u2192 (O Muhammad \uFDFA); may peace and blessings be upon him \u2192 \uFDFA; Prophet, may Allah bless him and grant him peace \u2192 Prophet \uFDFA; \u0635\u0644\u0649 \u0627\u0644\u0644\u0647 \u0639\u0644\u064A\u0647 \u0648\u0633\u0644\u0645 \u2192 \uFDFA. Only the salutation words are replaced, so source parentheses and other enclosures are preserved and no new parentheses are added.").addToggle((t) => t.setValue(this.plugin.pluginSettings.blessingNormalization).onChange(async (v) => {
      this.plugin.pluginSettings.blessingNormalization = v;
      await this.plugin.saveSettings();
    }));
    blessingSetting.settingEl.addClass("qhf-setting-ltr");
    new import_obsidian5.Setting(controls).setName("Convert Variants of RA used for the Sahaba to \u0631\u064E\u0636\u0650\u064A\u064E \u0627\u0644\u0644\u0647\u064F \u0639\u064E\u0646\u0652\u0647\u064F").setDesc("Convert English and abbreviated variants of the Sahaba honorific to Arabic. Examples: RA, R.A., R.A. \u2192 \u0631\u064E\u0636\u0650\u064A\u064E \u0671\u0644\u0644\u064E\u0651\u0670\u0647\u064F \u0639\u064E\u0646\u0652\u0647\u064F; (May Allah be pleased with Him) \u2192 (\u0631\u0636\u064A \u0627\u0644\u0644\u0651\u0647 \u0639\u0646\u0647); (May Allah be pleased with Her) \u2192 (\u0631\u0636\u064A \u0627\u0644\u0644\u0651\u0647 \u0639\u0646\u0647\u0627); (May Allah be pleased with them) \u2192 (\u0631\u0636\u064A \u0627\u0644\u0644\u0651\u0647 \u0639\u0646\u0647\u0645); may Allah be pleased with them \u2192 \u0631\u0636\u064A \u0627\u0644\u0644\u0651\u0647 \u0639\u0646\u0647\u0645; and comma forms such as \u201CJabir, may Allah be pleased with them,\u201D \u2192 \u201CJabir \u0631\u0636\u064A \u0627\u0644\u0644\u0651\u0647 \u0639\u0646\u0647\u0645\u201D. Only the RA words are replaced, so source parentheses and other enclosures are preserved and no new parentheses are added.").addToggle((t) => t.setValue(this.plugin.pluginSettings.raNormalization).onChange(async (v) => {
      this.plugin.pluginSettings.raNormalization = v;
      await this.plugin.saveSettings();
    }));
    new import_obsidian5.Setting(controls).setName("Use standard English transliteration").setDesc("Replace selected transliteration marks with simpler English spellings. Example: Ay\xE2t \u2192 Ayat.").addToggle((t) => t.setValue(this.plugin.pluginSettings.romanEnglish).onChange(async (v) => {
      this.plugin.pluginSettings.romanEnglish = v;
      await this.plugin.saveSettings();
    }));
    const list = controls.createDiv({ cls: "qhf-replacement-list" });
    for (const rule of this.plugin.pluginSettings.replacementRules) this.renderReplacementRule(list, rule, conversionsEnabled);
    new import_obsidian5.Setting(controls).addButton((b) => b.setButtonText("Add conversion").setCta().onClick(() => {
      const rule = {
        id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        language: "en",
        title: "Custom conversion",
        description: "",
        from: "",
        to: "",
        enabled: true,
        caseSensitive: false
      };
      void new ReplacementRuleModal(
        this.app,
        rule,
        async (draft) => {
          this.plugin.pluginSettings.replacementRules.push({ ...draft });
          await this.plugin.saveSettings();
          this.refreshAfterRuleChange();
        },
        async () => {
        },
        () => {
        },
        // Read the master toggle at modal-open time so the warning never lags behind settings.
        () => this.plugin.pluginSettings.textConversionsEnabled === true,
        true
      ).open();
    }));
  }
  renderReplacementRule(containerEl, rule, conversionsEnabled = true) {
    const card = containerEl.createDiv({ cls: "qhf-replacement-rule" });
    card.toggleClass("qhf-replacement-disabled", !rule.enabled);
    card.createDiv({ text: rule.title || "Text conversion", cls: "qhf-replacement-title" });
    if (rule.description.trim()) card.createDiv({ text: rule.description, cls: "qhf-replacement-description" });
    const row = card.createDiv({ cls: "qhf-replacement-summary" });
    row.createSpan({ text: rule.from || "\u2014", cls: "qhf-replacement-term" });
    row.createSpan({ text: "\u2192", cls: "qhf-replacement-arrow" });
    row.createSpan({ text: rule.to || "\u2014", cls: "qhf-replacement-term" });
    const edit = row.createEl("button", { text: "Edit", cls: "qhf-replacement-edit", attr: {
      type: "button",
      "aria-label": "Edit conversion",
      title: "Edit conversion"
    } });
    edit.addEventListener("click", () => {
      void new ReplacementRuleModal(
        this.app,
        rule,
        async () => {
          await this.plugin.saveSettings();
          this.refreshAfterRuleChange();
        },
        async () => {
          this.plugin.pluginSettings.replacementRules = this.plugin.pluginSettings.replacementRules.filter((x) => x.id !== rule.id);
          await this.plugin.saveSettings();
          this.refreshAfterRuleChange();
        },
        () => this.refreshAfterRuleChange(),
        // Read the master toggle at modal-open time so the warning never lags behind settings.
        () => this.plugin.pluginSettings.textConversionsEnabled === true
      ).open();
    });
    const toggle = row.createEl("button", { cls: "qhf-conversion-toggle", attr: {
      type: "button",
      role: "switch",
      "aria-checked": String(rule.enabled),
      "aria-label": rule.enabled ? "Disable conversion" : "Enable conversion",
      title: rule.enabled ? "Disable conversion" : "Enable conversion"
    } });
    const syncToggle = () => {
      toggle.setAttribute("aria-checked", String(rule.enabled));
      toggle.setAttribute("aria-label", rule.enabled ? "Disable conversion" : "Enable conversion");
      toggle.setAttribute("title", rule.enabled ? "Disable conversion" : "Enable conversion");
      toggle.toggleClass("qhf-conversion-toggle-active", rule.enabled);
      toggle.empty();
      const track = toggle.createSpan({ cls: "qhf-conversion-toggle-track" });
      track.createSpan({ cls: "qhf-conversion-toggle-thumb" });
      card.toggleClass("qhf-replacement-disabled", !rule.enabled);
    };
    toggle.addEventListener("click", () => {
      rule.enabled = !rule.enabled;
      syncToggle();
      void this.plugin.saveSettings();
    });
    syncToggle();
  }
  currentQuranAyahStyle() {
    const stored = this.plugin.pluginSettings.formatting.quranAyahStyle;
    if (stored) return stored;
    const { quranAyahOpen: open, quranAyahClose: close } = this.plugin.pluginSettings.formatting;
    if (open === "{" && close === "}") return "curly";
    if (open === "[" && close === "]") return "square";
    if (open === "(" && close === ")") return "round";
    if (open === "\u27EA" && close === "\u27EB") return "angle";
    if (open === "\u2770" && close === "\u2771") return "heavyAngle";
    if (open === "\u2308" && close === "\u2309") return "ceiling";
    if (open === "\u230A" && close === "\u230B") return "floor";
    if (open === "\u276E" && close === "\u276F") return "heavyAngleAlt";
    if (open === "\u3016" && close === "\u3017") return "lenticular";
    return "custom";
  }
  currentAyahBracketStyle() {
    const stored = this.plugin.pluginSettings.formatting.ayahNumberStyle;
    if (stored) return stored;
    const { ayahNumberOpen: open, ayahNumberClose: close } = this.plugin.pluginSettings.formatting;
    if (open === "\u27EA" && close === "\u27EB") return "angle";
    if (open === "[" && close === "]") return "square";
    if (open === "(" && close === ")") return "round";
    if (open === "{" && close === "}") return "curly";
    return "custom";
  }
};

// src/main.ts
function applyDefaultHadithGrading(result) {
  if (result.grades.length === 0 && (result.reference.collectionId.toLocaleLowerCase("en-US") === "bukhari" || result.reference.collectionId.toLocaleLowerCase("en-US") === "muslim")) {
    return { ...result, grades: [{ id: "default-sahih", text: "Sahih" }] };
  }
  return result;
}
function createNormalizers(pluginSettings) {
  const options = {
    textConversionsEnabled: pluginSettings.textConversionsEnabled,
    blessingNormalization: pluginSettings.blessingNormalization,
    raNormalization: pluginSettings.raNormalization,
    romanEnglish: pluginSettings.romanEnglish,
    codeSyntaxMode: pluginSettings.formatting.codeSyntaxMode,
    replacementRules: pluginSettings.replacementRules
  };
  const normalizeEnglish = (text2) => transformFetchedEnglishText(text2, options);
  const normalizeArabic = (text2) => transformFetchedArabicText(text2, options);
  return { normalizeEnglish, normalizeArabic };
}
var QuranHadithFetcherPlugin = class extends import_obsidian6.Plugin {
  constructor() {
    super(...arguments);
    __publicField(this, "registry", new ProviderRegistry());
    __publicField(this, "operations", new OperationManager());
    __publicField(this, "http", new ObsidianHttpClient());
    __publicField(this, "offlineStore");
    __publicField(this, "hadithJsonBookCache");
    /** Serialize settings writes so rapid UI changes cannot race saveData(). */
    __publicField(this, "settingsSaveQueue", Promise.resolve());
  }
  async onload() {
    this.pluginSettings = migrateSettings(await this.loadData());
    this.offlineStore = new ObsidianOfflineDatabaseStore(this.app, this.manifest.id);
    this.hadithJsonBookCache = new ObsidianPersistentJsonStore(this.app, this.manifest.id, "cache/hadith-json");
    this.registry.registerQuran(new QuranUnlockedProvider(this.http, () => this.pluginSettings.cacheEnabled));
    this.registry.registerQuran(new AlQuranCloudProvider(this.http, () => this.pluginSettings.cacheEnabled));
    this.registry.registerQuran(new QuranApiProvider(this.http, () => this.pluginSettings.cacheEnabled, this.offlineStore));
    this.registry.registerQuran(new QuranProjectProvider(this.http, () => this.pluginSettings.cacheEnabled, this.offlineStore));
    this.registry.registerHadith(new HadithUnlockedProvider(this.http, () => this.pluginSettings.cacheEnabled, this.offlineStore));
    this.registry.registerHadith(new HadithApiProvider(this.http, () => this.pluginSettings.cacheEnabled, this.offlineStore));
    this.registry.registerHadith(new HadithJsonProvider(this.http, () => this.pluginSettings.cacheEnabled, this.offlineStore, this.hadithJsonBookCache));
    this.registerCommands();
    this.addSettingTab(new FetcherSettingTab(this.app, this, () => this.runHealthChecks()));
  }
  async saveSettings() {
    this.pluginSettings = mangleFormatting(this.pluginSettings);
    const snapshot = structuredClone(this.pluginSettings);
    const write = this.settingsSaveQueue.then(() => this.saveData(snapshot));
    this.settingsSaveQueue = write.then(() => void 0, () => void 0);
    await write;
  }
  async listQuranTranslations(providerId, signal) {
    return this.registry.getQuran(providerId).listTranslations({ signal: signal ?? new AbortController().signal });
  }
  async listHadithTranslations(providerId, signal) {
    return this.registry.getHadith(providerId).listTranslations({ signal: signal ?? new AbortController().signal });
  }
  getQuranProviderSummaries() {
    return this.registry.listQuran().map((p) => ({ id: p.metadata.id, name: p.metadata.name, url: p.metadata.projectUrl, kind: "quran" }));
  }
  getHadithProviderSummaries() {
    return this.registry.listHadith().map((p) => ({ id: p.metadata.id, name: p.metadata.name, url: p.metadata.projectUrl, kind: "hadith" }));
  }
  openCommandPaletteSettings() {
    const items = COMMAND_DEFINITIONS.map((command) => ({ id: command.id, name: command.name, enabled: this.pluginSettings.commandVisibility[command.id] !== false }));
    new CommandVisibilityModal(this.app, items, async (enabled) => {
      this.pluginSettings.commandVisibility = { ...this.pluginSettings.commandVisibility, ...enabled };
      await this.saveSettings();
    }).open();
  }
  async listOfflineDatabases(signal) {
    const ctx = { signal: signal ?? new AbortController().signal };
    const providers = [...this.registry.listQuran(), ...this.registry.listHadith()];
    const results = await Promise.all(providers.map((provider) => provider.listOfflineDatabases(ctx)));
    return results.flat().sort((a, b) => `${a.providerId}:${a.label}`.localeCompare(`${b.providerId}:${b.label}`));
  }
  async listInstalledOfflineDatabases() {
    return this.offlineStore.listInstalled();
  }
  async installOfflineDatabase(definition, signal, onProgress) {
    return this.offlineStore.install(definition, this.http, signal, onProgress);
  }
  async removeOfflineDatabase(databaseId) {
    await this.offlineStore.remove(databaseId);
  }
  async saveLastOptions(kind, options) {
    if (kind === "quran") this.pluginSettings.lastQuranOptions = structuredClone(options);
    else this.pluginSettings.lastHadithOptions = structuredClone(options);
    await this.saveSettings();
  }
  async runHealthChecks() {
    const providers = [...this.registry.listQuran(), ...this.registry.listHadith()];
    const ctx = { signal: new AbortController().signal };
    return Promise.all(providers.map((provider) => provider.healthCheck(ctx)));
  }
  getActiveEditor() {
    return this.app.workspace.getActiveViewOfType(import_obsidian6.MarkdownView)?.editor ?? null;
  }
  isCommandVisible(id) {
    return this.pluginSettings.commandVisibility[id] !== false;
  }
  // Command registration is data-driven from COMMAND_DEFINITIONS. Visibility is
  // checked in `checkCallback`, which means disabled commands disappear from normal
  // command-palette use without changing their underlying command implementation.
  registerCommands() {
    for (const command of COMMAND_DEFINITIONS) {
      this.addCommand({
        id: command.id,
        name: command.name,
        checkCallback: (checking) => {
          if (!this.isCommandVisible(command.id)) return false;
          const editorCommands = /* @__PURE__ */ new Set(["fetch-quran", "fetch-hadith", "normalize-salutations", "convert-ra"]);
          if (editorCommands.has(command.id) && !this.getActiveEditor()) return false;
          if (checking) return true;
          void this.executeCommand(command.id);
          return true;
        }
      });
    }
  }
  // Central command dispatcher. Keep behavior here thin: choosing a provider or modal
  // belongs in dedicated methods, while actual fetching/formatting remains in their
  // existing orchestration helpers. This makes command IDs safe to rename through
  // settings migration without duplicating application logic.
  async executeCommand(id) {
    switch (id) {
      case "fetch-quran": {
        const editor = this.getActiveEditor();
        if (editor) await this.insertQuran(editor);
        return;
      }
      case "fetch-hadith": {
        const editor = this.getActiveEditor();
        if (editor) await this.insertHadith(editor);
        return;
      }
      case "set-quran-provider":
        return this.pickQuranProvider();
      case "set-quran-language":
        return this.pickQuranLanguage();
      case "set-quran-translation":
        return this.pickQuranTranslation();
      case "set-quran-website":
        return this.pickQuranWebsite();
      case "set-hadith-provider":
        return this.pickHadithProvider();
      case "set-hadith-translation":
        return this.pickHadithTranslation();
      case "manage-offline-databases":
        return this.openOfflineDatabaseManager();
      case "check-provider-health": {
        await this.showProviderHealth();
        return;
      }
      case "normalize-salutations":
        return this.normalizeSelectedText("salutation");
      case "convert-ra":
        return this.normalizeSelectedText("ra");
      case "toggle-text-conversions": {
        this.pluginSettings.textConversionsEnabled = !this.pluginSettings.textConversionsEnabled;
        await this.saveSettings();
        new import_obsidian6.Notice(this.pluginSettings.textConversionsEnabled ? "Text conversions enabled." : "Text conversions disabled.");
        return;
      }
    }
  }
  async pickQuranProvider() {
    const providers = this.getQuranProviderSummaries();
    new ChoiceModal(this.app, providers, (p) => `${p.id === this.pluginSettings.quranProvider ? "\u{1F6A9} " : ""}${p.name} \u2014 URL: ${p.url}`, async (p) => {
      this.pluginSettings.quranProvider = p.id;
      if (p.id === "alquran-cloud") {
        this.pluginSettings.quranLanguage = "en";
        this.pluginSettings.quranTranslation = "en.hilali";
      } else if (p.id === "quran-unlocked") {
        this.pluginSettings.quranLanguage = "en";
        this.pluginSettings.quranTranslation = "hilali-khan";
      } else if (p.id === "quran-api") {
        this.pluginSettings.quranLanguage = "en";
        this.pluginSettings.quranTranslation = "eng-muhammadtaqiudd";
      } else if (p.id === "quran-project") {
        this.pluginSettings.quranLanguage = "en";
        this.pluginSettings.quranTranslation = "en";
      }
      await this.saveSettings();
    }, "Select Quran content provider").open();
  }
  async pickQuranLanguage() {
    try {
      const translations = await this.listQuranTranslations(this.pluginSettings.quranProvider);
      const groups = [...new Map(translations.map((t) => [t.language.toLowerCase(), t.language])).entries()].sort((a, b) => languageName(a[0]).localeCompare(languageName(b[0])));
      const items = groups.map(([id, name]) => ({ id, name }));
      new ChoiceModal(this.app, items, (item) => languageName(item.id), async (item) => {
        this.pluginSettings.quranLanguage = item.id;
        const match = translations.find((t) => t.language.toLowerCase() === item.id.toLowerCase());
        if (match) this.pluginSettings.quranTranslation = match.id;
        await this.saveSettings();
      }, "Select Quran translation language").open();
    } catch (error) {
      new import_obsidian6.Notice(errorToNotice(error));
    }
  }
  async pickQuranTranslation() {
    try {
      const translations = await this.listQuranTranslations(this.pluginSettings.quranProvider);
      const language = this.pluginSettings.quranLanguage.toLowerCase();
      const matches = translations.filter((t) => t.language.toLowerCase() === language);
      const items = (matches.length ? matches : translations).map((t) => ({ translation: t, label: `${languageName(t.language)} \u2014 ${t.author ?? t.name}` }));
      new ChoiceModal(this.app, items, (item) => item.label, async (item) => {
        this.pluginSettings.quranLanguage = item.translation.language;
        this.pluginSettings.quranTranslation = item.translation.id;
        await this.saveSettings();
      }, "Select Quran translation").open();
    } catch (error) {
      new import_obsidian6.Notice(errorToNotice(error));
    }
  }
  async pickQuranWebsite() {
    const items = Object.entries(QURAN_WEBSITES).map(([id, label]) => ({ id, label }));
    items.push({ id: "custom", label: "Custom" });
    new ChoiceModal(this.app, items, (item) => item.id === "custom" ? "Custom" : item.label, async (item) => {
      if (item.id !== "custom") {
        this.pluginSettings.quranWebsite = item.id;
        await this.saveSettings();
        return;
      }
      new InputModal(this.app, "Custom Quran URL", "e.g. https://example.com/$surah/$ayah", this.pluginSettings.customQuranUrl, async (value) => {
        this.pluginSettings.quranWebsite = "custom";
        this.pluginSettings.customQuranUrl = value;
        await this.saveSettings();
      }, () => {
      }, (value) => {
        const invalid = validateTemplate(value);
        return value.includes("$surah") ? invalid.length ? `Unknown URL placeholder(s): ${invalid.join(", ")}` : null : "URL template must contain $surah.";
      }, "text").open();
    }, "Select Quran website").open();
  }
  async pickHadithProvider() {
    const providers = this.getHadithProviderSummaries();
    new ChoiceModal(this.app, providers, (p) => `${p.id === this.pluginSettings.hadithProvider ? "\u{1F6A9} " : ""}${p.name} \u2014 URL: ${p.url}`, async (p) => {
      this.pluginSettings.hadithProvider = p.id;
      this.pluginSettings.hadithLanguage = "en";
      this.pluginSettings.hadithTranslation = p.id === "hadith-api" ? "eng" : "en";
      await this.saveSettings();
    }, "Select Hadith content provider").open();
  }
  async pickHadithTranslation() {
    try {
      const translations = await this.listHadithTranslations(this.pluginSettings.hadithProvider);
      const items = translations.map((t) => ({ translation: t, label: `${languageName(t.language)} \u2014 ${t.name}` }));
      new ChoiceModal(this.app, items, (item) => item.label, async (item) => {
        this.pluginSettings.hadithLanguage = item.translation.language;
        this.pluginSettings.hadithTranslation = item.translation.id;
        await this.saveSettings();
      }, "Select Hadith translation").open();
    } catch (error) {
      new import_obsidian6.Notice(errorToNotice(error));
    }
  }
  async openOfflineDatabaseManager() {
    try {
      const [definitions, installed] = await Promise.all([this.listOfflineDatabases(), this.listInstalledOfflineDatabases()]);
      const providers = [...this.getQuranProviderSummaries(), ...this.getHadithProviderSummaries()];
      new OfflineDatabaseModal(
        this.app,
        definitions,
        installed,
        providers,
        async (definition, signal, progress) => this.installOfflineDatabase(definition, signal, progress),
        async (databaseId) => this.removeOfflineDatabase(databaseId)
      ).open();
    } catch (error) {
      new import_obsidian6.Notice(errorToNotice(error));
    }
  }
  async showProviderHealth() {
    new import_obsidian6.Notice("Checking provider health\u2026");
    try {
      for (const result of await this.runHealthChecks()) new import_obsidian6.Notice(result.ok ? `SUCCESS: ${result.providerId} is reachable!` : `ERROR: ${result.message ?? `HTTP Code ${result.status ?? "unknown"}`}`);
    } catch (error) {
      new import_obsidian6.Notice(errorToNotice(error));
    }
  }
  normalizeSelectedText(mode) {
    const editor = this.getActiveEditor();
    if (!editor) {
      new import_obsidian6.Notice("No active editor.");
      return Promise.resolve();
    }
    const selected = editor.getSelection();
    if (selected) {
      const normalized2 = mode === "salutation" ? normalizeBlessing(selected) : normalizeStandaloneRa(selected);
      editor.replaceSelection(normalized2);
      return Promise.resolve();
    }
    const cursor = editor.getCursor();
    const line = editor.getLine(cursor.line);
    const normalized = mode === "salutation" ? normalizeBlessing(line) : normalizeStandaloneRa(line);
    editor.replaceRange(normalized, { line: cursor.line, ch: 0 }, { line: cursor.line, ch: line.length });
    return Promise.resolve();
  }
  /**
   * Orchestrate the complete Quran insertion flow: collect UI input, validate it,
   * fetch provider-neutral data, format it, and finally insert at the current editor
   * cursor. Keeping the stages explicit makes provider failures distinguishable from
   * formatting/cancellation failures and prevents UI code from parsing API payloads.
   */
  async insertQuran(editor) {
    const operation = this.operations.begin();
    const selectedRef = parseQuranReference(editor.getSelection());
    if (selectedRef && validateQuranReference(selectedRef, this.pluginSettings.quranFetchLimit) === null) {
      await this.chooseQuranOptions(editor, selectedRef, operation.id, operation.signal);
      return;
    }
    new QuranSurahModal(this.app, async (surah) => this.chooseQuranAyahs(editor, surah, operation.id, operation.signal)).open();
  }
  chooseQuranAyahs(editor, surah, id, signal) {
    new InputModal(
      this.app,
      `Ayah \u2014 ${String(surah).padStart(3, "0")} ${SURAH_NAMES[surah - 1]}`,
      "e.g. 13 or 13-15",
      "",
      async (value) => {
        const normalized = value.replace(/\s*[-–—]\s*/u, "-");
        const ref = parseQuranReference(`${surah}:${normalized}`);
        if (!ref) return;
        const error = validateQuranReference(ref, this.pluginSettings.quranFetchLimit);
        if (error) return;
        await this.chooseQuranOptions(editor, ref, id, signal);
      },
      () => this.operations.cancel(),
      (value) => {
        const normalized = value.replace(/\s*[-–—]\s*/u, "-");
        if (!/^\d{1,3}(?:-\d{1,3})?$/.test(normalized)) return "Enter an ayah number or range, e.g. 1 or 1 - 10.";
        const ref = parseQuranReference(`${surah}:${normalized}`);
        return ref ? validateQuranReference(ref, this.pluginSettings.quranFetchLimit) : "Invalid Ayah/range.";
      },
      "text"
    ).open();
  }
  async chooseQuranOptions(editor, ref, id, signal, initialOptions = this.pluginSettings.lastQuranOptions) {
    new OptionsModal(
      this.app,
      initialOptions,
      { arabic: true, english: true, grading: false, quran: true },
      async (options) => {
        await this.saveLastOptions("quran", options);
        await this.fetchAndInsertQuran(editor, ref, id, signal, options);
      },
      () => this.operations.cancel()
    ).open();
  }
  async fetchAndInsertQuran(editor, ref, id, signal, opts = this.pluginSettings.lastQuranOptions) {
    try {
      const provider = this.registry.getQuran(this.pluginSettings.quranProvider);
      const rangeError = validateQuranReference(ref, this.pluginSettings.quranFetchLimit);
      if (rangeError) throw new AppError(rangeError, "validation");
      const translations = await provider.listTranslations({ signal });
      const translation = translations.find((t) => t.id === this.pluginSettings.quranTranslation && t.language.toLowerCase() === this.pluginSettings.quranLanguage.toLowerCase()) ?? translations.find((t) => t.id === this.pluginSettings.quranTranslation) ?? translations.find((t) => t.id === "hilali-khan") ?? translations.find((t) => t.id === "en.hilali") ?? translations.find((t) => t.language.toLowerCase() === "en") ?? translations[0];
      if (!translation && opts.english) throw new AppError("No English translation is configured for this provider.", "validation");
      if (!translation) throw new AppError("No Quran translation is available for this provider.", "validation");
      const result = await provider.fetchQuran(ref, translation, { signal });
      if (!this.operations.isCurrent(id)) return;
      const transformed = structuredClone(result);
      const { normalizeEnglish } = createNormalizers(this.pluginSettings);
      if (this.pluginSettings.romanEnglish) transformed.surahName = normalizeEnglish(transformed.surahName);
      for (const ayah of transformed.ayahs) {
        if (ayah.translation) ayah.translation.text = normalizeEnglish(ayah.translation.text);
        if (ayah.footnotes) for (const footnote of ayah.footnotes) footnote.text = normalizeEnglish(footnote.text);
      }
      transformed.source.sourceUrl = makeQuranUrl(this.pluginSettings.quranWebsite, this.pluginSettings.customQuranUrl, ref.surah, ref.startAyah, ref.endAyah, translation.id);
      transformed.source.providerId = provider.metadata.id;
      const markdown = formatQuran(transformed, { ...this.pluginSettings.formatting, showLink: opts.link }, opts);
      new PreviewModal(
        this.app,
        markdown,
        (edited) => {
          if (this.operations.isCurrent(id)) editor.replaceRange(edited, editor.getCursor());
        },
        () => {
          if (this.operations.isCurrent(id)) void this.chooseQuranOptions(editor, ref, id, signal, opts);
        }
      ).open();
    } catch (error) {
      if (!this.operations.isCurrent(id)) return;
      new import_obsidian6.Notice(errorToNotice(error));
    }
  }
  /**
   * Orchestrate Hadith insertion using the same high-level pipeline as Quran. The
   * provider is selected before fetching, while normalization/formatting remains
   * centralized so different Hadith sources produce a consistent Markdown shape.
   */
  async insertHadith(editor) {
    const operation = this.operations.begin();
    const selectedRef = parseHadithReference(editor.getSelection());
    if (selectedRef) {
      const provider2 = this.registry.getHadith(this.pluginSettings.hadithProvider);
      try {
        const collections2 = await provider2.listCollections({ signal: operation.signal });
        const error = validateHadithReference(selectedRef, collections2, this.pluginSettings.hadithFetchLimit);
        if (error) {
          new import_obsidian6.Notice(`ERROR: ${error}`);
          return;
        }
      } catch (error) {
        new import_obsidian6.Notice(errorToNotice(error));
        return;
      }
      await this.chooseHadithOptions(editor, selectedRef, operation.id, operation.signal);
      return;
    }
    const provider = this.registry.getHadith(this.pluginSettings.hadithProvider);
    let collections;
    try {
      collections = await provider.listCollections({ signal: operation.signal });
    } catch (error) {
      new import_obsidian6.Notice(errorToNotice(error));
      return;
    }
    let offlineCollectionIds = /* @__PURE__ */ new Set();
    try {
      const installed = await this.offlineStore.listInstalled();
      offlineCollectionIds = this.getOfflineHadithCollectionIds(provider.metadata.id, installed);
    } catch {
    }
    new CollectionModal(this.app, collections, (collection) => {
      const isMuslim = collection.id.toLowerCase() === "muslim";
      const placeholder = isMuslim ? "e.g. 202 or 202a" : "e.g. 1 or 1-5";
      new InputModal(this.app, `${collection.name} \u2014 Hadith`, placeholder, "", async (value) => {
        const normalized = value.replace(/\s*[-–—]\s*/u, "-").trim().toLowerCase();
        const ref = parseHadithReference(`${collection.id}:${normalized}`);
        if (!ref) return;
        await this.chooseHadithOptions(editor, ref, operation.id, operation.signal, collections);
      }, () => this.operations.cancel(), (value) => {
        const normalized = value.replace(/\s*[-–—]\s*/u, "-").trim().toLowerCase();
        const pattern = isMuslim ? /^\d{1,6}[a-z]?(?:-\d{1,6}[a-z]?)?$/iu : /^\d{1,6}(?:-\d{1,6})?$/u;
        if (!pattern.test(normalized)) return isMuslim ? "Enter a Hadith number such as 202 or 202a." : "Enter a Hadith number or range, e.g. 1 or 1-5.";
        const ref = parseHadithReference(`${collection.id}:${normalized}`);
        return ref ? validateHadithReference(ref, collections, this.pluginSettings.hadithFetchLimit) : "Invalid Hadith/range.";
      }, "text").open();
    }, offlineCollectionIds).open();
  }
  getOfflineHadithCollectionIds(providerId, installed) {
    const ids = /* @__PURE__ */ new Set();
    for (const database of installed) {
      if (database.providerId !== providerId || database.kind !== "hadith") continue;
      const prefix = `${providerId}:`;
      if (!database.id.startsWith(prefix)) continue;
      const remainder = database.id.slice(prefix.length);
      const collectionId = providerId === "hadith-api" ? remainder.replace(/:eng$/u, "") : remainder;
      if (collectionId) ids.add(collectionId);
    }
    return ids;
  }
  async chooseHadithOptions(editor, ref, id, signal, knownCollections, initialOptions = this.pluginSettings.lastHadithOptions) {
    const provider = this.registry.getHadith(this.pluginSettings.hadithProvider);
    let collections = knownCollections;
    if (!collections) {
      try {
        collections = await provider.listCollections({ signal });
      } catch (error2) {
        new import_obsidian6.Notice(errorToNotice(error2));
        return;
      }
    }
    const error = validateHadithReference(ref, collections, this.pluginSettings.hadithFetchLimit);
    if (error) {
      new import_obsidian6.Notice(`ERROR: ${error}`);
      return;
    }
    new OptionsModal(
      this.app,
      initialOptions,
      {
        arabic: provider.capabilities.arabicText,
        english: provider.capabilities.englishTranslation,
        // Bukhari and Muslim receive a default Sahih grade when the provider omits one.
        // Keep that fallback user-controlled even for providers without grade metadata.
        grading: provider.capabilities.grading || ["bukhari", "muslim"].includes(ref.collectionId.toLowerCase()),
        isnad: provider.metadata.id === "hadith-unlocked"
      },
      async (options) => {
        await this.saveLastOptions("hadith", options);
        await this.fetchAndInsertHadith(editor, ref, id, signal, options, collections);
      },
      () => this.operations.cancel()
    ).open();
  }
  async fetchAndInsertHadith(editor, ref, id, signal, opts = this.pluginSettings.lastHadithOptions, collections) {
    try {
      const provider = this.registry.getHadith(this.pluginSettings.hadithProvider);
      const translations = await provider.listTranslations({ signal });
      const translation = translations.find((t) => t.id === this.pluginSettings.hadithTranslation && t.language.toLowerCase() === this.pluginSettings.hadithLanguage.toLowerCase()) ?? translations.find((t) => t.id === this.pluginSettings.hadithTranslation) ?? translations.find((t) => t.language.toLowerCase() === this.pluginSettings.hadithLanguage.toLowerCase()) ?? translations.find((t) => t.id === "eng") ?? translations[0];
      if (!translation) throw new AppError("No Hadith translation is configured for this provider.", "validation");
      const end = ref.endHadithNumber ?? ref.hadithNumber;
      if (typeof ref.hadithNumber === "number" && typeof end === "number" && end - ref.hadithNumber + 1 > this.pluginSettings.hadithFetchLimit) {
        throw new AppError(`Hadith fetch limit is ${this.pluginSettings.hadithFetchLimit} hadiths.`, "validation");
      }
      const results = await provider.fetchHadithRange(ref, translation, { signal });
      if (!this.operations.isCurrent(id)) return;
      const { normalizeArabic, normalizeEnglish } = createNormalizers(this.pluginSettings);
      const transformed = results.map((result) => {
        const gradedResult = applyDefaultHadithGrading(result);
        const item = structuredClone(gradedResult);
        if (item.arabicIsnad) item.arabicIsnad = normalizeArabic(item.arabicIsnad);
        if (item.arabic) item.arabic = normalizeArabic(item.arabic);
        if (item.englishIsnad) item.englishIsnad = normalizeEnglish(item.englishIsnad);
        if (item.english) item.english = normalizeEnglish(item.english);
        item.grades = item.grades.map((g) => ({ ...g, text: normalizeEnglish(g.text) }));
        return item;
      });
      const markdown = transformed.length === 1 ? formatHadith(transformed[0], { ...this.pluginSettings.formatting, showLink: opts.link }, opts) : formatHadithRange(transformed, { ...this.pluginSettings.formatting, showLink: opts.link }, opts);
      new PreviewModal(
        this.app,
        markdown,
        (edited) => {
          if (this.operations.isCurrent(id)) editor.replaceRange(edited, editor.getCursor());
        },
        () => {
          if (this.operations.isCurrent(id)) void this.chooseHadithOptions(editor, ref, id, signal, collections, opts);
        }
      ).open();
    } catch (error) {
      if (!this.operations.isCurrent(id)) return;
      new import_obsidian6.Notice(errorToNotice(error));
    }
  }
};
function mangleFormatting(pluginSettings) {
  return { ...pluginSettings, formatting: { ...DEFAULT_FORMATTING, ...pluginSettings.formatting } };
}

/* nosourcemap */