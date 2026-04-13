/**
 * 从 data/*.json 加载合并结果；支持全文过滤与中英文界面切换（单语种展示，避免混排）。
 */
(function () {
  const LOCALE_KEY = "catalog-locale";
  /** 本地预览或未写入 meta 时，Issue 指向的 license-bundles 仓库 */
  const DEFAULT_LICENSE_ISSUE_REPO = "smartcat999/license-bundles";
  /** 与 .github/ISSUE_TEMPLATE/ 下文件名一致；URL 仅传模板名，正文走剪贴板 */
  const LICENSE_ISSUE_TEMPLATE_FILE = "catalog-feedback.yml";
  /** 与 index.html、h1、GitHub Issue 模板说明一致 */
  const CATALOG_SITE_TITLE_ZH = "KubeSphere 商业许可";
  const CATALOG_SITE_TITLE_EN = "KubeSphere Licenses";

  const state = {
    bundles: null,
    products: null,
    extensions: null,
    meta: null,
    locale: "zh",
    productByName: null,
    extensionByEnglishName: null,
    /** 套餐对比页：仅展示有差异的块 */
    bundleCompareDiffOnly: false,
  };

  /**
   * 搜索框：非空查询防抖（本地过滤，约 300–500ms 常见区间）；空串立即恢复全量，避免清空后仍顿半拍。
   * blur 仍会立刻 flush 未执行的防抖。
   */
  let filterInputDebounceId = null;
  const FILTER_INPUT_DEBOUNCE_MS = 450;

  function cancelFilterInputDebounce() {
    if (filterInputDebounceId != null) {
      clearTimeout(filterInputDebounceId);
      filterInputDebounceId = null;
    }
  }

  function scheduleApplyFilter() {
    const el = document.getElementById("filter");
    const q = ((el && el.value) || "").trim();
    cancelFilterInputDebounce();
    if (q === "") {
      applyFilter();
      return;
    }
    filterInputDebounceId = setTimeout(() => {
      filterInputDebounceId = null;
      applyFilter();
    }, FILTER_INPUT_DEBOUNCE_MS);
  }

  function flushApplyFilter() {
    cancelFilterInputDebounce();
    applyFilter();
  }

  function esc(s) {
    if (s == null) return "";
    const t = String(s);
    return t
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function t(key) {
    const table = UI[state.locale] || UI.zh;
    return table[key] != null ? table[key] : key;
  }

  const UI = {
    zh: {
      docTitle: CATALOG_SITE_TITLE_ZH,
      pageHeading: CATALOG_SITE_TITLE_ZH,
      searchPlaceholder: "检索套餐、产品或扩展…",
      tabBundles: "套餐",
      tabProducts: "产品",
      tabExtensions: "扩展",
      localeGroupAria: "界面语言",
      localeSwitchToEnAria: "当前为中文，点按切换为英文",
      localeSwitchToZhAria: "当前为英文，点按切换为中文",
      thId: "id",
      thName: "名称",
      thResource: "资源与特性",
      thExtVersion: "版本",
      thExtEnv: "环境要求",
      thExtCategory: "分类",
      thExtGithub: "GitHub",
      extGithubHint: "在 GitHub 打开仓库：查看源码、提交 Issue 或 Pull Request",
      extListKubeAbbr: "Kubernetes",
      extListKsAbbr: "KubeSphere",
      emptyNone: "无",
      sectionBundleProducts: "包含产品",
      sectionBundleExtensions: "包含扩展",
      sectionProductExtensions: "包含扩展",
      bundleMetaTitle: "套餐配额与特性",
      bundleLimits: "套餐级配额",
      bundleGates: "套餐级特性",
      foldResource: "资源限制",
      foldFeature: "功能特性",
      bundleViewDetail: "查看详情",
      bundleBackList: "← 返回套餐列表",
      bundleNotFound: "未找到该套餐。",
      bundleCompareTitle: "套餐对比",
      bundleCompareBreadcrumb: "对比",
      bundleCompareOpen: "对比",
      bundleCompareOpenAria: "与另一套餐对比，选择要并列查看的档位",
      bundleCompareDrawerTitle: "选择要对比的套餐",
      bundleCompareDrawerHint: "以下为同一数据快照中的其它档位，与当前套餐并列展示差异。",
      bundleCompareDrawerFilterPlaceholder: "按名称筛选…",
      bundleCompareDrawerEmpty: "没有匹配的套餐",
      bundleCompareCloseAria: "关闭",
      bundleCompareSoloHint: "当前数据仅包含一档套餐，无法对比。",
      bundleCompareSwapSides: "交换左右套餐",
      bundleCompareColumnLeft: "左侧",
      bundleCompareColumnRight: "右侧",
      bundleCompareNotBoth: "无法对比：至少一档套餐未找到。",
      bundleCompareRepickLeft: "更换左侧",
      bundleCompareRepickRight: "更换右侧",
      bundleCompareDrawerRepickLeft: "选择左侧套餐",
      bundleCompareDrawerRepickRight: "选择右侧套餐",
      bundleCompareDiffOnly: "仅差异",
      bundleCompareShowAll: "显示全部",
      bundleCompareTitleSwitchAria: "点击档位名称更换该侧对比套餐；中间为左右交换",
      bundleCompareMergedColLabel: "项目",
      bundleCompareExclusiveSideHero: "相比对侧无多出项",
      bundleCompareExclusivePanelEmpty: "无仅本侧条目",
      productViewDetail: "查看详情",
      productBackList: "← 返回产品列表",
      productNotFound: "未找到该产品。",
      extensionViewDetail: "查看详情",
      extensionBackList: "← 返回扩展列表",
      extensionNotFound: "未找到该扩展。",
      extSectionArch: "技术架构",
      extSectionSupport: "技术支持",
      extSupportYes: "提供技术支持",
      extSupportNo: "不提供技术支持",
      extDetailMeta: "许可与能力",
      extSectionFacts: "版本与兼容性",
      extSectionDescription: "说明",
      extSectionMaintainers: "维护者",
      extSectionProvider: "提供商",
      extGroupUncategorized: "未分类",
      extContactEmail: "邮箱",
      extContactWebsite: "网站",
      extLinkHome: "主页",
      extLinkDocs: "文档",
      extLinkRepo: "GitHub",
      extFactVersion: "Chart 版本",
      extFactKube: "Kubernetes",
      extFactKs: "KubeSphere",
      extFactCategory: "分类",
      extFactInstallMode: "安装模式",
      extFactKeywords: "关键词",
      catalogIssueLink: "内容有误？",
      catalogIssueHint:
        "打开 GitHub 反馈表单，并把当前页面信息复制到剪贴板；请粘贴到表单中的「背景信息」，再填写「问题描述」等字段。（站点：" +
        CATALOG_SITE_TITLE_ZH +
        "）",
      catalogIssueAria:
        "反馈「" +
        CATALOG_SITE_TITLE_ZH +
        "」本页问题：复制页面信息到剪贴板并打开 GitHub，请粘贴到「背景信息」后再填写其余字段",
      toolbarProposeLink: "套餐修订",
      toolbarProposeHint:
        "在独立页面编辑套餐展示名与扩展（至少选一项）；若套餐已有产品数据则可调整产品；新增套餐不含产品编辑。生成可提交到 GitHub 的提案正文",
      toolbarProposeAria: "打开套餐修订页面，用于生成 GitHub Issue 提案",
      catalogIssueCopiedA11y:
        "已复制页面信息到剪贴板，正在打开 GitHub；请粘贴到「背景信息」后再填写下方字段",
      breadcrumbAria: "面包屑",
      siteMetaFooterAria: "目录数据版本信息",
      metaDataUpdatedLabel: "数据更新",
      metaCommitPrefix: "提交",
      metaCommitAria: "在 GitHub 查看提交",
      metaCommitGithubHint: "在 GitHub 查看提交 %s",
      metaLoadedFallback: "已加载",
      metaLoadFailed: "加载失败",
      filterEmptyTitle: "暂无匹配结果",
      filterEmptyHint: "可调整检索词，或清空检索框查看全部方案与扩展。",
      catalogLoadingAria: "正在加载目录数据",
      searchAriaLabel: "按套餐、产品或扩展名称筛选当前视图",
    },
    en: {
      docTitle: CATALOG_SITE_TITLE_EN,
      pageHeading: CATALOG_SITE_TITLE_EN,
      searchPlaceholder: "Search bundles, products, or extensions…",
      tabBundles: "Bundles",
      tabProducts: "Products",
      tabExtensions: "Extensions",
      localeGroupAria: "Interface language",
      localeSwitchToEnAria: "Chinese UI, tap to switch to English",
      localeSwitchToZhAria: "English UI, tap to switch to Chinese",
      thId: "id",
      thName: "Name",
      thResource: "Limits & features",
      thExtVersion: "Version",
      thExtEnv: "Requirements",
      thExtCategory: "Category",
      thExtGithub: "GitHub",
      extGithubHint:
        "Open the GitHub repository: source code, issues, and pull requests",
      extListKubeAbbr: "Kubernetes",
      extListKsAbbr: "KubeSphere",
      emptyNone: "None",
      sectionBundleProducts: "Products",
      sectionBundleExtensions: "Extensions",
      sectionProductExtensions: "Extensions",
      bundleMetaTitle: "Bundle quotas & features",
      bundleLimits: "Bundle quotas",
      bundleGates: "Bundle features",
      foldResource: "Resource limits",
      foldFeature: "Feature gates",
      bundleViewDetail: "View details",
      bundleBackList: "← Back to bundles",
      bundleNotFound: "Bundle not found.",
      bundleCompareTitle: "Compare bundles",
      bundleCompareBreadcrumb: "Compare",
      bundleCompareOpen: "Compare",
      bundleCompareOpenAria: "Compare this bundle side by side with another tier",
      bundleCompareDrawerTitle: "Choose a bundle to compare",
      bundleCompareDrawerHint: "Other tiers from the same merged snapshot are listed below.",
      bundleCompareDrawerFilterPlaceholder: "Filter by name…",
      bundleCompareDrawerEmpty: "No matching bundles",
      bundleCompareCloseAria: "Close",
      bundleCompareSoloHint: "Only one bundle exists in this snapshot; nothing to compare.",
      bundleCompareSwapSides: "Swap sides",
      bundleCompareColumnLeft: "Left",
      bundleCompareColumnRight: "Right",
      bundleCompareNotBoth: "Cannot compare: one or both bundles were not found.",
      bundleCompareRepickLeft: "Change left",
      bundleCompareRepickRight: "Change right",
      bundleCompareDrawerRepickLeft: "Choose left bundle",
      bundleCompareDrawerRepickRight: "Choose right bundle",
      bundleCompareDiffOnly: "Diff only",
      bundleCompareShowAll: "Show all",
      bundleCompareTitleSwitchAria: "Click a tier name to change that side; center swaps left and right",
      bundleCompareMergedColLabel: "Item",
      bundleCompareExclusiveSideHero: "Nothing beyond the other bundle",
      bundleCompareExclusivePanelEmpty: "No items only on this side",
      productViewDetail: "View details",
      productBackList: "← Back to products",
      productNotFound: "Product not found.",
      extensionViewDetail: "View details",
      extensionBackList: "← Back to extensions",
      extensionNotFound: "Extension not found.",
      extSectionArch: "Architecture",
      extSectionSupport: "Support",
      extSupportYes: "Support available",
      extSupportNo: "No dedicated support",
      extDetailMeta: "License & capabilities",
      extSectionFacts: "Version & compatibility",
      extSectionDescription: "Description",
      extSectionMaintainers: "Maintainers",
      extSectionProvider: "Provider",
      extGroupUncategorized: "Uncategorized",
      extContactEmail: "Email",
      extContactWebsite: "Website",
      extLinkHome: "Home",
      extLinkDocs: "Documentation",
      extLinkRepo: "GitHub",
      extFactVersion: "Chart version",
      extFactKube: "Kubernetes",
      extFactKs: "KubeSphere",
      extFactCategory: "Category",
      extFactInstallMode: "Installation mode",
      extFactKeywords: "Keywords",
      catalogIssueLink: "Report issue",
      toolbarProposeLink: "Edit bundles",
      toolbarProposeHint:
        "Open a separate page to edit bundle display names and extensions (at least one required); products appear only when the bundle already lists them; new bundles have no product editor. Copy the proposal text for GitHub",
      toolbarProposeAria: "Open the bundle proposal page to generate a GitHub Issue body",
      catalogIssueHint:
        "Opens the GitHub issue form and copies page context to your clipboard. Paste into the 背景信息 field first, then complete 问题描述 and the rest. (Site: " +
        CATALOG_SITE_TITLE_EN +
        ")",
      catalogIssueAria:
        "Report a problem on this " +
        CATALOG_SITE_TITLE_EN +
        " page: copies context to the clipboard and opens GitHub—paste into 背景信息 first, then fill the rest of the form",
      catalogIssueCopiedA11y:
        "Copied page context to clipboard; opening GitHub—paste into 背景信息 before completing the fields below",
      breadcrumbAria: "Breadcrumb",
      siteMetaFooterAria: "Catalog data revision",
      metaDataUpdatedLabel: "Updated",
      metaCommitPrefix: "Commit",
      metaCommitAria: "View commit on GitHub",
      metaCommitGithubHint: "View this commit on GitHub (%s)",
      metaLoadedFallback: "Loaded",
      metaLoadFailed: "Load failed",
      filterEmptyTitle: "No matches",
      filterEmptyHint: "Try another term, or clear search to show all bundles, products, and extensions.",
      catalogLoadingAria: "Loading catalog data",
      searchAriaLabel: "Filter the current view by bundle, product, or extension name",
    },
  };

  /** 中文界面：优先中文展示名，否则英文展示名，否则 slug */
  function pickZhDisplay(d, slug) {
    if (d && typeof d === "object") {
      const s = d.zh || d.en || "";
      if (s) return s;
    }
    return slug || "";
  }

  /** 英文界面：优先英文展示名，否则中文，否则 slug */
  function pickEnDisplay(d, slug) {
    if (d && typeof d === "object") {
      const s = d.en || d.zh || "";
      if (s) return s;
    }
    return slug || "";
  }

  function extensionDisplayTitle(row, loc) {
    const dn = row.display_name;
    if (loc === "zh") {
      return pickZhDisplay(dn, row.chineseName || row.englishName || "");
    }
    return pickEnDisplay(dn, row.englishName || "");
  }

  /** 资源限制 / 特性 scope 展示（数据里多为 global、workspace、cluster、namespace） */
  const SCOPE_I18N = {
    zh: {
      global: "平台",
      cluster: "集群",
      workspace: "企业空间",
      namespace: "项目",
    },
    en: {
      global: "Global",
      cluster: "Cluster",
      workspace: "Workspace",
      namespace: "Namespace",
    },
  };

  function scopeDisplayLabel(raw, loc) {
    const k = String(raw || "").trim().toLowerCase();
    if (!k) return "";
    const table = SCOPE_I18N[loc] || SCOPE_I18N.zh;
    return table[k] || String(raw).trim();
  }

  /**
   * 与 ksbuilder `cmd/create.go` 中 `Categories` 一致：`extension.yaml` 的 `category` 存 NormalizedName（slug）。
   * 列表/详情展示名随界面语言切换；未知 slug 仍原样显示。
   */
  const EXTENSION_CATEGORY_BUILTIN = [
    { slug: "ai-machine-learning", zh: "AI / 大模型与机器学习", en: "AI / LLM" },
    { slug: "deepseek", zh: "DeepSeek", en: "DeepSeek" },
    { slug: "database", zh: "数据库", en: "Database" },
    { slug: "observability", zh: "可观测性", en: "Observability" },
    { slug: "integration-delivery", zh: "持续集成与交付", en: "CI / CD" },
    { slug: "networking", zh: "网络", en: "Networking" },
    { slug: "security", zh: "安全", en: "Security" },
    { slug: "storage", zh: "存储", en: "Storage" },
    { slug: "streaming-messaging", zh: "流处理与消息", en: "Streaming and messaging" },
    { slug: "computing", zh: "计算", en: "Computing" },
    { slug: "dev-tools", zh: "开发工具", en: "DevTools" },
  ];

  const EXTENSION_CATEGORY_BY_SLUG = new Map(
    EXTENSION_CATEGORY_BUILTIN.map((c) => [c.slug, c])
  );

  function extensionCategorySlug(row) {
    return String((row && row.category) || "")
      .trim()
      .toLowerCase();
  }

  function extensionCategoryDisplayLabel(row, loc) {
    const slug = extensionCategorySlug(row);
    if (!slug) return "";
    const rec = EXTENSION_CATEGORY_BY_SLUG.get(slug);
    if (rec) return loc === "en" ? rec.en : rec.zh;
    return String(row.category).trim();
  }

  /** 详情与套餐 meta 列表：平台 → 企业空间 → 集群 → 项目；无/未知 scope 排在已知之后 */
  const SCOPE_DETAIL_ORDER = ["global", "workspace", "cluster", "namespace"];

  function scopeDetailSortKey(raw) {
    const k = String(raw || "").trim().toLowerCase();
    const i = SCOPE_DETAIL_ORDER.indexOf(k);
    return i >= 0 ? i : SCOPE_DETAIL_ORDER.length;
  }

  function limitItemSortLabel(it) {
    return String((it && (it.display_name || it.name)) || "")
      .trim()
      .toLowerCase();
  }

  function sortLimitsByScopeDetail(arr) {
    if (!Array.isArray(arr) || arr.length < 2) return arr || [];
    return [...arr].sort((a, b) => {
      const da = scopeDetailSortKey(a && a.scope);
      const db = scopeDetailSortKey(b && b.scope);
      if (da !== db) return da - db;
      return limitItemSortLabel(a).localeCompare(limitItemSortLabel(b), undefined, {
        sensitivity: "base",
      });
    });
  }

  /** 套餐标题：中文 = 展示名；英文 = 数据里的 name（如 professional） */
  function bundleCardTitle(row, loc) {
    if (loc === "zh") return pickZhDisplay(row.display_name, row.name);
    return row.name || "";
  }

  /** 产品标题：中文 = 展示名；英文 = 数据里的 name（如 ks-core） */
  function productCardTitle(row, loc) {
    if (loc === "zh") return pickZhDisplay(row.display_name, row.name);
    return row.name || "";
  }

  function productTagLabel(slug, locale) {
    const p = state.productByName && state.productByName.get(slug);
    if (!p) return slug;
    if (locale === "en") return p.name;
    return pickZhDisplay(p.display_name, p.name);
  }

  function extensionTagLabel(slug, locale) {
    const e = state.extensionByEnglishName && state.extensionByEnglishName.get(slug);
    if (!e) return slug;
    return extensionDisplayTitle(e, locale) || e.englishName || slug;
  }

  /** 顶栏搜索：仅匹配套餐/产品/扩展各自的名称类字段（不含配额、分类、描述等） */
  function bundleListSearchHaystack(row) {
    const d = row.display_name;
    return [row.name, d && d.zh, d && d.en].filter(Boolean).join(" ").toLowerCase();
  }

  function productListSearchHaystack(row) {
    const d = row.display_name;
    return [row.name, d && d.zh, d && d.en].filter(Boolean).join(" ").toLowerCase();
  }

  function extensionListSearchHaystack(row) {
    const bits = [];
    if (row.id != null && String(row.id).trim() !== "") bits.push(String(row.id));
    if (row.englishName) bits.push(String(row.englishName));
    if (row.chineseName) bits.push(String(row.chineseName));
    const d = row.display_name;
    if (d && typeof d === "object") {
      if (d.zh) bits.push(String(d.zh));
      if (d.en) bits.push(String(d.en));
    }
    return bits.join(" ").toLowerCase();
  }

  function tagsHtmlSlugs(slugs, kind, opts) {
    opts = opts || {};
    const asLinks = !!opts.asLinks;
    const tagExtra = opts.tagClassExtra ? String(opts.tagClassExtra).trim() : "";
    const extraCls = tagExtra ? " " + tagExtra : "";
    if (!slugs || !slugs.length) {
      return `<p class="empty-hint">${esc(t("emptyNone"))}</p>`;
    }
    const loc = state.locale;
    const parts = slugs.map((slug) => {
      const label =
        kind === "product" ? productTagLabel(slug, loc) : extensionTagLabel(slug, loc);
      const ref =
        kind === "product"
          ? slug
          : state.extensionByEnglishName?.get(slug)?.englishName || slug;
      const isSlugStyle = loc === "en" || label === ref;
      const cls = (isSlugStyle ? "tag tag--key" : "tag") + extraCls;
      const inner = `<span class="tag__text">${esc(label)}</span>`;
      if (asLinks) {
        const href =
          kind === "product"
            ? "#/product/" + encodeURIComponent(slug)
            : "#/extension/" + encodeURIComponent(slug);
        return `<a href="${href}" class="${cls} tag--link">${inner}</a>`;
      }
      return `<span class="${cls}">${inner}</span>`;
    });
    return `<div class="tag-flow">${parts.join("")}</div>`;
  }

  function extensionRowForCatalogSlug(slug) {
    return state.extensionByEnglishName && state.extensionByEnglishName.get(slug);
  }

  function extensionSlugSortKey(slug, loc) {
    const row = extensionRowForCatalogSlug(slug);
    const s = row
      ? extensionDisplayTitle(row, loc) || row.englishName || slug
      : String(slug);
    return String(s).trim().toLowerCase();
  }

  function extensionGroupLabelForKey(catKey, sampleSlug, loc) {
    const row = extensionRowForCatalogSlug(sampleSlug);
    if (!row) return catKey || t("extGroupUncategorized");
    if (!catKey || catKey === "__none__") return t("extGroupUncategorized");
    return extensionCategoryDisplayLabel(row, loc) || String(row.category || catKey).trim();
  }

  /**
   * 套餐/产品详情：按扩展 category 分组；顺序与 EXTENSION_CATEGORY_BUILTIN 一致，未知分类按展示名排序，无分类最后。
   */
  function groupExtensionSlugsByCategory(slugs) {
    const loc = state.locale;
    const byCat = new Map();
    const seen = new Set();
    for (const slug of slugs || []) {
      if (slug == null || seen.has(slug)) continue;
      seen.add(slug);
      const row = extensionRowForCatalogSlug(slug);
      const raw = row ? extensionCategorySlug(row) : "";
      const k = raw || "__none__";
      if (!byCat.has(k)) byCat.set(k, []);
      byCat.get(k).push(slug);
    }
    for (const arr of byCat.values()) {
      arr.sort((a, b) =>
        extensionSlugSortKey(a, loc).localeCompare(extensionSlugSortKey(b, loc), undefined, {
          sensitivity: "base",
        })
      );
    }
    const groups = [];
    const consumed = new Set();
    for (const c of EXTENSION_CATEGORY_BUILTIN) {
      if (byCat.has(c.slug)) {
        groups.push({
          key: c.slug,
          label: loc === "en" ? c.en : c.zh,
          slugs: byCat.get(c.slug),
        });
        consumed.add(c.slug);
      }
    }
    const restKeys = [...byCat.keys()].filter((k) => !consumed.has(k) && k !== "__none__");
    restKeys.sort((a, b) => {
      const la = extensionGroupLabelForKey(a, byCat.get(a)[0], loc);
      const lb = extensionGroupLabelForKey(b, byCat.get(b)[0], loc);
      return la.localeCompare(lb, undefined, { sensitivity: "base" });
    });
    for (const k of restKeys) {
      groups.push({
        key: k,
        label: extensionGroupLabelForKey(k, byCat.get(k)[0], loc),
        slugs: byCat.get(k),
      });
      consumed.add(k);
    }
    if (byCat.has("__none__")) {
      groups.push({
        key: "__none__",
        label: t("extGroupUncategorized"),
        slugs: byCat.get("__none__"),
      });
    }
    return groups;
  }

  /** 套餐/产品详情内扩展列表：按分类分组 + 组内 pill 链接（与 tagsHtmlSlugs 扩展分支一致） */
  function tagsHtmlExtensionSlugsGrouped(slugs) {
    const loc = state.locale;
    if (!slugs || !slugs.length) {
      return `<p class="empty-hint">${esc(t("emptyNone"))}</p>`;
    }
    const groups = groupExtensionSlugsByCategory(slugs);
    const blocks = groups.map((g, i) => {
      const hid = `ext-gr-${i}`;
      const inner = g.slugs
        .map((slug) => {
          const label = extensionTagLabel(slug, loc);
          const ref = state.extensionByEnglishName?.get(slug)?.englishName || slug;
          const isSlugStyle = loc === "en" || label === ref;
          const cls = isSlugStyle ? "tag tag--key" : "tag";
          const innerSpan = `<span class="tag__text">${esc(label)}</span>`;
          const href = "#/extension/" + encodeURIComponent(slug);
          return `<a href="${href}" class="${cls} tag--link">${innerSpan}</a>`;
        })
        .join("");
      const countMark =
        g.slugs.length > 1
          ? ` <span class="bundle-ext-group__count" aria-hidden="true">(${g.slugs.length})</span>`
          : "";
      return `<section class="bundle-ext-group" aria-labelledby="${esc(hid)}"><h4 class="bundle-ext-group__h" id="${esc(hid)}">${esc(g.label)}${countMark}</h4><div class="tag-flow">${inner}</div></section>`;
    });
    return `<div class="bundle-ext-groups">${blocks.join("")}</div>`;
  }

  function limitLine(it) {
    const label = it.display_name || it.name || "";
    const loc = state.locale;
    const scopeRaw = it.scope;
    const scopeShown = scopeRaw ? scopeDisplayLabel(scopeRaw, loc) : "";
    const scope = scopeShown
      ? `<span class="meta-scope">${esc(scopeShown)}</span>`
      : "";
    return `<div class="meta-line"><span class="meta-title">${esc(label)}</span>${scope}</div>`;
  }

  function limitsBlockHtml(arr, title) {
    if (!arr || !arr.length) return "";
    const ordered = sortLimitsByScopeDetail(arr);
    const body = ordered.map((it) => limitLine(it)).join("");
    return `<div class="meta-block"><div class="meta-block__title">${esc(title)}</div>${body}</div>`;
  }

  function bundleMetaHtml(rl, fg) {
    const hasRl = Array.isArray(rl) && rl.length > 0;
    const hasFg = Array.isArray(fg) && fg.length > 0;
    if (!hasRl && !hasFg) {
      return "";
    }
    const inner = [
      limitsBlockHtml(rl, t("bundleLimits")),
      limitsBlockHtml(fg, t("bundleGates")),
    ]
      .filter(Boolean)
      .join("");
    return `<div class="card-section card-section--meta"><h3 class="card-label">${esc(t("bundleMetaTitle"))}</h3>${inner}</div>`;
  }

  /** 两侧都包含的 slug（用于「仅差异」时只展示本侧多出项） */
  function slugIntersectionSet(a, b) {
    const B = new Set((b || []).filter(Boolean));
    return new Set((a || []).filter((s) => s && B.has(s)));
  }

  function slugSetsEqual(a, b) {
    const sa = [...new Set((a || []).filter(Boolean))].sort().join("\0");
    const sb = [...new Set((b || []).filter(Boolean))].sort().join("\0");
    return sa === sb;
  }

  function sameLimitsArrays(a, b) {
    return (
      JSON.stringify(sortLimitsByScopeDetail(a || [])) ===
      JSON.stringify(sortLimitsByScopeDetail(b || []))
    );
  }

  /** 合并对照表：按展示名 + scope 对齐行 */
  function limitItemKey(it) {
    const n = String((it && (it.display_name || it.name)) || "")
      .trim()
      .toLowerCase();
    const s = String((it && it.scope) || "")
      .trim()
      .toLowerCase();
    return `${n}\0${s}`;
  }

  function mergeLimitRowList(arrA, arrB) {
    const mapA = new Map();
    for (const it of arrA || []) mapA.set(limitItemKey(it), it);
    const mapB = new Map();
    for (const it of arrB || []) mapB.set(limitItemKey(it), it);
    const keys = [...new Set([...mapA.keys(), ...mapB.keys()])].sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" })
    );
    return keys.map((k) => ({ key: k, a: mapA.get(k), b: mapB.get(k) }));
  }

  function limitCellCompareHtml(it, loc) {
    if (!it) return `<span class="empty-hint">—</span>`;
    return limitLine(it);
  }

  function limitRowLabelCell(a, b, loc) {
    const it = a || b;
    const lab = String((it && (it.display_name || it.name)) || "").trim();
    const scRaw = it && it.scope;
    const sc = scRaw ? scopeDisplayLabel(scRaw, loc) : "";
    const scopeHtml = sc ? ` <span class="mono-muted">· ${esc(sc)}</span>` : "";
    return `<td class="bundle-compare-limits__k"><span class="bundle-compare-limits__label">${esc(lab)}</span>${scopeHtml}</td>`;
  }

  /** 用于合并表「两侧是否一致」：键序无关的稳定序列化 */
  function jsonCanonicalForCompare(obj) {
    if (obj == null) return "null";
    if (Array.isArray(obj)) return `[${obj.map(jsonCanonicalForCompare).join(",")}]`;
    if (typeof obj !== "object") return JSON.stringify(obj);
    const keys = Object.keys(obj).sort();
    return `{${keys.map((k) => JSON.stringify(k) + ":" + jsonCanonicalForCompare(obj[k])).join(",")}}`;
  }

  function limitItemsEqual(a, b) {
    if (!a && !b) return true;
    if (!a || !b) return false;
    return jsonCanonicalForCompare(a) === jsonCanonicalForCompare(b);
  }

  function bundleCompareMergedLimitsTableHtml(rows, loc, colLeft, colRight) {
    if (!rows.length) return "";
    const head = `<thead><tr><th scope="col">${esc(t("bundleCompareMergedColLabel"))}</th><th scope="col">${esc(colLeft)}</th><th scope="col">${esc(colRight)}</th></tr></thead>`;
    const body = rows
      .map((r) => {
        const rowSame = limitItemsEqual(r.a, r.b);
        const trClassAttr = rowSame ? ` class="bundle-compare-limit-row--same"` : "";
        return `<tr${trClassAttr}>${limitRowLabelCell(r.a, r.b, loc)}<td class="bundle-compare-limits__cell">${limitCellCompareHtml(
          r.a,
          loc
        )}</td><td class="bundle-compare-limits__cell">${limitCellCompareHtml(r.b, loc)}</td></tr>`;
      })
      .join("");
    return `<table class="bundle-compare-limits">${head}<tbody>${body}</tbody></table>`;
  }

  function bundleCompareMergedLimitsHtml(rowA, rowB, loc, opts) {
    opts = opts || {};
    const sameMetaBlock = !!opts.sameMeta;
    const hasRl =
      (Array.isArray(rowA.resource_limit) && rowA.resource_limit.length > 0) ||
      (Array.isArray(rowB.resource_limit) && rowB.resource_limit.length > 0);
    const hasFg =
      (Array.isArray(rowA.feature_gates) && rowA.feature_gates.length > 0) ||
      (Array.isArray(rowB.feature_gates) && rowB.feature_gates.length > 0);
    if (!hasRl && !hasFg) return "";
    const titleA = bundleCardTitle(rowA, loc);
    const titleB = bundleCardTitle(rowB, loc);
    const blocks = [];
    if (hasRl) {
      const rlRows = mergeLimitRowList(rowA.resource_limit, rowB.resource_limit);
      const rlAllSame = rlRows.length > 0 && rlRows.every((r) => limitItemsEqual(r.a, r.b));
      const rlBlk = rlAllSame ? "bundle-compare-merged__block bundle-compare-block bundle-compare-block--same" : "bundle-compare-merged__block";
      blocks.push(
        `<div class="${rlBlk}" data-compare-block="merged-rl"><h4 class="bundle-compare-merged__subh">${esc(t("bundleLimits"))}</h4>${bundleCompareMergedLimitsTableHtml(
          rlRows,
          loc,
          titleA,
          titleB
        )}</div>`
      );
    }
    if (hasFg) {
      const fgRows = mergeLimitRowList(rowA.feature_gates, rowB.feature_gates);
      const fgAllSame = fgRows.length > 0 && fgRows.every((r) => limitItemsEqual(r.a, r.b));
      const fgBlk = fgAllSame ? "bundle-compare-merged__block bundle-compare-block bundle-compare-block--same" : "bundle-compare-merged__block";
      blocks.push(
        `<div class="${fgBlk}" data-compare-block="merged-fg"><h4 class="bundle-compare-merged__subh">${esc(t("bundleGates"))}</h4>${bundleCompareMergedLimitsTableHtml(
          fgRows,
          loc,
          titleA,
          titleB
        )}</div>`
      );
    }
    if (!blocks.length) return "";
    const sameCls = sameMetaBlock ? " bundle-compare-block bundle-compare-block--same" : "";
    return `<section class="bundle-detail-panel bundle-compare-merged${sameCls}" aria-labelledby="bc-merged-h" data-compare-block="merged-limits">
      <h3 id="bc-merged-h" class="bundle-detail-panel__h">${esc(t("bundleMetaTitle"))}</h3>
      ${blocks.join("")}
    </section>`;
  }

  /** 套餐详情单列：英雄区 + 产品/扩展面板 + 配额 meta；suffix 用于对比页 id 去重（传 "" 为 bd-prod-h / bd-ext-h） */
  function bundleDetailColumnBlock(row, loc, suffix, opts) {
    opts = opts || {};
    const compareLaunch = opts.compareLaunchHtml || "";
    const wrapDiff = !!(opts && opts.compareBlockSame);
    const f = opts.compareBlockSame;
    const sameProducts = !!(f && f.products);
    const sameExts = !!(f && f.extensions);
    const sameMeta = !!(f && f.meta);
    const peer = opts.comparePeerRow || null;
    const diffExclusive = !!(peer && state.bundleCompareDiffOnly);
    const commonProds = peer ? slugIntersectionSet(row.products, peer.products) : new Set();
    const commonExts = peer ? slugIntersectionSet(row.extensions, peer.extensions) : new Set();
    const s = suffix ? "-" + suffix : "";
    const prodId = `bd-prod-h${s}`;
    const extId = `bd-ext-h${s}`;
    const prods = row.products || [];
    const exts = row.extensions || [];
    const prodsDisplay = diffExclusive ? prods.filter((slug) => slug && !commonProds.has(slug)) : prods;
    const extsDisplay = diffExclusive ? exts.filter((slug) => slug && !commonExts.has(slug)) : exts;
    let metaHtml = opts.suppressMeta ? "" : bundleMetaHtml(row.resource_limit, row.feature_gates);
    const title = bundleCardTitle(row, loc);
    const stats =
      diffExclusive && prodsDisplay.length === 0 && extsDisplay.length === 0
        ? t("bundleCompareExclusiveSideHero")
        : diffExclusive
          ? bundleStatsLine(prodsDisplay.length, extsDisplay.length)
          : bundleStatsLine(prods.length, exts.length);
    const titleTip = opts.fullTitleForHero ? ` title="${esc(title)}"` : "";
    const prodEmptyBody = `<p class="empty-hint">${esc(t("bundleCompareExclusivePanelEmpty"))}</p>`;
    const prodBody =
      prods.length > 0
        ? prodsDisplay.length > 0
          ? tagsHtmlSlugs(prodsDisplay, "product", { asLinks: true })
          : prodEmptyBody
        : "";
    let prodSection =
      prods.length > 0
        ? `<section class="bundle-detail-panel" aria-labelledby="${esc(prodId)}">
            <h3 id="${esc(prodId)}" class="bundle-detail-panel__h">${esc(t("sectionBundleProducts"))} <span class="card-count">${diffExclusive ? prodsDisplay.length : prods.length}</span></h3>
            <div class="bundle-detail-panel__body">${prodBody}</div>
          </section>`
        : "";
    if (wrapDiff && prodSection) {
      prodSection = `<div class="bundle-compare-block${sameProducts ? " bundle-compare-block--same" : ""}" data-compare-block="products">${prodSection}</div>`;
    }
    const extPanelClass =
      prods.length > 0
        ? "bundle-detail-panel"
        : "bundle-detail-panel bundle-detail-panel--full";
    const extBody =
      exts.length > 0
        ? extsDisplay.length > 0
          ? tagsHtmlExtensionSlugsGrouped(extsDisplay)
          : prodEmptyBody
        : tagsHtmlExtensionSlugsGrouped(extsDisplay);
    let extSection = `<section class="${extPanelClass}" aria-labelledby="${esc(extId)}">
            <h3 id="${esc(extId)}" class="bundle-detail-panel__h">${esc(t("sectionBundleExtensions"))} <span class="card-count">${diffExclusive ? extsDisplay.length : exts.length}</span></h3>
            <div class="bundle-detail-panel__body">${extBody}</div>
          </section>`;
    if (wrapDiff) {
      extSection = `<div class="bundle-compare-block${sameExts ? " bundle-compare-block--same" : ""}" data-compare-block="extensions">${extSection}</div>`;
    }
    if (wrapDiff && metaHtml) {
      metaHtml = `<div class="bundle-compare-block${sameMeta ? " bundle-compare-block--same" : ""}" data-compare-block="meta">${metaHtml}</div>`;
    }
    return `
        <header class="bundle-detail-hero">
          <div class="bundle-detail-hero__top">
            <h2 class="bundle-detail-title"${titleTip}>${esc(title)}</h2>
            <div class="bundle-detail-hero__tail">
              ${compareLaunch}
              <span class="badge bundle-detail-badge">Lv ${esc(row.level)}</span>
            </div>
          </div>
          <p class="bundle-detail-lead">${esc(stats)}</p>
        </header>
        <div class="bundle-detail-grid">
          ${prodSection}
          ${extSection}
        </div>
        ${metaHtml}`;
  }

  function otherBundleNamesForCompare(excludeName) {
    const items = (state.bundles && state.bundles.items) || [];
    const loc = state.locale;
    return items
      .map((b) => b && b.name)
      .filter((n) => n && n !== excludeName)
      .sort((a, b) => {
        const ra = getBundleByName(a);
        const rb = getBundleByName(b);
        const ta = ra ? bundleCardTitle(ra, loc) || a : a;
        const tb = rb ? bundleCardTitle(rb, loc) || b : b;
        return ta.localeCompare(tb, undefined, { sensitivity: "base" });
      });
  }

  function bundleCompareLaunchHtml(currentName) {
    const others = otherBundleNamesForCompare(currentName);
    const disabled = others.length === 0;
    const hint = disabled ? esc(t("bundleCompareSoloHint")) : "";
    const dis = disabled ? " disabled" : "";
    const titleAttr = disabled ? ` title="${hint}"` : "";
    const aria = ` aria-label="${esc(t("bundleCompareOpenAria"))}"`;
    return `<div class="bundle-compare-launch bundle-compare-launch--inline">
      <button type="button" class="bundle-compare-launch__btn" id="bundle-compare-open-btn" data-current-bundle="${esc(currentName)}"${dis}${titleAttr}${aria}>
        ${esc(t("bundleCompareOpen"))}
      </button>
    </div>`;
  }

  /** @type {null | { mode: "pair"; anchor: string } | { mode: "repick"; partner: string; side: "l" | "r" }} */
  let bundleComparePickContext = null;

  function restoreFocusAfterBundleDrawerClose() {
    const r = parseRoute();
    if (r.type === "bundle-compare") {
      const el =
        document.getElementById("bundle-compare-diff-toggle") ||
        document.getElementById("bundle-compare-tab-a");
      if (el) el.focus();
      return;
    }
    const openBtn = document.getElementById("bundle-compare-open-btn");
    if (openBtn) openBtn.focus();
  }

  function closeBundleComparePicker() {
    const drawer = document.getElementById("bundle-compare-drawer");
    if (!drawer) return;
    const wasOpen = !drawer.hidden;
    drawer.hidden = true;
    drawer.setAttribute("aria-hidden", "true");
    document.body.classList.remove("bundle-compare-drawer-open");
    bundleComparePickContext = null;
    const fil = document.getElementById("bundle-compare-drawer-filter");
    if (fil) fil.value = "";
    if (wasOpen) {
      setTimeout(() => restoreFocusAfterBundleDrawerClose(), 0);
    }
  }

  function filterBundleCompareDrawerList() {
    const fil = document.getElementById("bundle-compare-drawer-filter");
    const list = document.getElementById("bundle-compare-drawer-list");
    const emptyEl = document.getElementById("bundle-compare-drawer-empty");
    if (!fil || !list) return;
    const q = (fil.value || "").trim().toLowerCase();
    const items = list.querySelectorAll("li[data-filter]");
    let vis = 0;
    items.forEach((li) => {
      const hay = (li.getAttribute("data-filter") || "").toLowerCase();
      const ok = !q || hay.includes(q);
      li.hidden = !ok;
      if (ok) vis += 1;
    });
    if (emptyEl) {
      const hasAny = items.length > 0;
      emptyEl.hidden = !hasAny || vis > 0;
      emptyEl.textContent = t("bundleCompareDrawerEmpty");
    }
  }

  function openBundleComparePicker(ctx) {
    const drawer = document.getElementById("bundle-compare-drawer");
    if (!drawer) return;
    const context =
      typeof ctx === "string"
        ? { mode: "pair", anchor: ctx }
        : ctx && ctx.mode === "repick"
          ? { mode: "repick", partner: String(ctx.partner || ""), side: ctx.side === "r" ? "r" : "l" }
          : null;
    if (
      !context ||
      (context.mode === "pair" && !context.anchor) ||
      (context.mode === "repick" && (!context.partner || (context.side !== "l" && context.side !== "r")))
    ) {
      return;
    }
    const excludeName = context.mode === "pair" ? context.anchor : context.partner;
    const others = otherBundleNamesForCompare(excludeName);
    if (!others.length) return;
    bundleComparePickContext = context;
    const titleEl = document.getElementById("bundle-compare-drawer-title");
    const hintEl = document.getElementById("bundle-compare-drawer-hint");
    const fil = document.getElementById("bundle-compare-drawer-filter");
    const list = document.getElementById("bundle-compare-drawer-list");
    const closeBtn = document.getElementById("bundle-compare-drawer-close");
    if (titleEl) {
      titleEl.textContent =
        context.mode === "repick"
          ? context.side === "l"
            ? t("bundleCompareDrawerRepickLeft")
            : t("bundleCompareDrawerRepickRight")
          : t("bundleCompareDrawerTitle");
    }
    if (hintEl) hintEl.textContent = t("bundleCompareDrawerHint");
    if (fil) {
      fil.placeholder = t("bundleCompareDrawerFilterPlaceholder");
      fil.value = "";
    }
    if (closeBtn) closeBtn.setAttribute("aria-label", t("bundleCompareCloseAria"));
    const loc = state.locale;
    if (list) {
      const rows = others
        .map((n) => {
          const row = getBundleByName(n);
          const lab = row ? bundleCardTitle(row, loc) : n;
          const hay = row
            ? `${n} ${bundleCardTitle(row, loc)} ${bundleListSearchHaystack(row)}`.toLowerCase()
            : String(n).toLowerCase();
          return `<li class="bundle-compare-drawer__item" data-filter="${esc(hay)}"><button type="button" class="bundle-compare-drawer__pick" data-pick-bundle="${esc(n)}"><span class="bundle-compare-drawer__pick-title">${esc(lab)}</span><span class="bundle-compare-drawer__pick-meta mono-muted">${esc(n)}</span></button></li>`;
        })
        .join("");
      list.innerHTML = rows;
    }
    filterBundleCompareDrawerList();
    drawer.hidden = false;
    drawer.setAttribute("aria-hidden", "false");
    document.body.classList.add("bundle-compare-drawer-open");
    if (fil) {
      requestAnimationFrame(() => fil.focus());
    }
  }

  function renderBundleCompare(nameA, nameB) {
    const root = document.getElementById("bundle-compare-root");
    if (!root) return;
    const loc = state.locale;
    const rowA = getBundleByName(nameA);
    const rowB = getBundleByName(nameB);
    if (!rowA || !rowB) {
      root.innerHTML = `
        <div class="entity-detail bundle-detail bundle-detail--missing">
          <a href="#/bundles" class="bundle-back-btn">${esc(t("bundleBackList"))}</a>
          <p class="bundle-missing-msg">${esc(t("bundleCompareNotBoth"))}</p>
        </div>`;
      updateDetailDocTitle();
      return;
    }
    const titleA = bundleCardTitle(rowA, loc);
    const titleB = bundleCardTitle(rowB, loc);
    const sameProducts = slugSetsEqual(rowA.products, rowB.products);
    const sameExts = slugSetsEqual(rowA.extensions, rowB.extensions);
    const sameMeta =
      sameLimitsArrays(rowA.resource_limit, rowB.resource_limit) &&
      sameLimitsArrays(rowA.feature_gates, rowB.feature_gates);
    const blockFlags = { products: sameProducts, extensions: sameExts, meta: sameMeta };
    const mergedMeta = bundleCompareMergedLimitsHtml(rowA, rowB, loc, { sameMeta });
    const suppressColumnMeta = mergedMeta.length > 0;
    const diffOnly = state.bundleCompareDiffOnly;
    const pageClass =
      "entity-detail bundle-detail bundle-compare-page" +
      (diffOnly ? " bundle-compare-page--diff-only" : "");
    const repickPartnerB = esc(nameB);
    const repickPartnerA = esc(nameA);
    const dataA = esc(nameA);
    const dataB = esc(nameB);
    root.innerHTML = `
      <div class="${pageClass}" data-compare-bundle-a="${dataA}" data-compare-bundle-b="${dataB}">
        <nav class="bundle-breadcrumb" aria-label="${esc(t("breadcrumbAria"))}">
          <a href="#/bundles" class="bundle-breadcrumb__link">${esc(t("tabBundles"))}</a>
          <span class="bundle-breadcrumb__sep" aria-hidden="true">/</span>
          <span class="bundle-breadcrumb__current">${esc(t("bundleCompareBreadcrumb"))}</span>
        </nav>
        <header class="bundle-detail-hero bundle-compare-page__hero">
          <div class="bundle-detail-hero__text">
            <div class="bundle-compare-hero-row">
              <h2 class="bundle-detail-title">${esc(t("bundleCompareTitle"))}</h2>
              <button type="button" id="bundle-compare-diff-toggle" class="bundle-compare-diff-toggle" aria-pressed="${diffOnly ? "true" : "false"}">${esc(
      diffOnly ? t("bundleCompareShowAll") : t("bundleCompareDiffOnly")
    )}</button>
            </div>
            <div class="bundle-compare-title-switch">
              <div class="bundle-compare-title-switch__segments" role="toolbar" aria-label="${esc(t("bundleCompareTitleSwitchAria"))}">
                <button type="button" class="bundle-compare-title-switch__btn" id="bundle-compare-tab-a" tabindex="0" data-compare-repick-side="l" data-compare-repick-partner="${esc(nameB)}" title="${esc(titleA)}" aria-label="${esc(t("bundleCompareRepickLeft"))} · ${esc(titleA)}">
                  <span class="bundle-compare-title-switch__label">${esc(titleA)}</span>
                </button>
                <button type="button" class="bundle-compare-title-switch__swap" aria-label="${esc(t("bundleCompareSwapSides"))}" title="${esc(t("bundleCompareSwapSides"))}">
                  <svg class="bundle-compare-title-switch__swap-svg" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="miter" stroke-miterlimit="3" aria-hidden="true"><path d="M4 8L8 6M4 8L8 10M8 8H20"/><path d="M20 16L16 14M20 16L16 18M16 16H4"/></svg>
                </button>
                <button type="button" class="bundle-compare-title-switch__btn" id="bundle-compare-tab-b" tabindex="0" data-compare-repick-side="r" data-compare-repick-partner="${esc(nameA)}" title="${esc(titleB)}" aria-label="${esc(t("bundleCompareRepickRight"))} · ${esc(titleB)}">
                  <span class="bundle-compare-title-switch__label">${esc(titleB)}</span>
                </button>
              </div>
            </div>
          </div>
        </header>
        ${mergedMeta}
        <div class="bundle-compare-grid">
          <div class="bundle-compare-col" id="bundle-compare-col-a" aria-label="${esc(titleA)}">
            <div class="bundle-compare-col__cap">${esc(t("bundleCompareColumnLeft"))}</div>
            ${bundleDetailColumnBlock(rowA, loc, "a", {
              compareBlockSame: blockFlags,
              comparePeerRow: rowB,
              suppressMeta: suppressColumnMeta,
              fullTitleForHero: true,
            })}
          </div>
          <div class="bundle-compare-col" id="bundle-compare-col-b" aria-label="${esc(titleB)}">
            <div class="bundle-compare-col__cap">${esc(t("bundleCompareColumnRight"))}</div>
            ${bundleDetailColumnBlock(rowB, loc, "b", {
              compareBlockSame: blockFlags,
              comparePeerRow: rowA,
              suppressMeta: suppressColumnMeta,
              fullTitleForHero: true,
            })}
          </div>
        </div>
      </div>`;
    updateDetailDocTitle();
  }

  function formatDescriptionHtml(text) {
    if (!text) return "";
    return esc(String(text).trim()).replace(/\n/g, "<br>");
  }

  function descriptionParagraph(row, loc) {
    const d = row.description;
    if (!d || typeof d !== "object") return "";
    const raw = loc === "zh" ? d.zh || d.en : d.en || d.zh;
    if (!raw || !String(raw).trim()) return "";
    return String(raw).trim();
  }

  /** 扩展源码仓库：优先 YAML `repository` / `repo`；否则 `https://github.com/kubesphere-extensions/<englishName>` */
  function extensionRepositoryHref(row) {
    const repo = row.repository ?? row.repo;
    if (typeof repo === "string" && repo.trim()) return repo.trim();
    if (repo && typeof repo === "object") {
      const u = repo.url || repo.html_url || repo.git;
      if (u && String(u).trim()) return String(u).trim();
    }
    const slug = row.englishName;
    if (slug && String(slug).trim()) {
      return `https://github.com/kubesphere-extensions/${encodeURIComponent(String(slug).trim())}`;
    }
    return "";
  }

  function extensionLinksHtml(row) {
    const links = [];
    const repoHref = extensionRepositoryHref(row);
    const ghHint = t("extGithubHint");
    if (repoHref) {
      links.push({
        href: repoHref,
        label: t("extLinkRepo"),
        title: ghHint,
        ariaLabel: ghHint,
      });
    }
    if (row.home) links.push({ href: row.home, label: t("extLinkHome") });
    if (row.docs) links.push({ href: row.docs, label: t("extLinkDocs") });
    if (!links.length) return "";
    const inner = links
      .map((l) => {
        const titleA = l.title ? ` title="${esc(l.title)}"` : "";
        const ariaA = l.ariaLabel ? ` aria-label="${esc(l.ariaLabel)}"` : "";
        return `<a href="${esc(l.href)}"${titleA}${ariaA} rel="noopener noreferrer" target="_blank" class="ext-link-pill">${esc(l.label)}</a>`;
      })
      .join("");
    return `<div class="ext-links">${inner}</div>`;
  }

  function extensionDetailFactsHtml(row, loc) {
    const parts = [];
    if (row.version) parts.push({ label: t("extFactVersion"), value: row.version });
    if (row.kube_version) parts.push({ label: t("extFactKube"), value: row.kube_version });
    if (row.ks_version) parts.push({ label: t("extFactKs"), value: row.ks_version });
    if (extensionCategorySlug(row)) {
      parts.push({
        label: t("extFactCategory"),
        value: extensionCategoryDisplayLabel(row, loc),
      });
    }
    if (row.installation_mode) {
      parts.push({ label: t("extFactInstallMode"), value: row.installation_mode });
    }
    if (Array.isArray(row.keywords) && row.keywords.length) {
      parts.push({
        label: t("extFactKeywords"),
        value: row.keywords.join(", "),
      });
    }
    if (!parts.length) return "";
    const rows = parts
      .map(
        (p) =>
          `<div class="ext-fact"><span class="ext-fact__k">${esc(p.label)}</span><span class="ext-fact__v mono-muted">${esc(p.value)}</span></div>`
      )
      .join("");
    return `<section class="entity-detail-section entity-detail-section--ext-facts"><h3 class="entity-detail-section__h">${esc(t("extSectionFacts"))}</h3><div class="ext-fact-grid">${rows}</div></section>`;
  }

  function extensionDescriptionHtml(row, loc) {
    const para = descriptionParagraph(row, loc);
    if (!para) return "";
    return `<section class="entity-detail-section"><h3 class="entity-detail-section__h">${esc(t("extSectionDescription"))}</h3><div class="detail-prose detail-prose--multiline">${formatDescriptionHtml(para)}</div></section>`;
  }

  /** 扩展详情键值行；valueHtml 为已转义或安全拼接的 HTML */
  function extensionDetailFactRow(label, valueHtml) {
    if (!valueHtml) return "";
    return `<div class="ext-fact"><span class="ext-fact__k">${esc(label)}</span><span class="ext-fact__v mono-muted">${valueHtml}</span></div>`;
  }

  function extensionMaintainersHtml(row) {
    const ml = row.maintainers;
    if (!Array.isArray(ml) || !ml.length) return "";
    const cards = ml
      .map((m) => {
        const name = String(m.name || "").trim();
        const email = String(m.email || "").trim();
        const head = name
          ? `<div class="ext-entity-card__head">${esc(name)}</div>`
          : "";
        const rows = [];
        if (email) {
          rows.push(
            extensionDetailFactRow(
              t("extContactEmail"),
              `<a class="ext-entity-link" href="mailto:${esc(email)}">${esc(email)}</a>`
            )
          );
        }
        if (!head && !rows.length) return "";
        const grid = rows.length ? `<div class="ext-fact-grid">${rows.join("")}</div>` : "";
        return `<article class="ext-entity-card">${head}${grid}</article>`;
      })
      .filter(Boolean)
      .join("");
    if (!cards) return "";
    return `<section class="entity-detail-section entity-detail-section--ext-entities"><h3 class="entity-detail-section__h">${esc(t("extSectionMaintainers"))}</h3><div class="ext-entity-stack">${cards}</div></section>`;
  }

  function extensionProviderHtml(row, loc) {
    const prov = row.provider;
    if (!prov || typeof prov !== "object") return "";
    const block = loc === "zh" ? prov.zh || prov.en : prov.en || prov.zh;
    if (!block || typeof block !== "object") return "";
    const name = String(block.name || "").trim();
    const url = String(block.url || "").trim();
    const email = String(block.email || "").trim();
    const head = name ? `<div class="ext-entity-card__head">${esc(name)}</div>` : "";
    const rows = [];
    if (email) {
      rows.push(
        extensionDetailFactRow(
          t("extContactEmail"),
          `<a class="ext-entity-link" href="mailto:${esc(email)}">${esc(email)}</a>`
        )
      );
    }
    if (url) {
      rows.push(
        extensionDetailFactRow(
          t("extContactWebsite"),
          `<a class="ext-entity-link" href="${esc(url)}" rel="noopener noreferrer" target="_blank">${esc(url)}</a>`
        )
      );
    }
    if (!head && !rows.length) return "";
    const grid = rows.length ? `<div class="ext-fact-grid">${rows.join("")}</div>` : "";
    const inner = `<article class="ext-entity-card ext-entity-card--provider">${head}${grid}</article>`;
    return `<section class="entity-detail-section entity-detail-section--ext-entities"><h3 class="entity-detail-section__h">${esc(t("extSectionProvider"))}</h3><div class="ext-entity-stack">${inner}</div></section>`;
  }

  function extensionCatalogOverviewHtml(row, loc) {
    return [
      extensionLinksHtml(row),
      extensionDetailFactsHtml(row, loc),
      extensionDescriptionHtml(row, loc),
      extensionMaintainersHtml(row),
      extensionProviderHtml(row, loc),
    ].join("");
  }

  /** 详情页完整展示配额/特性；资源限制与功能特性宽屏并列、窄屏自动堆叠 */
  function extensionLimitsDetailHtml(rl, fg) {
    const hasRl = Array.isArray(rl) && rl.length > 0;
    const hasFg = Array.isArray(fg) && fg.length > 0;
    if (!hasRl && !hasFg) return "";
    const blocks = [
      hasRl ? limitsBlockHtml(rl, t("foldResource")) : "",
      hasFg ? limitsBlockHtml(fg, t("foldFeature")) : "",
    ].filter(Boolean);
    const inner = `<div class="limits-detail-grid">${blocks.join("")}</div>`;
    return `<div class="entity-detail-section entity-detail-section--limits"><h3 class="entity-detail-section__h">${esc(t("extDetailMeta"))}</h3>${inner}</div>`;
  }

  /**
   * 扩展 YAML 可选字段：仓库链接由 extensionRepositoryHref + 详情顶栏 pill 展示。
   * architecture | technical_architecture · support | tech_support 见下。
   */
  function formatArchitectureSection(arch) {
    if (arch == null) return "";
    const text =
      typeof arch === "string"
        ? arch
        : arch.description || arch.summary || arch.text || "";
    if (!String(text).trim()) return "";
    return `<section class="entity-detail-section"><h3 class="entity-detail-section__h">${esc(t("extSectionArch"))}</h3><div class="detail-prose">${esc(String(text).trim())}</div></section>`;
  }

  function formatSupportSection(sup) {
    if (sup == null) return "";
    if (typeof sup === "boolean") {
      return `<section class="entity-detail-section"><h3 class="entity-detail-section__h">${esc(t("extSectionSupport"))}</h3><p class="entity-detail-section__p entity-detail-section__p--support">${esc(sup ? t("extSupportYes") : t("extSupportNo"))}</p></section>`;
    }
    if (typeof sup === "object") {
      const avail = sup.available;
      const notes = sup.notes || sup.description || "";
      const parts = [];
      if (typeof avail === "boolean") {
        parts.push(
          `<p class="entity-detail-section__p entity-detail-section__p--support">${esc(avail ? t("extSupportYes") : t("extSupportNo"))}</p>`
        );
      }
      if (notes && String(notes).trim()) {
        parts.push(`<div class="detail-prose">${esc(String(notes).trim())}</div>`);
      }
      if (!parts.length) return "";
      return `<section class="entity-detail-section"><h3 class="entity-detail-section__h">${esc(t("extSectionSupport"))}</h3>${parts.join("")}</section>`;
    }
    return "";
  }

  function extensionExtraSectionsHtml(row) {
    const arch = row.architecture ?? row.technical_architecture;
    const sup = row.support ?? row.tech_support;
    return [
      formatArchitectureSection(arch),
      formatSupportSection(sup),
    ].join("");
  }

  function extensionNameCell(row) {
    const text = extensionDisplayTitle(row, state.locale);
    return `<span class="ext-name">${esc(text)}</span>`;
  }

  /** 名称列：桌面仅标题；窄屏为「标题 + GitHub」，有版本时第二行仅 Chart 版本（id 仅在桌面列展示） */
  function extensionListNameColumnTd(row, nameLabel) {
    const dl = esc(nameLabel);
    const titleHtml = extensionNameCell(row);
    const href = extensionRepositoryHref(row);
    const githubHint = t("extGithubHint");
    const ghMobile = href
      ? `<a href="${esc(href)}" class="ext-github-cell ext-github-cell--in-head" rel="noopener noreferrer" target="_blank" title="${esc(
          githubHint
        )}" aria-label="${esc(githubHint)}">${extensionGithubIconSvg()}</a>`
      : `<span class="ext-github-cell ext-github-cell--in-head ext-github-cell--disabled" aria-hidden="true"><span class="empty-hint">—</span></span>`;
    const v = row.version && String(row.version).trim();
    const metaRow = v
      ? `<div class="ext-name-cell-mobile__meta"><span class="code-pill ext-head-mobile-ver">${esc(v)}</span></div>`
      : "";
    return `<td class="cell-name" data-label="${dl}">
      <div class="ext-name-cell-desktop">${titleHtml}</div>
      <div class="ext-name-cell-mobile">
        <div class="ext-name-cell-mobile__top">
          ${titleHtml}
          ${ghMobile}
        </div>
        ${metaRow}
      </div>
    </td>`;
  }

  function extensionListCategoryCell(row, colLabel) {
    const dl = esc(colLabel);
    const display = extensionCategoryDisplayLabel(row, state.locale);
    if (!display) {
      return `<td class="cell-ext-category" data-label="${dl}"><span class="empty-hint">—</span></td>`;
    }
    return `<td class="cell-ext-category" data-label="${dl}"><span class="ext-category-pill">${esc(
      display
    )}</span></td>`;
  }

  function extensionGithubIconSvg() {
    return `<svg class="ext-github-svg" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.229v3.303c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>`;
  }

  function extensionListGithubCell(row, colLabel) {
    const dl = esc(colLabel);
    const href = extensionRepositoryHref(row);
    if (!href) {
      return `<td class="cell-ext-github ext-cell-desktop-only" data-label="${dl}"><span class="empty-hint">—</span></td>`;
    }
    const hint = t("extGithubHint");
    return `<td class="cell-ext-github ext-cell-desktop-only" data-label="${dl}"><a href="${esc(href)}" class="ext-github-cell" rel="noopener noreferrer" target="_blank" title="${esc(hint)}" aria-label="${esc(hint)}">${extensionGithubIconSvg()}</a></td>`;
  }

  function extensionListVersionCell(row, colLabel) {
    const dl = esc(colLabel);
    const v = row.version;
    if (!v || !String(v).trim()) {
      return `<td class="cell-ext-version ext-cell-desktop-only" data-label="${dl}"><span class="empty-hint">—</span></td>`;
    }
    return `<td class="cell-ext-version ext-cell-desktop-only" data-label="${dl}"><span class="code-pill">${esc(String(v).trim())}</span></td>`;
  }

  function extensionListEnvCell(row, colLabel) {
    const dl = esc(colLabel);
    const k8s = row.kube_version;
    const ks = row.ks_version;
    const k8sOk = k8s && String(k8s).trim();
    const ksOk = ks && String(ks).trim();
    if (!k8sOk && !ksOk) {
      return `<td class="cell-ext-env" data-label="${dl}"><span class="empty-hint">—</span></td>`;
    }
    const lines = [];
    if (k8sOk) {
      lines.push(
        `<div class="ext-env-row"><span class="ext-env-k">${esc(t("extListKubeAbbr"))}</span><span class="ext-env-v mono-muted">${esc(String(k8s).trim())}</span></div>`
      );
    }
    if (ksOk) {
      lines.push(
        `<div class="ext-env-row"><span class="ext-env-k">${esc(t("extListKsAbbr"))}</span><span class="ext-env-v mono-muted">${esc(String(ks).trim())}</span></div>`
      );
    }
    return `<td class="cell-ext-env" data-label="${dl}">${lines.join("")}</td>`;
  }

  async function loadJson(name) {
    const r = await fetch(`data/${name}`, { cache: "no-store" });
    if (!r.ok) throw new Error(`无法加载 ${name}（${r.status}）`);
    return r.json();
  }

  function buildLookupMaps() {
    state.productByName = new Map();
    for (const p of (state.products && state.products.items) || []) {
      if (p && p.name) state.productByName.set(p.name, p);
    }
    state.extensionByEnglishName = new Map();
    for (const e of (state.extensions && state.extensions.items) || []) {
      if (e && e.englishName) state.extensionByEnglishName.set(e.englishName, e);
    }
  }

  /**
   * 路由（可分享）：
   * #/bundles | #/products | #/extensions — 列表
   * #/bundle/<name> | #/product/<name> | #/extension/<slug> — 详情
   * #/compare/bundle/<a>/<b> — 两档套餐对比（同一数据快照）
   */
  function parseRoute() {
    const raw = (location.hash || "").replace(/^#/, "").replace(/^\//, "");
    if (!raw) return { type: "bundles-list" };
    if (raw === "bundles") return { type: "bundles-list" };
    if (raw === "products") return { type: "products-list" };
    if (raw === "extensions") return { type: "extensions-list" };
    if (raw.startsWith("compare/bundle/")) {
      const tail = raw.slice(15);
      if (!tail) return { type: "bundles-list" };
      const parts = tail.split("/").map((seg) => decodeURIComponent(seg));
      if (parts.length < 2 || !parts[0] || !parts[1] || parts[0] === parts[1]) {
        return { type: "bundles-list" };
      }
      return { type: "bundle-compare", nameA: parts[0], nameB: parts[1] };
    }
    if (raw.startsWith("bundle/")) {
      return { type: "bundle-detail", name: decodeURIComponent(raw.slice(7)) };
    }
    if (raw.startsWith("product/")) {
      return { type: "product-detail", name: decodeURIComponent(raw.slice(8)) };
    }
    if (raw.startsWith("extension/")) {
      return { type: "extension-detail", slug: decodeURIComponent(raw.slice(10)) };
    }
    return { type: "bundles-list" };
  }

  function normalizeGithubRepo(slug) {
    const s = String(slug || "").trim();
    if (/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(s)) return s;
    return DEFAULT_LICENSE_ISSUE_REPO;
  }

  /** 发布时 meta.source_repo = GITHUB_REPOSITORY；本地为 local → 用默认仓 */
  function licenseCatalogIssueRepo() {
    const r = state.meta && state.meta.source_repo;
    if (r && String(r).trim() && String(r).trim() !== "local") {
      return normalizeGithubRepo(r);
    }
    return DEFAULT_LICENSE_ISSUE_REPO;
  }

  function licenseCatalogCommitHref(fullSha) {
    const repo = licenseCatalogIssueRepo();
    return `https://github.com/${repo}/commit/${encodeURIComponent(String(fullSha).trim())}`;
  }

  function issueTitleContext() {
    const zh = state.locale === "zh";
    const r = parseRoute();
    switch (r.type) {
      case "bundle-detail":
        return zh ? `套餐 ${r.name}` : `bundle ${r.name}`;
      case "bundle-compare":
        return zh ? `套餐对比 ${r.nameA} ${r.nameB}` : `bundle compare ${r.nameA} ${r.nameB}`;
      case "product-detail":
        return zh ? `产品 ${r.name}` : `product ${r.name}`;
      case "extension-detail":
        return zh ? `扩展 ${r.slug}` : `extension ${r.slug}`;
      case "products-list":
        return zh ? "产品列表" : "products list";
      case "extensions-list":
        return zh ? "扩展列表" : "extensions list";
      case "bundles-list":
      default:
        return zh ? "套餐列表" : "bundles list";
    }
  }

  /** 仅带 issue 表单模板名，不把正文放进 URL */
  function licenseCatalogIssueTemplateUrl() {
    const repo = licenseCatalogIssueRepo();
    const q = new URLSearchParams();
    q.set("template", LICENSE_ISSUE_TEMPLATE_FILE);
    return `https://github.com/${repo}/issues/new?${q.toString()}`;
  }

  /** 点击「内容有误？」时写入剪贴板，供用户在 GitHub 表单「背景信息」中粘贴 */
  function licenseCatalogIssueClipboardText() {
    const repo = licenseCatalogIssueRepo();
    const zh = state.locale === "zh";
    const ctx = issueTitleContext();
    const hub = t("pageHeading");
    const suggestedTitle = `[${hub}] ${ctx}`;
    const shaFull = (state.meta && state.meta.source_sha) || "";
    const shaOk =
      shaFull && String(shaFull).trim() && String(shaFull).trim() !== "local";
    const shaLine = shaOk ? String(shaFull).trim() : "";
    const body = zh
      ? [
          "## 建议标题（可贴到 GitHub 标题栏）",
          suggestedTitle,
          "",
          "## 背景信息",
          "",
          `- 页面 URL：${location.origin}${location.pathname}${location.search}${location.hash || "#/"}`,
          `- 当前路由：` + "`" + (location.hash || "#/") + "`",
          shaLine
            ? `- 数据提交（meta）：\`${shaLine.slice(0, 7)}\` 完整 \`${shaLine}\``
            : "- 数据提交（meta）：_本地或未记录_",
          `- 数据对应仓库：\`${repo}\`（${hub}）`,
          "",
          "_（下方问题描述请在新打开的 GitHub 表单中填写）_",
          "",
        ].join("\n")
      : [
          "## Suggested title (paste into GitHub)",
          suggestedTitle,
          "",
          "## Context",
          "",
          `- Page URL: ${location.origin}${location.pathname}${location.search}${location.hash || "#/"}`,
          `- Route: ` + "`" + (location.hash || "#/") + "`",
          shaLine
            ? `- Data commit (meta): \`${shaLine.slice(0, 7)}\` full \`${shaLine}\``
            : "- Data commit (meta): _local or unknown_",
          `- Data repository: \`${repo}\` (${hub})`,
          "",
          "_Describe the problem in the GitHub form fields._",
          "",
        ].join("\n");
    return body;
  }

  function a11yAnnounce(msg) {
    const el = document.getElementById("a11y-announcer");
    if (!el || !msg) return;
    el.textContent = "";
    requestAnimationFrame(() => {
      el.textContent = msg;
    });
  }

  function onLicenseIssueLinkClick(e) {
    if (e.button !== 0) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    const url = licenseCatalogIssueTemplateUrl();
    const text = licenseCatalogIssueClipboardText();
    const openGh = () => {
      window.open(url, "_blank", "noopener,noreferrer");
    };
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      navigator.clipboard.writeText(text).then(
        () => {
          a11yAnnounce(t("catalogIssueCopiedA11y"));
          openGh();
        },
        () => {
          openGh();
        }
      );
    } else {
      openGh();
    }
  }

  const HEADER_COMPACT_MQL =
    typeof window !== "undefined" && window.matchMedia
      ? window.matchMedia("(max-width: 720px)")
      : { matches: false, addEventListener: null, addListener: null };

  function updateLicenseIssueLink() {
    const a = document.getElementById("license-issue-link");
    if (!a) return;
    try {
      a.href = licenseCatalogIssueTemplateUrl();
    } catch {
      a.href = `https://github.com/${DEFAULT_LICENSE_ISSUE_REPO}/issues/new?template=${encodeURIComponent(LICENSE_ISSUE_TEMPLATE_FILE)}`;
    }
    const textEl = a.querySelector(".toolbar-issue-link__text");
    if (textEl) {
      textEl.textContent = HEADER_COMPACT_MQL.matches ? "" : t("catalogIssueLink");
    }
    a.title = t("catalogIssueHint");
    a.setAttribute("aria-label", t("catalogIssueAria"));
  }

  function updateProposeLink() {
    const a = document.querySelector("a.toolbar-propose-link");
    if (!a) return;
    a.textContent = t("toolbarProposeLink");
    a.title = t("toolbarProposeHint");
    a.setAttribute("aria-label", t("toolbarProposeAria"));
  }

  function bindHeaderCompactMql() {
    const m = HEADER_COMPACT_MQL;
    if (!m || !m.addEventListener) {
      if (m && m.addListener)
        m.addListener(() => {
          updateLicenseIssueLink();
          updateProposeLink();
        });
      return;
    }
    m.addEventListener("change", () => {
      updateLicenseIssueLink();
      updateProposeLink();
    });
  }

  function getBundleByName(name) {
    const items = (state.bundles && state.bundles.items) || [];
    return items.find((b) => b.name === name) || null;
  }

  function navigateToBundleList() {
    const next = "#/bundles";
    if (location.hash === next) {
      syncAllPanelsFromRoute();
      return;
    }
    location.hash = next;
  }

  function navigateToProductList() {
    const next = "#/products";
    if (location.hash === next) {
      syncAllPanelsFromRoute();
      return;
    }
    location.hash = next;
  }

  function navigateToExtensionList() {
    const next = "#/extensions";
    if (location.hash === next) {
      syncAllPanelsFromRoute();
      return;
    }
    location.hash = next;
  }

  function navigateToBundleDetail(name) {
    if (!name) return;
    location.hash = "#/bundle/" + encodeURIComponent(name);
  }

  function navigateToBundleCompare(nameA, nameB) {
    if (!nameA || !nameB || nameA === nameB) return;
    closeBundleComparePicker();
    location.hash =
      "#/compare/bundle/" + encodeURIComponent(nameA) + "/" + encodeURIComponent(nameB);
  }

  function navigateToProductDetail(name) {
    if (!name) return;
    location.hash = "#/product/" + encodeURIComponent(name);
  }

  function navigateToExtensionDetail(slug) {
    if (!slug) return;
    location.hash = "#/extension/" + encodeURIComponent(slug);
  }

  /** 列表 / 详情 / 对比 壳层切换时短淡入（与 Tab 面板 catalog-panel-reveal 同曲线） */
  let prevBundleShellView = undefined;
  let prevProductShellMode = undefined;
  let prevExtensionShellMode = undefined;

  function runDetailShellEnter(el) {
    if (!el || el.hidden) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    el.classList.remove("catalog-detail-enter");
    void el.offsetWidth;
    el.classList.add("catalog-detail-enter");
  }

  function setBundleShellView(view) {
    const list = document.getElementById("bundle-list-wrap");
    const detail = document.getElementById("bundle-detail-wrap");
    const compare = document.getElementById("bundle-compare-wrap");
    const v = view || "list";
    const shouldAnimate = prevBundleShellView !== undefined && prevBundleShellView !== v;
    prevBundleShellView = v;
    [list, detail, compare].forEach((node) => {
      if (node) node.classList.remove("catalog-detail-enter");
    });
    if (list) list.hidden = v !== "list";
    if (detail) detail.hidden = v !== "detail";
    if (compare) compare.hidden = v !== "compare";
    const shown = v === "list" ? list : v === "detail" ? detail : compare;
    if (shouldAnimate && shown) runDetailShellEnter(shown);
  }

  function showBundleDetailShell(detail) {
    setBundleShellView(detail ? "detail" : "list");
  }

  function showProductDetailShell(detail) {
    const list = document.getElementById("product-list-wrap");
    const wrap = document.getElementById("product-detail-wrap");
    const mode = detail ? "detail" : "list";
    const shouldAnimate = prevProductShellMode !== undefined && prevProductShellMode !== mode;
    prevProductShellMode = mode;
    [list, wrap].forEach((node) => {
      if (node) node.classList.remove("catalog-detail-enter");
    });
    if (list) list.hidden = !!detail;
    if (wrap) wrap.hidden = !detail;
    const shown = detail ? wrap : list;
    if (shouldAnimate && shown) runDetailShellEnter(shown);
  }

  function showExtensionDetailShell(detail) {
    const list = document.getElementById("extension-list-wrap");
    const wrap = document.getElementById("extension-detail-wrap");
    const mode = detail ? "detail" : "list";
    const shouldAnimate = prevExtensionShellMode !== undefined && prevExtensionShellMode !== mode;
    prevExtensionShellMode = mode;
    [list, wrap].forEach((node) => {
      if (node) node.classList.remove("catalog-detail-enter");
    });
    if (list) list.hidden = !!detail;
    if (wrap) wrap.hidden = !detail;
    const shown = detail ? wrap : list;
    if (shouldAnimate && shown) runDetailShellEnter(shown);
  }

  function scrollDetailIntoView() {
    window.scrollTo(0, 0);
  }

  function updateDetailDocTitle() {
    const r = parseRoute();
    const base = t("docTitle");
    let sub = null;
    if (r.type === "bundle-detail") {
      const row = getBundleByName(r.name);
      sub = row ? bundleCardTitle(row, state.locale) : r.name;
    } else if (r.type === "bundle-compare") {
      const ra = getBundleByName(r.nameA);
      const rb = getBundleByName(r.nameB);
      const ta = ra ? bundleCardTitle(ra, state.locale) : r.nameA;
      const tb = rb ? bundleCardTitle(rb, state.locale) : r.nameB;
      sub = state.locale === "zh" ? `${ta} 与 ${tb}` : `${ta} vs ${tb}`;
    } else if (r.type === "product-detail") {
      const row = state.productByName && state.productByName.get(r.name);
      sub = row ? productCardTitle(row, state.locale) : r.name;
    } else if (r.type === "extension-detail") {
      const row = state.extensionByEnglishName && state.extensionByEnglishName.get(r.slug);
      if (row) {
        sub = extensionDisplayTitle(row, state.locale) || row.englishName || r.slug;
      } else {
        sub = r.slug;
      }
    }
    document.getElementById("doc-title").textContent = sub ? `${sub} · ${base}` : base;
  }

  function updateSearchDisabled() {
    const r = parseRoute();
    const active = document.querySelector(".tab.active");
    const tab = active && active.dataset.tab;
    const onDetail =
      (tab === "bundles" && (r.type === "bundle-detail" || r.type === "bundle-compare")) ||
      (tab === "products" && r.type === "product-detail") ||
      (tab === "extensions" && r.type === "extension-detail");
    const f = document.getElementById("filter");
    if (f) f.disabled = !!onDetail;
  }

  /** Omit the product segment when count is 0 (list + detail). */
  function bundleStatsLine(prodCount, extCount) {
    if (prodCount <= 0) {
      return state.locale === "zh"
        ? `${extCount} 个扩展`
        : `${extCount} extensions`;
    }
    return state.locale === "zh"
      ? `${prodCount} 个产品 · ${extCount} 个扩展`
      : `${prodCount} products · ${extCount} extensions`;
  }

  function productStatsLine(extCount) {
    return state.locale === "zh"
      ? `${extCount} 个扩展`
      : `${extCount} extensions`;
  }

  function syncBundlePanelView() {
    const panel = document.getElementById("panel-bundles");
    if (!panel || panel.hidden) return;
    const r = parseRoute();
    if (r.type === "bundle-detail") {
      state.bundleCompareDiffOnly = false;
      renderBundleDetail(r.name);
      setBundleShellView("detail");
    } else if (r.type === "bundle-compare") {
      closeBundleComparePicker();
      renderBundleCompare(r.nameA, r.nameB);
      setBundleShellView("compare");
    } else {
      state.bundleCompareDiffOnly = false;
      closeBundleComparePicker();
      setBundleShellView("list");
    }
  }

  function syncProductPanelView() {
    const panel = document.getElementById("panel-products");
    if (!panel || panel.hidden) return;
    const r = parseRoute();
    if (r.type === "product-detail") {
      renderProductDetail(r.name);
      showProductDetailShell(true);
    } else {
      showProductDetailShell(false);
    }
  }

  function syncExtensionPanelView() {
    const panel = document.getElementById("panel-extensions");
    if (!panel || panel.hidden) return;
    const r = parseRoute();
    if (r.type === "extension-detail") {
      renderExtensionDetail(r.slug);
      showExtensionDetailShell(true);
    } else {
      showExtensionDetailShell(false);
    }
  }

  function syncAllPanelsFromRoute() {
    syncBundlePanelView();
    syncProductPanelView();
    syncExtensionPanelView();
    updateDetailDocTitle();
    updateSearchDisabled();
    const r = parseRoute();
    if (
      r.type === "bundle-detail" ||
      r.type === "bundle-compare" ||
      r.type === "product-detail" ||
      r.type === "extension-detail"
    ) {
      scrollDetailIntoView();
    }
    updateFilterEmptyStates();
  }

  function renderBundleDetail(name) {
    closeBundleComparePicker();
    const root = document.getElementById("bundle-detail-root");
    if (!root) return;
    const row = getBundleByName(name);
    const loc = state.locale;
    if (!row) {
      root.innerHTML = `
        <div class="entity-detail bundle-detail bundle-detail--missing">
          <a href="#/bundles" class="bundle-back-btn">${esc(t("bundleBackList"))}</a>
          <p class="bundle-missing-msg">${esc(t("bundleNotFound"))}</p>
        </div>`;
      updateDetailDocTitle();
      return;
    }
    const title = bundleCardTitle(row, loc);
    root.innerHTML = `
      <div class="entity-detail bundle-detail">
        <nav class="bundle-breadcrumb" aria-label="${esc(t("breadcrumbAria"))}">
          <a href="#/bundles" class="bundle-breadcrumb__link">${esc(t("tabBundles"))}</a>
          <span class="bundle-breadcrumb__sep" aria-hidden="true">/</span>
          <span class="bundle-breadcrumb__current">${esc(title)}</span>
        </nav>
        ${bundleDetailColumnBlock(row, loc, "", {
          compareLaunchHtml: bundleCompareLaunchHtml(name),
        })}
      </div>`;
    updateDetailDocTitle();
  }

  function renderProductDetail(name) {
    const root = document.getElementById("product-detail-root");
    if (!root) return;
    const row = state.productByName && state.productByName.get(name);
    const loc = state.locale;
    if (!row) {
      root.innerHTML = `
        <div class="entity-detail bundle-detail bundle-detail--missing">
          <a href="#/products" class="bundle-back-btn">${esc(t("productBackList"))}</a>
          <p class="bundle-missing-msg">${esc(t("productNotFound"))}</p>
        </div>`;
      updateDetailDocTitle();
      return;
    }
    const title = productCardTitle(row, loc);
    const exts = row.extensions || [];
    const stats = productStatsLine(exts.length);
    root.innerHTML = `
      <div class="entity-detail bundle-detail">
        <nav class="bundle-breadcrumb" aria-label="${esc(t("breadcrumbAria"))}">
          <a href="#/products" class="bundle-breadcrumb__link">${esc(t("tabProducts"))}</a>
          <span class="bundle-breadcrumb__sep" aria-hidden="true">/</span>
          <span class="bundle-breadcrumb__current">${esc(title)}</span>
        </nav>
        <header class="bundle-detail-hero">
          <div class="bundle-detail-hero__text">
            <h2 class="bundle-detail-title">${esc(title)}</h2>
            <p class="bundle-detail-lead">${esc(stats)}</p>
          </div>
        </header>
        <section class="bundle-detail-panel bundle-detail-panel--full" aria-labelledby="pd-ext-h">
          <h3 id="pd-ext-h" class="bundle-detail-panel__h">${esc(t("sectionProductExtensions"))} <span class="card-count">${exts.length}</span></h3>
          <div class="bundle-detail-panel__body">${tagsHtmlExtensionSlugsGrouped(exts)}</div>
        </section>
      </div>`;
    updateDetailDocTitle();
  }

  function renderExtensionDetail(slug) {
    const root = document.getElementById("extension-detail-root");
    if (!root) return;
    const row = state.extensionByEnglishName && state.extensionByEnglishName.get(slug);
    const loc = state.locale;
    if (!row) {
      root.innerHTML = `
        <div class="entity-detail bundle-detail bundle-detail--missing">
          <a href="#/extensions" class="bundle-back-btn">${esc(t("extensionBackList"))}</a>
          <p class="bundle-missing-msg">${esc(t("extensionNotFound"))}</p>
        </div>`;
      updateDetailDocTitle();
      return;
    }
    const title = extensionDisplayTitle(row, loc) || slug;
    const rl = row.resource_limit;
    const fg = row.feature_gates;
    const overview = extensionCatalogOverviewHtml(row, loc);
    const limits = extensionLimitsDetailHtml(rl, fg);
    const extra = extensionExtraSectionsHtml(row);
    root.innerHTML = `
      <div class="entity-detail bundle-detail extension-detail">
        <nav class="bundle-breadcrumb" aria-label="${esc(t("breadcrumbAria"))}">
          <a href="#/extensions" class="bundle-breadcrumb__link">${esc(t("tabExtensions"))}</a>
          <span class="bundle-breadcrumb__sep" aria-hidden="true">/</span>
          <span class="bundle-breadcrumb__current">${esc(title)}</span>
        </nav>
        <header class="bundle-detail-hero">
          <div class="bundle-detail-hero__text">
            <h2 class="bundle-detail-title">${esc(title)}</h2>
          </div>
        </header>
        ${overview}
        ${limits}
        <div class="extension-detail-extra">${extra}</div>
      </div>`;
    updateDetailDocTitle();
  }

  function renderBundles() {
    const root = document.getElementById("grid-bundles");
    root.innerHTML = "";
    const items = (state.bundles && state.bundles.items) || [];
    const loc = state.locale;
    for (const row of items) {
      const prods = row.products || [];
      const exts = row.extensions || [];
      const title = bundleCardTitle(row, loc);
      const stats = bundleStatsLine(prods.length, exts.length);
      const el = document.createElement("article");
      el.className = "catalog-card catalog-card--bundle-tile";
      el.dataset.bundleName = row.name;
      el.dataset.filter = bundleListSearchHaystack(row);
      el.tabIndex = 0;
      el.setAttribute("role", "link");
      el.setAttribute("aria-label", `${title} — ${t("bundleViewDetail")}`);
      el.innerHTML = `
        <header class="card-head">
          <div class="card-head__text">
            <h2 class="card-title">${esc(title)}</h2>
          </div>
          <span class="badge">Lv ${esc(row.level)}</span>
        </header>
        <p class="bundle-tile-stats">${esc(stats)}</p>
        <div class="bundle-tile-cta" aria-hidden="true">
          <span class="bundle-tile-cta__text">${esc(t("bundleViewDetail"))}</span>
          <span class="bundle-tile-cta__chev">→</span>
        </div>`;
      root.appendChild(el);
    }
  }

  function renderProducts() {
    const root = document.getElementById("grid-products");
    root.innerHTML = "";
    const items = (state.products && state.products.items) || [];
    const loc = state.locale;
    for (const row of items) {
      const exts = row.extensions || [];
      const title = productCardTitle(row, loc);
      const stats = productStatsLine(exts.length);
      const el = document.createElement("article");
      el.className = "catalog-card catalog-card--product-tile";
      el.dataset.productName = row.name;
      el.dataset.filter = productListSearchHaystack(row);
      el.tabIndex = 0;
      el.setAttribute("role", "link");
      el.setAttribute("aria-label", `${title} — ${t("productViewDetail")}`);
      el.innerHTML = `
        <header class="card-head">
          <div class="card-head__text">
            <h2 class="card-title">${esc(title)}</h2>
          </div>
        </header>
        <p class="bundle-tile-stats">${esc(stats)}</p>
        <div class="bundle-tile-cta" aria-hidden="true">
          <span class="bundle-tile-cta__text">${esc(t("productViewDetail"))}</span>
          <span class="bundle-tile-cta__chev">→</span>
        </div>`;
      root.appendChild(el);
    }
  }

  function renderExtensions() {
    const tb = document.getElementById("tbody-extensions");
    tb.innerHTML = "";
    const items = (state.extensions && state.extensions.items) || [];
    for (const row of items) {
      const tr = document.createElement("tr");
      tr.className = "ext-row ext-row--clickable";
      tr.dataset.extensionSlug = row.englishName || "";
      tr.dataset.filter = extensionListSearchHaystack(row);
      tr.tabIndex = 0;
      tr.setAttribute("role", "link");
      const label = extensionDisplayTitle(row, state.locale) || row.englishName || "";
      const catDisp = extensionCategoryDisplayLabel(row, state.locale);
      tr.setAttribute(
        "aria-label",
        `${label}${catDisp ? ` — ${catDisp}` : ""} — ${t("extensionViewDetail")}`
      );
      const githubTd = extensionListGithubCell(row, t("thExtGithub"));
      const versionTd = extensionListVersionCell(row, t("thExtVersion"));
      const envTd = extensionListEnvCell(row, t("thExtEnv"));
      const nameTd = extensionListNameColumnTd(row, t("thName"));
      const categoryTd = extensionListCategoryCell(row, t("thExtCategory"));
      tr.innerHTML = `
        <td class="col-id ext-cell-desktop-only" data-label="${esc(t("thId"))}"><span class="mono-muted">${esc(row.id)}</span></td>
        ${nameTd}
        ${categoryTd}
        ${githubTd}
        ${versionTd}
        ${envTd}`;
      tb.appendChild(tr);
    }
  }

  function renderAll() {
    cancelFilterInputDebounce();
    renderBundles();
    renderProducts();
    renderExtensions();
    applyFilter();
    syncAllPanelsFromRoute();
    queueMicrotask(() => runListEntranceAnimationsForActiveTab());
  }

  function countFilterItems(root, itemSelector) {
    if (!root) return { total: 0, visible: 0 };
    const nodes = root.querySelectorAll(itemSelector);
    let visible = 0;
    nodes.forEach((node) => {
      if (!node.classList.contains("filtered-out")) visible += 1;
    });
    return { total: nodes.length, visible };
  }

  function renderEmptyStateContent(el) {
    el.innerHTML = `<div class="catalog-empty-state__visual" aria-hidden="true">
      <svg class="catalog-empty-state__icon" xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.35-4.35"/></svg>
    </div>
    <p class="catalog-empty-state__title">${esc(t("filterEmptyTitle"))}</p>
    <p class="catalog-empty-state__hint">${esc(t("filterEmptyHint"))}</p>`;
  }

  function catalogSkeletonCardHtml() {
    return `<article class="catalog-skeleton-card" aria-hidden="true">
      <div class="catalog-skeleton-card__head">
        <div class="catalog-skeleton-line catalog-skeleton-line--lg"></div>
        <div class="catalog-skeleton-chip"></div>
      </div>
      <div class="catalog-skeleton-line catalog-skeleton-line--md"></div>
      <div class="catalog-skeleton-line catalog-skeleton-line--sm catalog-skeleton-line--narrow"></div>
    </article>`;
  }

  function catalogSkeletonExtRowHtml() {
    return `<tr class="catalog-skeleton-tr" aria-hidden="true">
      <td colspan="6"><div class="catalog-skeleton-line catalog-skeleton-line--table"></div></td>
    </tr>`;
  }

  function showCatalogLoadingUi(show) {
    const filter = document.getElementById("filter");
    const main = document.querySelector("main");
    if (!filter || !main) return;
    if (show) {
      filter.disabled = true;
      main.setAttribute("aria-busy", "true");
      main.setAttribute("aria-label", t("catalogLoadingAria"));
      const b = document.getElementById("grid-bundles");
      const p = document.getElementById("grid-products");
      const tb = document.getElementById("tbody-extensions");
      const card = catalogSkeletonCardHtml();
      if (b) b.innerHTML = new Array(6).fill(card).join("");
      if (p) p.innerHTML = new Array(6).fill(card).join("");
      if (tb) tb.innerHTML = new Array(8).fill(catalogSkeletonExtRowHtml()).join("");
    } else {
      filter.disabled = false;
      main.removeAttribute("aria-busy");
      main.removeAttribute("aria-label");
    }
  }

  function clearCatalogListRoots() {
    const b = document.getElementById("grid-bundles");
    const pr = document.getElementById("grid-products");
    const tb = document.getElementById("tbody-extensions");
    if (b) {
      b.innerHTML = "";
      b.classList.remove("catalog-list-reveal");
    }
    if (pr) {
      pr.innerHTML = "";
      pr.classList.remove("catalog-list-reveal");
    }
    if (tb) {
      tb.innerHTML = "";
      tb.classList.remove("catalog-list-reveal");
    }
  }

  function runStaggerOnListRoot(root, itemSelector) {
    if (!root) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    root.classList.remove("catalog-list-reveal");
    root.querySelectorAll(itemSelector).forEach((el, i) => {
      el.style.setProperty("--stagger", String(Math.min(i, 36)));
    });
    void root.offsetWidth;
    root.classList.add("catalog-list-reveal");
  }

  function runListEntranceAnimationsForTab(tabName) {
    if (!tabName) return;
    requestAnimationFrame(() => {
      if (tabName === "bundles") {
        runStaggerOnListRoot(document.getElementById("grid-bundles"), ".catalog-card:not(.filtered-out)");
      } else if (tabName === "products") {
        runStaggerOnListRoot(document.getElementById("grid-products"), ".catalog-card:not(.filtered-out)");
      } else if (tabName === "extensions") {
        runStaggerOnListRoot(
          document.getElementById("tbody-extensions"),
          "tr.ext-row--clickable:not(.filtered-out)"
        );
      }
    });
  }

  function runListEntranceAnimationsForActiveTab() {
    const tab = document.querySelector("#tabs .tab.active");
    runListEntranceAnimationsForTab(tab && tab.dataset.tab);
  }

  function updateFilterEmptyStates() {
    const q = (document.getElementById("filter").value || "").trim().toLowerCase();
    const active = q !== "";

    const gridB = document.getElementById("grid-bundles");
    const gridP = document.getElementById("grid-products");
    const tb = document.getElementById("tbody-extensions");
    const extShell = document.querySelector("#extension-list-wrap .table-shell");

    const b = countFilterItems(gridB, ".catalog-card");
    const p = countFilterItems(gridP, ".catalog-card");
    const e = countFilterItems(tb, "tr[data-extension-slug]");

    function applyEmpty(emptyId, listEl, total, visible) {
      const emptyEl = document.getElementById(emptyId);
      if (!emptyEl) return;
      const noMatch = active && total > 0 && visible === 0;
      if (noMatch) {
        renderEmptyStateContent(emptyEl);
        emptyEl.hidden = false;
        if (listEl) listEl.hidden = true;
      } else {
        emptyEl.hidden = true;
        if (listEl) listEl.hidden = false;
      }
    }

    applyEmpty("empty-filter-bundles", gridB, b.total, b.visible);
    applyEmpty("empty-filter-products", gridP, p.total, p.visible);
    applyEmpty("empty-filter-extensions", extShell, e.total, e.visible);
  }

  function applyFilter() {
    const q = (document.getElementById("filter").value || "").trim().toLowerCase();
    document.querySelectorAll("[data-filter]").forEach((el) => {
      const hay = el.dataset.filter || "";
      el.classList.toggle("filtered-out", q !== "" && !hay.includes(q));
    });
    updateFilterEmptyStates();
  }

  function syncTabListAccessibility() {
    document.querySelectorAll("#tabs .tab").forEach((btn) => {
      const on = btn.classList.contains("active");
      btn.setAttribute("aria-selected", on ? "true" : "false");
      btn.tabIndex = on ? 0 : -1;
    });
  }

  function switchTab(name) {
    document.querySelectorAll(".tab").forEach((btn) => {
      const on = btn.dataset.tab === name;
      btn.classList.toggle("active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
    document.querySelectorAll(".panel").forEach((p) => {
      const id = p.id.replace("panel-", "");
      const on = id === name;
      if (on) {
        p.hidden = false;
        p.classList.add("active");
        if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
          p.classList.remove("catalog-panel-enter");
          void p.offsetWidth;
          p.classList.add("catalog-panel-enter");
        }
      } else {
        p.classList.remove("active", "catalog-panel-enter");
        p.hidden = true;
      }
    });
    syncAllPanelsFromRoute();
    syncTabListAccessibility();
    queueMicrotask(() => runListEntranceAnimationsForTab(name));
  }

  function onTabsKeydown(ev) {
    const tabsBar = document.getElementById("tabs");
    if (!tabsBar || !tabsBar.contains(ev.target)) return;
    const tab = ev.target.closest(".tab");
    if (!tab) return;
    const tabs = [...tabsBar.querySelectorAll(".tab")];
    const i = tabs.indexOf(tab);
    if (i < 0) return;
    let next = -1;
    if (ev.key === "ArrowRight" || ev.key === "ArrowDown") {
      next = (i + 1) % tabs.length;
    } else if (ev.key === "ArrowLeft" || ev.key === "ArrowUp") {
      next = (i - 1 + tabs.length) % tabs.length;
    } else if (ev.key === "Home") {
      next = 0;
    } else if (ev.key === "End") {
      next = tabs.length - 1;
    } else {
      return;
    }
    ev.preventDefault();
    const btn = tabs[next];
    if (btn && btn.dataset.tab) {
      switchTab(btn.dataset.tab);
      btn.focus();
    }
  }

  function bindHeaderScrollShadow() {
    const header = document.getElementById("site-header");
    if (!header) return;
    const onScroll = () => {
      header.classList.toggle("is-scrolled", window.scrollY > 3);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  /** ISO / 合并 JSON 时间串 → UTC `YYYY-MM-DD HH:mm:ss`（先按整段解析再输出，避免无 Z 时被当成本地时区） */
  function formatTimestampToSeconds(raw) {
    if (raw == null || raw === "") return "";
    const str = String(raw).trim();
    const d = new Date(str);
    if (!Number.isNaN(d.getTime())) {
      return d.toISOString().slice(0, 19).replace("T", " ");
    }
    const m = str.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})/);
    if (m) return `${m[1]} ${m[2]}`;
    return str;
  }

  function refreshMetaBar() {
    const metaEl = document.getElementById("build-meta");
    if (!metaEl) return;
    while (metaEl.firstChild) metaEl.removeChild(metaEl.firstChild);

    const rawGa = state.bundles && state.bundles.generated_at;
    const ts = rawGa ? formatTimestampToSeconds(rawGa) : "";
    const shaFull =
      state.meta && state.meta.source_sha && String(state.meta.source_sha).trim()
        ? String(state.meta.source_sha).trim()
        : "";
    const shaShort = shaFull ? shaFull.slice(0, 7) : "";

    if (!ts && !shaShort) {
      metaEl.textContent = t("metaLoadedFallback");
      return;
    }

    if (ts) {
      metaEl.appendChild(document.createTextNode(`${t("metaDataUpdatedLabel")} `));
      const timeEl = document.createElement("time");
      const rawStr = rawGa != null ? String(rawGa).trim() : "";
      const parsed = rawStr ? new Date(rawStr) : null;
      if (parsed && !Number.isNaN(parsed.getTime())) {
        timeEl.dateTime = parsed.toISOString();
      } else if (/^\d{4}-\d{2}-\d{2}T/.test(rawStr)) {
        timeEl.dateTime = rawStr;
      }
      timeEl.textContent = `${ts} UTC`;
      metaEl.appendChild(timeEl);
    }

    if (ts && shaShort) {
      metaEl.appendChild(document.createTextNode(" · "));
    }

    if (shaShort) {
      const a = document.createElement("a");
      a.className = "meta-commit-link";
      a.href = licenseCatalogCommitHref(shaFull);
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.title = t("metaCommitGithubHint").replace("%s", shaFull);
      a.setAttribute("aria-label", `${t("metaCommitAria")} ${shaShort}`);
      a.appendChild(document.createTextNode(`${t("metaCommitPrefix")} `));
      const code = document.createElement("code");
      code.className = "meta-commit-sha";
      code.textContent = shaShort;
      a.appendChild(code);
      metaEl.appendChild(a);
    }
  }

  function applyChrome() {
    const loc = state.locale;
    document.documentElement.lang = loc === "zh" ? "zh-CN" : "en";
    try {
      localStorage.setItem(LOCALE_KEY, loc);
    } catch {
      /* ignore */
    }

    document.getElementById("page-heading").textContent = t("pageHeading");

    const ph = document.getElementById("filter");
    ph.placeholder = t("searchPlaceholder");
    ph.setAttribute("aria-label", t("searchAriaLabel"));

    document.querySelectorAll(".tab[data-i18n-tab]").forEach((btn) => {
      const k = btn.dataset.i18nTab;
      const map = { bundles: "tabBundles", products: "tabProducts", extensions: "tabExtensions" };
      btn.textContent = t(map[k] || k);
    });

    document.querySelectorAll("[data-i18n-th]").forEach((th) => {
      const k = th.dataset.i18nTh;
      const map = {
        id: "thId",
        name: "thName",
        resource: "thResource",
        extVersion: "thExtVersion",
        extEnv: "thExtEnv",
        extCategory: "thExtCategory",
        extGithub: "thExtGithub",
      };
      th.textContent = t(map[k] || k);
    });

    document.getElementById("locale-switch").setAttribute("aria-label", t("localeGroupAria"));
    document.querySelectorAll(".locale-switch__segments .locale-btn").forEach((btn) => {
      const on = btn.dataset.locale === loc;
      btn.classList.toggle("active", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
    const localeCompact = document.getElementById("locale-toggle-compact");
    if (localeCompact) {
      localeCompact.textContent = loc === "zh" ? "中" : "EN";
      localeCompact.setAttribute(
        "aria-label",
        loc === "zh" ? t("localeSwitchToEnAria") : t("localeSwitchToZhAria")
      );
    }

    const siteMeta = document.getElementById("site-meta");
    if (siteMeta) siteMeta.setAttribute("aria-label", t("siteMetaFooterAria"));

    updateDetailDocTitle();
    refreshMetaBar();
    updateLicenseIssueLink();
    updateProposeLink();
  }

  function setLocale(next) {
    if (next !== "zh" && next !== "en") return;
    state.locale = next;
    closeBundleComparePicker();
    applyChrome();
    renderAll();
  }

  function bindBundleCompareDrawer() {
    const drawer = document.getElementById("bundle-compare-drawer");
    if (!drawer || drawer.dataset.bound === "1") return;
    drawer.dataset.bound = "1";
    drawer.addEventListener("click", (ev) => {
      if (ev.target.closest(".bundle-compare-drawer__backdrop")) {
        closeBundleComparePicker();
        return;
      }
      if (ev.target.closest("#bundle-compare-drawer-close")) {
        closeBundleComparePicker();
        return;
      }
      const pick = ev.target.closest("[data-pick-bundle]");
      if (!pick) return;
      const name = pick.getAttribute("data-pick-bundle");
      const pctx = bundleComparePickContext;
      if (!name || !pctx) return;
      if (pctx.mode === "pair" && pctx.anchor) {
        navigateToBundleCompare(pctx.anchor, name);
        return;
      }
      if (pctx.mode === "repick" && pctx.partner) {
        if (pctx.side === "l") navigateToBundleCompare(name, pctx.partner);
        else navigateToBundleCompare(pctx.partner, name);
      }
    });
    const fil = document.getElementById("bundle-compare-drawer-filter");
    if (fil) fil.addEventListener("input", filterBundleCompareDrawerList);
    document.addEventListener("keydown", (ev) => {
      if (ev.key !== "Escape") return;
      const d = document.getElementById("bundle-compare-drawer");
      if (!d || d.hidden) return;
      ev.preventDefault();
      closeBundleComparePicker();
    });
  }

  function showError(msg) {
    const main = document.querySelector("main");
    const div = document.createElement("div");
    div.className = "error-banner";
    div.textContent = msg;
    main.insertBefore(div, main.firstChild);
    const bm = document.getElementById("build-meta");
    if (bm) bm.textContent = t("metaLoadFailed");
  }

  async function init() {
    try {
      state.meta = await loadJson("meta.json");
    } catch {
      state.meta = {};
    }

    try {
      const stored = localStorage.getItem(LOCALE_KEY);
      if (stored === "zh" || stored === "en") state.locale = stored;
    } catch {
      /* ignore */
    }

    showCatalogLoadingUi(true);
    try {
      const [b, p, e] = await Promise.all([
        loadJson("bundles-merged.json"),
        loadJson("products-merged.json"),
        loadJson("extensions-merged.json"),
      ]);
      state.bundles = b;
      state.products = p;
      state.extensions = e;
    } catch (err) {
      showCatalogLoadingUi(false);
      clearCatalogListRoots();
      showError(err.message || String(err));
      return;
    }
    showCatalogLoadingUi(false);

    buildLookupMaps();

    applyChrome();
    bindHeaderCompactMql();

    const initialRoute = parseRoute();
    if (initialRoute.type === "bundle-detail") switchTab("bundles");
    else if (initialRoute.type === "bundle-compare") switchTab("bundles");
    else if (initialRoute.type === "product-detail") switchTab("products");
    else if (initialRoute.type === "extension-detail") switchTab("extensions");
    else if (initialRoute.type === "products-list") switchTab("products");
    else if (initialRoute.type === "extensions-list") switchTab("extensions");

    renderAll();
    syncTabListAccessibility();
    bindHeaderScrollShadow();

    const filterInput = document.getElementById("filter");
    filterInput.addEventListener("input", scheduleApplyFilter);
    filterInput.addEventListener("blur", flushApplyFilter);
    document.getElementById("tabs").addEventListener("click", (ev) => {
      const btn = ev.target.closest(".tab");
      if (btn && btn.dataset.tab) switchTab(btn.dataset.tab);
    });
    document.getElementById("tabs").addEventListener("keydown", onTabsKeydown);
    document.getElementById("locale-switch").addEventListener("click", (ev) => {
      if (ev.target.closest("#locale-toggle-compact")) {
        setLocale(state.locale === "zh" ? "en" : "zh");
        return;
      }
      const btn = ev.target.closest(".locale-btn");
      if (btn && btn.dataset.locale) setLocale(btn.dataset.locale);
    });

    const licenseIssueLink = document.getElementById("license-issue-link");
    if (licenseIssueLink) {
      licenseIssueLink.addEventListener("click", onLicenseIssueLinkClick);
    }

    const gridBundles = document.getElementById("grid-bundles");
    gridBundles.addEventListener("click", (ev) => {
      const card = ev.target.closest("[data-bundle-name]");
      if (card) navigateToBundleDetail(card.dataset.bundleName);
    });
    gridBundles.addEventListener("keydown", (ev) => {
      if (ev.key !== "Enter" && ev.key !== " ") return;
      const card = ev.target.closest("[data-bundle-name]");
      if (!card) return;
      ev.preventDefault();
      navigateToBundleDetail(card.dataset.bundleName);
    });

    const bundleDetailWrap = document.getElementById("bundle-detail-wrap");
    if (bundleDetailWrap) {
      bundleDetailWrap.addEventListener("click", (ev) => {
        const btn = ev.target.closest("#bundle-compare-open-btn");
        if (!btn || btn.disabled) return;
        const cur = btn.getAttribute("data-current-bundle") || "";
        if (cur) openBundleComparePicker(cur);
      });
    }

    const bundleCompareWrap = document.getElementById("bundle-compare-wrap");
    if (bundleCompareWrap && bundleCompareWrap.dataset.boundCompareUi !== "1") {
      bundleCompareWrap.dataset.boundCompareUi = "1";
      bundleCompareWrap.addEventListener("keydown", (ev) => {
        const sw = ev.target.closest(".bundle-compare-title-switch__segments");
        if (!sw || ev.target.closest(".bundle-compare-title-switch__swap")) return;
        if (ev.key !== "ArrowLeft" && ev.key !== "ArrowRight") return;
        ev.preventDefault();
        const next =
          ev.key === "ArrowLeft"
            ? sw.querySelector("[data-compare-repick-side=\"l\"]")
            : sw.querySelector("[data-compare-repick-side=\"r\"]");
        if (next) next.focus();
      });
      bundleCompareWrap.addEventListener("click", (ev) => {
        const swapMid = ev.target.closest(".bundle-compare-title-switch__swap");
        if (swapMid) {
          ev.preventDefault();
          const page = document.querySelector(".bundle-compare-page");
          const na = page && page.getAttribute("data-compare-bundle-a");
          const nb = page && page.getAttribute("data-compare-bundle-b");
          if (na && nb) navigateToBundleCompare(nb, na);
          return;
        }
        const titleTab = ev.target.closest(".bundle-compare-title-switch__btn");
        if (titleTab) {
          const side = titleTab.getAttribute("data-compare-repick-side");
          const partner = titleTab.getAttribute("data-compare-repick-partner");
          if (partner && (side === "l" || side === "r")) {
            ev.preventDefault();
            openBundleComparePicker({ mode: "repick", partner, side });
          }
          return;
        }
        if (ev.target.closest("#bundle-compare-diff-toggle")) {
          ev.preventDefault();
          state.bundleCompareDiffOnly = !state.bundleCompareDiffOnly;
          const page = document.querySelector(".bundle-compare-page");
          const na = page && page.getAttribute("data-compare-bundle-a");
          const nb = page && page.getAttribute("data-compare-bundle-b");
          if (na && nb) {
            renderBundleCompare(na, nb);
            return;
          }
          const r = parseRoute();
          if (r.type === "bundle-compare") renderBundleCompare(r.nameA, r.nameB);
        }
      });
    }

    document.getElementById("grid-products").addEventListener("click", (ev) => {
      const card = ev.target.closest("[data-product-name]");
      if (card) navigateToProductDetail(card.dataset.productName);
    });
    document.getElementById("grid-products").addEventListener("keydown", (ev) => {
      if (ev.key !== "Enter" && ev.key !== " ") return;
      const card = ev.target.closest("[data-product-name]");
      if (!card) return;
      ev.preventDefault();
      navigateToProductDetail(card.dataset.productName);
    });

    const tbodyExt = document.getElementById("tbody-extensions");
    tbodyExt.addEventListener("click", (ev) => {
      if (ev.target.closest("a")) return;
      const tr = ev.target.closest("tr[data-extension-slug]");
      if (tr && tr.dataset.extensionSlug) navigateToExtensionDetail(tr.dataset.extensionSlug);
    });
    tbodyExt.addEventListener("keydown", (ev) => {
      if (ev.key !== "Enter" && ev.key !== " ") return;
      const tr = ev.target.closest("tr[data-extension-slug]");
      if (!tr || !tr.dataset.extensionSlug) return;
      ev.preventDefault();
      navigateToExtensionDetail(tr.dataset.extensionSlug);
    });

    bindBundleCompareDrawer();

    window.addEventListener("hashchange", () => {
      closeBundleComparePicker();
      const r = parseRoute();
      if (r.type === "bundle-detail") switchTab("bundles");
      else if (r.type === "bundle-compare") switchTab("bundles");
      else if (r.type === "product-detail") switchTab("products");
      else if (r.type === "extension-detail") switchTab("extensions");
      else if (r.type === "products-list") switchTab("products");
      else if (r.type === "extensions-list") switchTab("extensions");
      else if (r.type === "bundles-list") switchTab("bundles");
      syncAllPanelsFromRoute();
      updateLicenseIssueLink();
      updateProposeLink();
    });
  }

  init();
})();
