/**
 * 套餐修订：选择套餐编辑，或新增套餐；扩展为必选（多选清单 UI）；仅当基线套餐已含产品时显示产品勾选。
 * 支持任意现有套餐（来自 bundles-merged）；新增套餐 products 固定 []，提交完整 JSON 供 apply-bundle-proposal 创建 YAML 并重排 000x-。
 */
(function () {
  const PROPOSAL_MARKER = "<!-- license-bundles:proposal:v1 -->";
  const DEFAULT_REPO = "smartcat999/license-bundles";
  const ISSUE_TEMPLATE = "bundle-proposal.yml";
  const NEW_WIZARD = "__new__";
  /** 页面仅支持商业套餐；提案里固定写入 commercial */
  const TIER_FIXED = "commercial";

  const params = new URLSearchParams(window.location.search || "");

  function parseRepo(s) {
    const parts = String(s || "")
      .trim()
      .split("/")
      .filter(Boolean);
    if (parts.length >= 2) return { owner: parts[0], name: parts.slice(1).join("/") };
    const d = DEFAULT_REPO.split("/").filter(Boolean);
    return { owner: d[0], name: d[1] };
  }

  const ghRepo = parseRepo(params.get("repo") || DEFAULT_REPO);

  /** @type {Record<string, { level: number, tier: string, display_name: object, products: string[], extensions: string[] }>} */
  let baseline = {};
  /** @type {Record<string, object>} */
  let drafts = {};
  /** @type {Record<string, { isNew?: boolean }>} */
  let draftMeta = {};
  /** @type {string | null} */
  let selectedBundle = null;
  /** 列表可见时高亮的套餐 data-bundle（从编辑返回或加入新增后记录） */
  let pickerListSelection = null;
  let newWizardSlugBlurred = false;
  let newWizardLevelBlurred = false;

  let productItems = [];
  let extensionItems = [];

  const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function attrEsc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  }

  function safeId(s) {
    return String(s).replace(/[^a-zA-Z0-9_-]/g, "_");
  }

  function deepCopy(o) {
    return JSON.parse(JSON.stringify(o));
  }

  function normalizeDisplay(d) {
    const o = {};
    if (d && typeof d.zh === "string" && d.zh.trim()) o.zh = d.zh.trim();
    if (d && typeof d.en === "string" && d.en.trim()) o.en = d.en.trim();
    return o;
  }

  function sortStrList(a) {
    return [...a].sort();
  }

  function stableJson(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  function productPrimary(p) {
    const d = p.display_name || {};
    return d.zh || d.en || p.name || "";
  }

  function extensionPrimary(ext) {
    const d = ext.display_name && typeof ext.display_name === "object" ? ext.display_name : null;
    return ext.chineseName || (d && (d.zh || d.en)) || ext.englishName || "";
  }

  function sortedProducts() {
    return [...productItems].sort((a, b) =>
      productPrimary(a).localeCompare(productPrimary(b), "zh-CN", { sensitivity: "base" })
    );
  }

  function sortedExtensions() {
    return [...extensionItems].sort((a, b) =>
      extensionPrimary(a).localeCompare(extensionPrimary(b), "zh-CN", { sensitivity: "base" })
    );
  }

  function sortedBaselineNames() {
    return Object.keys(baseline).sort((a, b) => {
      const la = baseline[a].level ?? 0;
      const lb = baseline[b].level ?? 0;
      if (lb !== la) return lb - la;
      return a.localeCompare(b);
    });
  }

  function pendingNewNames() {
    return Object.keys(drafts).filter((n) => draftMeta[n] && draftMeta[n].isNew);
  }

  function allUsedLevels() {
    const s = new Set();
    Object.keys(baseline).forEach((n) => s.add(baseline[n].level));
    pendingNewNames().forEach((n) => {
      if (drafts[n] && typeof drafts[n].level === "number") s.add(drafts[n].level);
    });
    return s;
  }

  function isBundleDirty(name) {
    if (draftMeta[name] && draftMeta[name].isNew) return true;
    if (!baseline[name]) return false;
    const d = drafts[name];
    if (!d) return false;
    const b = baseline[name];
    const prodDirty =
      baselineHasProducts(name) && !stableJson(sortStrList(d.products), sortStrList(b.products));
    return (
      !stableJson(normalizeDisplay(d.display_name), normalizeDisplay(b.display_name)) ||
      prodDirty ||
      !stableJson(sortStrList(d.extensions), sortStrList(b.extensions))
    );
  }

  function ensureDraft(name) {
    if (!baseline[name] || draftMeta[name]?.isNew) return;
    if (!drafts[name])
      drafts[name] = {
        display_name: deepCopy(baseline[name].display_name),
        products: deepCopy(baseline[name].products),
        extensions: deepCopy(baseline[name].extensions),
      };
  }

  function buildProductCheckboxRows(selected) {
    const sel = new Set(selected || []);
    return sortedProducts()
      .map((p) => {
        const pid = p.name;
        const checked = sel.has(pid) ? " checked" : "";
        const primary = productPrimary(p);
        const searchPlain = `${primary} ${pid}`.toLowerCase();
        const id = `cb-prod-${safeId(pid)}`;
        return `<div class="propose-check-row" data-search="${attrEsc(searchPlain)}">
          <input type="checkbox" data-prop="product" value="${esc(pid)}" id="${id}"${checked} />
          <label class="propose-check-row__text" for="${id}">${esc(primary)}<span class="propose-check-row__sub">${esc(`内部标识：${pid}`)}</span></label>
        </div>`;
      })
      .join("");
  }

  function buildExtCheckboxRows(selected) {
    const sel = new Set(selected || []);
    return sortedExtensions()
      .map((ext) => {
        const eid = ext.englishName;
        if (!eid) return "";
        const checked = sel.has(eid) ? " checked" : "";
        const primary = extensionPrimary(ext);
        const searchPlain = `${primary} ${eid}`.toLowerCase();
        const id = `cb-ext-${safeId(eid)}`;
        return `<div class="propose-check-row" data-search="${attrEsc(searchPlain)}">
          <input type="checkbox" data-prop="ext" value="${esc(eid)}" id="${id}"${checked} />
          <label class="propose-check-row__text" for="${id}">${esc(primary)}<span class="propose-check-row__sub">${esc(`内部标识：${eid}`)}</span></label>
        </div>`;
      })
      .join("");
  }

  function baselineHasProducts(name) {
    const p = baseline[name] && baseline[name].products;
    return Array.isArray(p) && p.length > 0;
  }

  /** @param {string[] | undefined} selected */
  function extMultiselectFieldsetHtml(selected) {
    return `<fieldset class="propose-fieldset propose-fieldset--multiselect">
        <legend>扩展组件 <span class="propose-req" aria-hidden="true">*</span></legend>
        <p id="extensions-selection-summary" class="propose-multiselect__summary" role="status" aria-live="polite"></p>
        <input type="search" id="filter-ext" class="propose-filter" placeholder="筛选…" autocomplete="off" />
        <div class="propose-check-toolbar">
          <button type="button" id="ext-all-visible">全选</button>
          <button type="button" id="ext-none-visible">全不选</button>
        </div>
        <div id="ext-list" class="propose-check-scroll propose-multiselect__list" role="group" aria-label="扩展组件">${buildExtCheckboxRows(selected)}</div>
      </fieldset>
      <p class="propose-field__hint propose-field__hint--req">* 至少选择一项扩展</p>`;
  }

  function bindFilter(searchId, containerSelector) {
    const input = document.getElementById(searchId);
    const box = document.querySelector(containerSelector);
    if (!input || !box) return;
    input.addEventListener("input", () => {
      const q = input.value.trim().toLowerCase();
      box.querySelectorAll(".propose-check-row").forEach((row) => {
        const hay = (row.getAttribute("data-search") || "").toLowerCase();
        row.classList.toggle("propose-check-row--hidden", q.length > 0 && !hay.includes(q));
      });
    });
  }

  /** @param {string} prefix @param {string} dataProp @param {(() => void) | null} onAfter */
  function bindSelectToolbar(prefix, dataProp, onAfter) {
    const box = document.getElementById(`${prefix}-list`);
    const allBtn = document.getElementById(`${prefix}-all-visible`);
    const noneBtn = document.getElementById(`${prefix}-none-visible`);
    if (!box || !allBtn || !noneBtn) return;
    const done = typeof onAfter === "function" ? onAfter : null;
    allBtn.addEventListener("click", () => {
      box.querySelectorAll(".propose-check-row:not(.propose-check-row--hidden)").forEach((row) => {
        const cb = row.querySelector(`input[data-prop="${dataProp}"]`);
        if (cb) cb.checked = true;
      });
      if (done) done();
    });
    noneBtn.addEventListener("click", () => {
      box.querySelectorAll(".propose-check-row:not(.propose-check-row--hidden)").forEach((row) => {
        const cb = row.querySelector(`input[data-prop="${dataProp}"]`);
        if (cb) cb.checked = false;
      });
      if (done) done();
    });
  }

  /**
   * @param {boolean} includeProducts
   * @param {(() => void) | null} [onToolbarCommit] 产品全选/取消后刷新（扩展侧始终会再刷扩展摘要）
   */
  function bindEditorLists(includeProducts, onToolbarCommit) {
    const commit = typeof onToolbarCommit === "function" ? onToolbarCommit : null;
    const extAfter = () => {
      if (commit) commit();
      updateExtensionSelectionSummary();
    };
    if (includeProducts) {
      bindFilter("filter-products", "#products-list");
      bindSelectToolbar("products", "product", commit);
    }
    bindFilter("filter-ext", "#ext-list");
    bindSelectToolbar("ext", "ext", extAfter);
  }

  function updateExtensionSelectionSummary() {
    const el = document.getElementById("extensions-selection-summary");
    if (!el) return;
    const box = document.getElementById("ext-list");
    if (!box) {
      el.textContent = "";
      return;
    }
    const inputs = box.querySelectorAll('input[data-prop="ext"]');
    const checked = box.querySelectorAll('input[data-prop="ext"]:checked').length;
    el.textContent = `已选 ${checked} / ${inputs.length}`;
  }

  function updateProductSelectionSummary() {
    const el = document.getElementById("products-selection-summary");
    if (!el) return;
    const box = document.getElementById("products-list");
    if (!box) {
      el.textContent = "";
      return;
    }
    const inputs = box.querySelectorAll('input[data-prop="product"]');
    const checked = box.querySelectorAll('input[data-prop="product"]:checked').length;
    el.textContent = `已选 ${checked} / ${inputs.length}`;
  }

  function updateExistingEditorResetState() {
    const name = selectedBundle;
    const btn = document.getElementById("propose-reset-baseline");
    if (!name || !baseline[name] || draftMeta[name]?.isNew || !btn) return;
    readFormFromDom();
    const dirty = isBundleDirty(name);
    btn.disabled = !dirty;
  }

  /** @type {AbortController | null} */
  let existingEditorLiveAbort = null;
  /** @type {AbortController | null} */
  let pendingWizardBodyAbort = null;

  function clearExistingEditorLiveSync() {
    if (existingEditorLiveAbort) {
      existingEditorLiveAbort.abort();
      existingEditorLiveAbort = null;
    }
  }

  function clearPendingWizardBodySync() {
    if (pendingWizardBodyAbort) {
      pendingWizardBodyAbort.abort();
      pendingWizardBodyAbort = null;
    }
  }

  function bindExistingEditorLiveSync() {
    clearExistingEditorLiveSync();
    const body = document.getElementById("propose-editor-body");
    const name = selectedBundle;
    if (!body || !name || !baseline[name] || draftMeta[name]?.isNew) return;
    existingEditorLiveAbort = new AbortController();
    const { signal } = existingEditorLiveAbort;
    const handler = () => {
      readFormFromDom();
      updateExistingEditorResetState();
      updateProductSelectionSummary();
      updateExtensionSelectionSummary();
    };
    body.addEventListener("input", handler, { signal });
    body.addEventListener("change", handler, { signal });
  }

  /** @param {boolean} isNewWizard selectedBundle === NEW_WIZARD */
  function bindPendingOrWizardBodySync(isNewWizard) {
    clearPendingWizardBodySync();
    const body = document.getElementById("propose-editor-body");
    if (!body) return;
    pendingWizardBodyAbort = new AbortController();
    const { signal } = pendingWizardBodyAbort;
    const handler = () => {
      if (!isNewWizard) readFormFromDom();
      updateExtensionSelectionSummary();
    };
    body.addEventListener("input", handler, { signal });
    body.addEventListener("change", handler, { signal });
  }

  function readCheckedProducts() {
    const products = [];
    document.querySelectorAll('#propose-editor-body input[data-prop="product"]:checked').forEach((cb) => {
      products.push(cb.value);
    });
    return sortStrList(products);
  }

  function readCheckedExtensions() {
    const extensions = [];
    document.querySelectorAll('#propose-editor-body input[data-prop="ext"]:checked').forEach((cb) => {
      extensions.push(cb.value);
    });
    return sortStrList(extensions);
  }

  function readFormFromDom() {
    if (!selectedBundle || selectedBundle === NEW_WIZARD) return;
    if (draftMeta[selectedBundle] && draftMeta[selectedBundle].isNew) {
      const level = parseInt(document.getElementById("prop-level") && document.getElementById("prop-level").value, 10);
      const zhEl = document.getElementById("prop-dn-zh");
      const enEl = document.getElementById("prop-dn-en");
      let display_name = normalizeDisplay({ zh: zhEl && zhEl.value, en: enEl && enEl.value });
      if (!display_name.zh && !display_name.en) display_name = deepCopy(drafts[selectedBundle].display_name || {});
      drafts[selectedBundle] = {
        level: Number.isFinite(level) ? level : drafts[selectedBundle].level,
        tier: TIER_FIXED,
        display_name,
        products: [],
        extensions: readCheckedExtensions(),
      };
      return;
    }
    if (!baseline[selectedBundle]) return;
    const name = selectedBundle;
    const zhEl = document.getElementById("prop-dn-zh");
    const enEl = document.getElementById("prop-dn-en");
    let display_name = normalizeDisplay({ zh: zhEl && zhEl.value, en: enEl && enEl.value });
    if (!display_name.zh && !display_name.en) {
      display_name = { ...normalizeDisplay(baseline[name].display_name) };
    }
    drafts[name] = {
      display_name,
      products: baselineHasProducts(name) ? readCheckedProducts() : [],
      extensions: readCheckedExtensions(),
    };
  }

  function saveCurrentDraft() {
    if (selectedBundle && selectedBundle !== NEW_WIZARD) readFormFromDom();
  }

  /**
   * 切换套餐或返回列表时丢弃当前编辑区未提交的改动：已有套餐恢复为目录 baseline，
   * 待合并新增恢复为「加入列表」时的快照（无快照的旧数据则移除该项）。
   */
  function discardDraftWhenLeaving(prev) {
    if (!prev || prev === NEW_WIZARD) return;
    if (draftMeta[prev] && draftMeta[prev].isNew) {
      const snap = draftMeta[prev].baselineSnapshot;
      if (snap) drafts[prev] = deepCopy(snap);
      else {
        delete drafts[prev];
        delete draftMeta[prev];
      }
      return;
    }
    if (baseline[prev]) {
      drafts[prev] = {
        display_name: deepCopy(baseline[prev].display_name),
        products: deepCopy(baseline[prev].products),
        extensions: deepCopy(baseline[prev].extensions),
      };
    }
  }

  function buildPatch() {
    saveCurrentDraft();
    /** @type {Record<string, object>} */
    const bundles = {};
    for (const name of pendingNewNames()) {
      const d = drafts[name];
      if (!d) continue;
      bundles[name] = {
        level: d.level,
        tier: TIER_FIXED,
        display_name: normalizeDisplay(d.display_name),
        products: [],
        extensions: sortStrList(d.extensions || []),
      };
    }
    for (const name of sortedBaselineNames()) {
      if (draftMeta[name] && draftMeta[name].isNew) continue;
      const cur =
        drafts[name] != null
          ? drafts[name]
          : {
              display_name: baseline[name].display_name,
              products: baseline[name].products,
              extensions: baseline[name].extensions,
            };
      const base = baseline[name];
      const part = {};
      if (!stableJson(normalizeDisplay(cur.display_name), normalizeDisplay(base.display_name)))
        part.display_name = normalizeDisplay(cur.display_name);
      if (baselineHasProducts(name) && !stableJson(sortStrList(cur.products), sortStrList(base.products)))
        part.products = cur.products;
      if (!stableJson(sortStrList(cur.extensions), sortStrList(base.extensions)))
        part.extensions = cur.extensions;
      if (Object.keys(part).length) bundles[name] = part;
    }
    return bundles;
  }

  function diffStrLists(prev, next) {
    const ps = new Set(prev || []);
    const ns = new Set(next || []);
    const added = sortStrList([...ns].filter((x) => !ps.has(x)));
    const removed = sortStrList([...ps].filter((x) => !ns.has(x)));
    return { added, removed };
  }

  function catalogLabelForProduct(id) {
    const p = productItems.find((x) => x && x.name === id);
    if (!p) return id;
    const label = productPrimary(p);
    return label && label !== id ? `${label}（${id}）` : id;
  }

  function catalogLabelForExtension(id) {
    const e = extensionItems.find((x) => x && x.englishName === id);
    if (!e) return id;
    const label = extensionPrimary(e);
    return label && label !== id ? `${label}（${id}）` : id;
  }

  function joinLabels(ids, labeler, maxShow) {
    const lim = typeof maxShow === "number" ? maxShow : 12;
    if (!ids.length) return "";
    const shown = ids.slice(0, lim);
    let s = shown.map(labeler).join("、");
    if (ids.length > lim) s += ` 等共 ${ids.length} 项`;
    return s;
  }

  /**
   * 根据与 baseline 的差异生成给人读的概要（写入 Issue 与 JSON summary）。
   * 句式尽量短：展示名由 A → B；增加/移除扩展或产品。
   */
  function buildAutoChangeSummary(bundles) {
    const lines = [];
    for (const name of Object.keys(bundles).sort()) {
      const ch = bundles[name];
      const isNew = typeof ch.level === "number" && ch.tier != null;
      if (isNew) {
        const dn = normalizeDisplay(ch.display_name);
        const dnBits = [];
        if (dn.zh) dnBits.push(`中文「${dn.zh}」`);
        if (dn.en) dnBits.push(`英文「${dn.en}」`);
        const extIds = sortStrList(ch.extensions || []);
        lines.push(
          `新增套餐「${name}」Lv ${ch.level}，${dnBits.join("，") || "展示名见 JSON"}，扩展：${joinLabels(extIds, catalogLabelForExtension, 16)}`
        );
        continue;
      }
      const base = baseline[name];
      if (!base) continue;
      const bits = [];
      if (ch.display_name) {
        const bef = normalizeDisplay(base.display_name);
        const aft = normalizeDisplay(ch.display_name);
        if (bef.zh !== aft.zh)
          bits.push(`中文展示名由「${bef.zh || "（空）"}」→「${aft.zh || "（空）"}」`);
        if (bef.en !== aft.en)
          bits.push(`英文展示名由「${bef.en || "（空）"}」→「${aft.en || "（空）"}」`);
      }
      if (ch.products && baselineHasProducts(name)) {
        const { added, removed } = diffStrLists(base.products, ch.products);
        if (added.length) bits.push(`增加产品 ${joinLabels(added, catalogLabelForProduct, 12)}`);
        if (removed.length) bits.push(`移除产品 ${joinLabels(removed, catalogLabelForProduct, 12)}`);
      }
      if (ch.extensions) {
        const { added, removed } = diffStrLists(base.extensions, ch.extensions);
        if (added.length) bits.push(`增加扩展 ${joinLabels(added, catalogLabelForExtension, 14)}`);
        if (removed.length) bits.push(`移除扩展 ${joinLabels(removed, catalogLabelForExtension, 14)}`);
      }
      if (bits.length) lines.push(`「${name}」${bits.join("；")}`);
    }
    let out = lines.join("\n");
    if (out.length > 6000) out = `${out.slice(0, 5997)}…`;
    return out;
  }

  /** 手填仅作可选备注，正文以自动差异为主 */
  function mergeChangeSummaries(userText, autoText) {
    const a = (autoText && String(autoText).trim()) || "";
    const u = (userText && String(userText).trim()) || "";
    if (!u) return a;
    if (!a) return u;
    return `${a}\n\n备注：${u}`;
  }

  function capSummaryText(s, max) {
    if (!s) return "";
    if (s.length <= max) return s;
    return `${s.slice(0, max - 1)}…`;
  }

  /**
   * 供 GitHub issues/new?title= 预填。标题只放短信息：手填一句或涉及套餐名列表；
   * 产品/扩展等明细仅在正文「本次变更说明」，不写入标题。
   */
  function buildProposeIssueTitle(bundles, summaryUser) {
    const prefix = "[套餐提案] ";
    const keys = Object.keys(bundles || {}).sort();
    const u = (summaryUser && String(summaryUser).trim()) || "";
    let tail = "";
    if (u) tail = u.replace(/\s+/g, " ").trim();
    else if (keys.length) tail = keys.join("、");
    let out = tail ? prefix + tail : prefix.replace(/\s+$/, "");
    const max = 240;
    if (out.length > max) out = `${out.slice(0, max - 1)}…`;
    return out;
  }

  /** 扩展为必填：待合并新增与「有改动的」已有套餐在提交前须至少选一项 */
  function validateExtensionsForProposal() {
    for (const name of pendingNewNames()) {
      const d = drafts[name];
      if (!d || !Array.isArray(d.extensions) || d.extensions.length === 0)
        return "新增套餐须至少选择一项扩展组件。";
    }
    for (const name of sortedBaselineNames()) {
      if (draftMeta[name]?.isNew) continue;
      if (!isBundleDirty(name)) continue;
      const d = drafts[name];
      if (!d || !Array.isArray(d.extensions) || d.extensions.length === 0)
        return `「${name}」已修改但未选择扩展组件，请至少选一项。`;
    }
    return "";
  }

  function setStatus(msg, isErr) {
    const el = document.getElementById("propose-status");
    if (!el) return;
    el.textContent = msg || "";
    el.classList.toggle("propose-status--err", !!isErr);
  }

  /** 仅当编辑区顶部不在视口内时才滚动，避免已可见时 nearest 对齐到表单内部（如重置按钮） */
  function scrollEditorIntoViewIfNeeded() {
    const editor = document.getElementById("propose-editor");
    if (!editor || editor.hidden) return;
    const rect = editor.getBoundingClientRect();
    const vh = window.innerHeight || document.documentElement.clientHeight;
    const margin = 12;
    if (rect.top >= margin && rect.top < vh - margin) return;
    editor.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  function scheduleScrollEditorIfNeeded() {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => scrollEditorIntoViewIfNeeded());
    });
  }

  /** @param {{ scrollSelection?: boolean }} [opts] */
  function renderPicker(opts) {
    const root = document.getElementById("propose-picker");
    if (!root) return;
    const scrollSelection = !!(opts && opts.scrollSelection);
    const sel = pickerListSelection;
    const parts = [];
    for (const name of sortedBaselineNames()) {
      const b = baseline[name];
      const dn = b.display_name || {};
      const title = dn.zh || dn.en || name;
      const nProd = (b.products && b.products.length) || 0;
      const nExt = (b.extensions && b.extensions.length) || 0;
      const dirty = isBundleDirty(name);
      const metaBits = [];
      if (nProd > 0) metaBits.push(`${nProd} 个产品`);
      metaBits.push(`${nExt} 个扩展`);
      const selected = sel === name;
      parts.push(`<button type="button" class="propose-picker__card${selected ? " propose-picker__card--selected" : ""}" data-bundle="${esc(name)}"${selected ? ' aria-current="true"' : ""}>
        <span class="propose-picker__title-row">
          <span class="propose-picker__title">${esc(title)}</span>
          <span class="badge propose-picker__level">${esc(`Lv ${b.level}`)}</span>
        </span>
        <span class="propose-picker__meta">${esc(metaBits.join(" · "))}</span>
        ${dirty ? '<span class="propose-picker__badge">有未提交修改</span>' : ""}
      </button>`);
    }
    for (const name of pendingNewNames()) {
      const d = drafts[name];
      const dn = (d && d.display_name) || {};
      const title = dn.zh || dn.en || name;
      const selected = sel === name;
      parts.push(`<button type="button" class="propose-picker__card propose-picker__card--pending${selected ? " propose-picker__card--selected" : ""}" data-bundle="${esc(name)}"${selected ? ' aria-current="true"' : ""}>
        <span class="propose-picker__title-row">
          <span class="propose-picker__title">${esc(title)}</span>
          <span class="badge propose-picker__level">${esc(`Lv ${d.level}`)}</span>
        </span>
        <span class="propose-picker__meta">新增「${esc(name)}」· 商业</span>
        <span class="propose-picker__badge">待合并</span>
      </button>`);
    }
    const addSelected = sel === NEW_WIZARD;
    parts.push(
      `<button type="button" class="propose-picker__card propose-picker__card--add${addSelected ? " propose-picker__card--selected" : ""}" data-bundle="${NEW_WIZARD}"${addSelected ? ' aria-current="true"' : ""}>
        <span class="propose-picker__title-row">
          <span class="propose-picker__title">＋ 新增套餐</span>
        </span>
        <span class="propose-picker__meta">填写内部标识、Lv 与扩展</span>
      </button>`
    );
    root.innerHTML = parts.join("");
    root.querySelectorAll("[data-bundle]").forEach((btn) => {
      btn.addEventListener("click", () => openBundle(btn.getAttribute("data-bundle")));
    });
    if (scrollSelection) {
      const hi = root.querySelector(".propose-picker__card--selected");
      if (hi) hi.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }

  function resetExistingToBaseline(name) {
    if (!baseline[name] || draftMeta[name]?.isNew) return;
    drafts[name] = {
      display_name: deepCopy(baseline[name].display_name),
      products: deepCopy(baseline[name].products),
      extensions: deepCopy(baseline[name].extensions),
    };
    renderExistingEditor(name);
  }

  function renderExistingEditor(name) {
    clearPendingWizardBodySync();
    ensureDraft(name);
    const d = drafts[name];
    const dn = d.display_name || {};
    const showProducts = baselineHasProducts(name);
    const titleEl = document.getElementById("propose-editor-title");
    if (titleEl) {
      const friendly = dn.zh || dn.en || name;
      titleEl.textContent = `正在编辑：${friendly}`;
    }
    const body = document.getElementById("propose-editor-body");
    if (!body) return;
    const productFieldset = showProducts
      ? `<fieldset class="propose-fieldset propose-fieldset--multiselect">
        <legend>产品</legend>
        <p id="products-selection-summary" class="propose-multiselect__summary" role="status" aria-live="polite"></p>
        <input type="search" id="filter-products" class="propose-filter" placeholder="筛选…" autocomplete="off" />
        <div class="propose-check-toolbar">
          <button type="button" id="products-all-visible">全选</button>
          <button type="button" id="products-none-visible">全不选</button>
        </div>
        <div id="products-list" class="propose-check-scroll propose-multiselect__list" role="group" aria-label="产品">${buildProductCheckboxRows(d.products)}</div>
      </fieldset>`
      : "";
    body.innerHTML = `
      <p class="propose-reset-row">
        <button type="button" id="propose-reset-baseline" class="propose-btn-ghost">重置</button>
      </p>
      <p class="propose-field__hint" style="margin-top:0"><code style="font-size:12px">${esc(name)}</code></p>
      <div class="propose-field">
        <label for="prop-dn-zh">中文名称</label>
        <input id="prop-dn-zh" type="text" value="${esc(dn.zh || "")}" autocomplete="off" maxlength="200" />
      </div>
      <div class="propose-field">
        <label for="prop-dn-en">英文名称（选填）</label>
        <input id="prop-dn-en" type="text" value="${esc(dn.en || "")}" autocomplete="off" maxlength="200" />
      </div>
      ${productFieldset}
      ${extMultiselectFieldsetHtml(d.extensions)}`;
    const toolbarRefresh = () => {
      readFormFromDom();
      updateExistingEditorResetState();
      updateProductSelectionSummary();
    };
    bindEditorLists(showProducts, toolbarRefresh);
    const resetBtn = document.getElementById("propose-reset-baseline");
    if (resetBtn) resetBtn.addEventListener("click", () => resetExistingToBaseline(name));
    bindExistingEditorLiveSync();
    updateExistingEditorResetState();
    updateProductSelectionSummary();
    updateExtensionSelectionSummary();
  }

  function renderPendingNewEditor(name) {
    clearExistingEditorLiveSync();
    clearPendingWizardBodySync();
    const d = drafts[name];
    const dn = d.display_name || {};
    const titleEl = document.getElementById("propose-editor-title");
    if (titleEl) titleEl.textContent = `新增套餐：${name}`;
    const body = document.getElementById("propose-editor-body");
    if (!body) return;
    body.innerHTML = `
      <p class="propose-field__hint" style="margin-top:0"><code style="font-size:12px">${esc(name)}</code></p>
      <div class="propose-field propose-field--inline">
        <label for="prop-level">level <span class="propose-req" aria-hidden="true">*</span></label>
        <input id="prop-level" class="propose-input-level" type="number" min="0" max="9999" step="1" value="${esc(String(d.level))}" />
        <p class="propose-field__hint">数字越大，开放的功能越多</p>
      </div>
      <div class="propose-field">
        <label for="prop-dn-zh">中文名称</label>
        <input id="prop-dn-zh" type="text" value="${esc(dn.zh || "")}" autocomplete="off" maxlength="200" />
      </div>
      <div class="propose-field">
        <label for="prop-dn-en">英文名称（选填）</label>
        <input id="prop-dn-en" type="text" value="${esc(dn.en || "")}" autocomplete="off" maxlength="200" />
      </div>
      <p class="propose-field__hint propose-field__hint--req">* 中文与英文至少填一项</p>
      ${extMultiselectFieldsetHtml(d.extensions)}`;
    bindEditorLists(false, () => readFormFromDom());
    bindPendingOrWizardBodySync(false);
    updateExtensionSelectionSummary();
  }

  function setInlineFieldMsg(id, errText) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = errText || "";
    el.classList.toggle("propose-field__msg--err", !!errText);
  }

  function updateNewWizardInlineHints() {
    if (selectedBundle !== NEW_WIZARD) return;
    const nameInput = document.getElementById("prop-new-name");
    const raw = (nameInput && nameInput.value) || "";
    const slug = raw.trim().toLowerCase();
    let slugErr = "";
    if (!raw.trim()) {
      if (newWizardSlugBlurred) slugErr = "必填";
    } else if (/[A-Z]/.test(raw)) {
      slugErr = "请使用小写字母";
    } else if (!SLUG_RE.test(slug)) {
      if (/^[0-9-]/.test(slug)) slugErr = "须以小写字母开头";
      else if (/[^a-z0-9-]/.test(slug)) slugErr = "仅小写字母、数字、连字符";
      else slugErr = "格式不正确";
    } else if (baseline[slug] || drafts[slug]) {
      slugErr = "该标识已存在";
    }
    setInlineFieldMsg("prop-new-name-msg", slugErr);

    const lvRaw = document.getElementById("prop-level") && document.getElementById("prop-level").value;
    let lvErr = "";
    if (lvRaw === "" || lvRaw == null) {
      if (newWizardLevelBlurred) lvErr = "必填";
    } else {
      const level = parseInt(lvRaw, 10);
      if (!Number.isFinite(level) || level < 0 || level > 9999) lvErr = "须为 0～9999 的整数";
      else if (allUsedLevels().has(level)) lvErr = "该 level 已被占用";
    }
    setInlineFieldMsg("prop-level-msg", lvErr);
  }

  function wireNewWizardValidation() {
    const n = document.getElementById("prop-new-name");
    const l = document.getElementById("prop-level");
    const upd = () => updateNewWizardInlineHints();
    if (n) {
      n.addEventListener("input", upd);
      n.addEventListener("blur", () => {
        newWizardSlugBlurred = true;
        upd();
      });
    }
    if (l) {
      l.addEventListener("input", upd);
      l.addEventListener("blur", () => {
        newWizardLevelBlurred = true;
        upd();
      });
    }
  }

  /**
   * 从新增向导 DOM 解析数据；requireFull 时校验展示名与扩展并报 setStatus。
   * @returns {{ slug: string, level: number, display_name: object, extensions: string[] } | null}
   */
  function parseNewWizardFromDom(requireFull) {
    const nameInput = document.getElementById("prop-new-name");
    const slug = ((nameInput && nameInput.value) || "").trim().toLowerCase();
    if (!slug) {
      if (requireFull) setStatus("请填写内部标识。", true);
      return null;
    }
    if (!SLUG_RE.test(slug)) {
      if (requireFull) setStatus("内部标识格式不对：须以小写字母开头，仅小写字母、数字、连字符。", true);
      return null;
    }
    if (baseline[slug] || drafts[slug]) {
      if (requireFull) setStatus("该内部标识已存在，请换一个。", true);
      return null;
    }
    const level = parseInt(document.getElementById("prop-level") && document.getElementById("prop-level").value, 10);
    if (!Number.isFinite(level) || level < 0 || level > 9999) {
      if (requireFull) setStatus("level 须为 0～9999 的整数。", true);
      return null;
    }
    if (allUsedLevels().has(level)) {
      if (requireFull) setStatus("该 level 已被占用。", true);
      return null;
    }
    const zhEl = document.getElementById("prop-dn-zh");
    const enEl = document.getElementById("prop-dn-en");
    const display_name = normalizeDisplay({ zh: zhEl && zhEl.value, en: enEl && enEl.value });
    const extensions = readCheckedExtensions();
    if (requireFull) {
      if (!display_name.zh && !display_name.en) {
        setStatus("请至少填写中文或英文展示名称。", true);
        return null;
      }
      if (!extensions.length) {
        setStatus("请至少选择一项扩展组件。", true);
        return null;
      }
    }
    return { slug, level, display_name, extensions };
  }

  /** 在「新增套餐」向导点主提交时：校验通过后写入 drafts 并回到列表 */
  function flushNewWizardToDraftsIfComplete() {
    if (selectedBundle !== NEW_WIZARD) return true;
    const p = parseNewWizardFromDom(true);
    if (!p) return false;
    const entry = {
      level: p.level,
      tier: TIER_FIXED,
      display_name: p.display_name,
      products: [],
      extensions: p.extensions,
    };
    drafts[p.slug] = entry;
    draftMeta[p.slug] = { isNew: true, baselineSnapshot: deepCopy(entry) };
    selectedBundle = null;
    pickerListSelection = p.slug;
    const picker = document.getElementById("propose-picker");
    const editor = document.getElementById("propose-editor");
    if (picker) {
      picker.hidden = false;
      renderPicker({ scrollSelection: true });
    }
    if (editor) editor.hidden = true;
    return true;
  }

  function renderNewWizard() {
    clearExistingEditorLiveSync();
    clearPendingWizardBodySync();
    newWizardSlugBlurred = false;
    newWizardLevelBlurred = false;
    const titleEl = document.getElementById("propose-editor-title");
    if (titleEl) titleEl.textContent = "新增套餐";
    const body = document.getElementById("propose-editor-body");
    if (!body) return;
    body.innerHTML = `
      <div class="propose-field">
        <label for="prop-new-name">内部标识 <span class="propose-req" aria-hidden="true">*</span></label>
        <input id="prop-new-name" type="text" placeholder="小写字母、数字、连字符" autocomplete="off" maxlength="64" />
        <p id="prop-new-name-msg" class="propose-field__msg" role="status" aria-live="polite"></p>
      </div>
      <div class="propose-field">
        <label for="prop-level">level <span class="propose-req" aria-hidden="true">*</span></label>
        <input id="prop-level" class="propose-input-level" type="number" min="0" max="9999" step="1" value="" />
        <p class="propose-field__hint">数字越大，开放的功能越多</p>
        <p id="prop-level-msg" class="propose-field__msg" role="status" aria-live="polite"></p>
      </div>
      <div class="propose-field">
        <label for="prop-dn-zh">中文名称</label>
        <input id="prop-dn-zh" type="text" value="" autocomplete="off" maxlength="200" />
      </div>
      <div class="propose-field">
        <label for="prop-dn-en">英文名称（选填）</label>
        <input id="prop-dn-en" type="text" value="" autocomplete="off" maxlength="200" />
      </div>
      <p class="propose-field__hint propose-field__hint--req">* 中文与英文至少填一项</p>
      ${extMultiselectFieldsetHtml([])}`;
    bindEditorLists(false);
    bindPendingOrWizardBodySync(true);
    updateExtensionSelectionSummary();
    wireNewWizardValidation();
    updateNewWizardInlineHints();
  }

  function openBundle(name) {
    if (!name) return;
    const prev = selectedBundle;
    if (prev && prev !== name) discardDraftWhenLeaving(prev);
    selectedBundle = name;
    pickerListSelection = name;
    const picker = document.getElementById("propose-picker");
    const editor = document.getElementById("propose-editor");
    if (picker) {
      picker.hidden = false;
      renderPicker();
    }
    if (editor) editor.hidden = false;
    if (name === NEW_WIZARD) {
      renderNewWizard();
      scheduleScrollEditorIfNeeded();
      return;
    }
    if (draftMeta[name] && draftMeta[name].isNew) {
      renderPendingNewEditor(name);
      scheduleScrollEditorIfNeeded();
      return;
    }
    if (baseline[name]) {
      renderExistingEditor(name);
      scheduleScrollEditorIfNeeded();
      return;
    }
    setStatus("无法打开该套餐。", true);
    backToPicker();
  }

  function backToPicker() {
    discardDraftWhenLeaving(selectedBundle);
    selectedBundle = null;
    pickerListSelection = null;
    const picker = document.getElementById("propose-picker");
    const editor = document.getElementById("propose-editor");
    if (picker) picker.hidden = false;
    if (editor) editor.hidden = true;
    if (picker) renderPicker();
  }

  function buildIssueBody(bundles, summary) {
    const summaryCapped = capSummaryText(summary, 9000);
    const doc = { version: 1, bundles };
    if (summaryCapped) doc.summary = summaryCapped;
    const json = JSON.stringify(doc, null, 2);
    const humanBlock =
      summaryCapped.trim() !== ""
        ? `## 本次变更说明\n\n${summaryCapped}\n\n`
        : "";
    return (
      humanBlock +
      `${PROPOSAL_MARKER}\n\n` +
      `（以下为合并用 JSON，请勿删除标记行与代码块。）\n\n` +
      "```json\n" +
      json +
      "\n```\n"
    );
  }

  async function onSubmit() {
    setStatus("");
    saveCurrentDraft();
    if (!flushNewWizardToDraftsIfComplete()) return;
    const extErr = validateExtensionsForProposal();
    if (extErr) {
      setStatus(extErr, true);
      return;
    }
    const bundles = buildPatch();
    if (!Object.keys(bundles).length) {
      setStatus("当前没有可提交的修改。", true);
      return;
    }
    const summaryEl = document.getElementById("proposal-summary");
    const summaryUser = summaryEl && summaryEl.value ? summaryEl.value.trim() : "";
    const summaryAuto = buildAutoChangeSummary(bundles);
    const summaryMerged = mergeChangeSummaries(summaryUser, summaryAuto);
    const body = buildIssueBody(bundles, summaryMerged);
    const issueTitle = buildProposeIssueTitle(bundles, summaryUser);
    try {
      await navigator.clipboard.writeText(body);
    } catch {
      setStatus("无法写入剪贴板：请改用 HTTPS 打开本页，或检查浏览器权限。", true);
      return;
    }
    const issueUrl =
      `https://github.com/${ghRepo.owner}/${ghRepo.name}/issues/new` +
      `?template=${encodeURIComponent(ISSUE_TEMPLATE)}` +
      `&title=${encodeURIComponent(issueTitle)}`;
    window.open(issueUrl, "_blank", "noopener,noreferrer");
    setStatus(
      "已复制。明细在正文「本次变更说明」与 JSON；请全文粘贴到「提案正文」。标题仅预填套餐名（可改）。"
    );
  }

  async function init() {
    setStatus("正在加载目录数据…");
    let bdoc;
    let pdoc;
    let edoc;
    try {
      const [rb, rp, re] = await Promise.all([
        fetch("data/bundles-merged.json", { cache: "no-store" }),
        fetch("data/products-merged.json", { cache: "no-store" }),
        fetch("data/extensions-merged.json", { cache: "no-store" }),
      ]);
      if (!rb.ok) throw new Error(`bundles HTTP ${rb.status}`);
      if (!rp.ok) throw new Error(`products HTTP ${rp.status}`);
      if (!re.ok) throw new Error(`extensions HTTP ${re.status}`);
      bdoc = await rb.json();
      pdoc = await rp.json();
      edoc = await re.json();
    } catch {
      setStatus(
        "加载失败：请在本目录启动静态服务，并先执行 merge 写入 catalog-site/data（需要 bundles / products / extensions 三个 merged JSON）。",
        true
      );
      return;
    }

    const items = (bdoc && bdoc.items) || [];
    baseline = {};
    drafts = {};
    draftMeta = {};
    for (const it of items) {
      if (!it || !it.name) continue;
      const dn = it.display_name || {};
      baseline[it.name] = {
        level: Number(it.level),
        tier: it.tier || "commercial",
        display_name: normalizeDisplay(dn),
        products: sortStrList(Array.isArray(it.products) ? it.products.slice() : []),
        extensions: sortStrList(Array.isArray(it.extensions) ? it.extensions.slice() : []),
      };
    }
    if (!Object.keys(baseline).length) {
      setStatus("未找到任何套餐数据（bundles-merged.json 为空）。", true);
      return;
    }

    productItems = (pdoc && pdoc.items) || [];
    extensionItems = (edoc && edoc.items) || [];

    const picker = document.getElementById("propose-picker");
    const editor = document.getElementById("propose-editor");
    if (editor) editor.hidden = true;
    if (picker) picker.hidden = false;

    renderPicker();
    setStatus("");

    const backBtn = document.getElementById("propose-back-bundle");
    if (backBtn) backBtn.addEventListener("click", backToPicker);

    const btn = document.getElementById("propose-submit");
    if (btn) btn.addEventListener("click", () => void onSubmit());
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else void init();
})();
