class TwitterMediaHider {
  constructor() {
    this.isEnabled = true;
    this.observer = null;
    this.avatarGuardObserver = null;

    // Any ancestor matching these is considered an avatar area (include your new wrapper)
    this.AVATAR_CONTAINER_SELECTOR = [
      '[data-testid="Tweet-User-Avatar"]', // wrapper around each tweet's avatar
      '[data-testid^="UserAvatar-Container"]', // actual avatar container (dynamic suffix)
      '[data-testid="UserAvatar"]', // generic
      '[data-testid*="Avatar"]', // catch-alls used around the site
      '[data-testid="SideNav_AccountSwitcher_Button"]', // left nav profile button/avatar
    ].join(",");

    this.init();
  }

  init() {
    if (typeof chrome !== "undefined" && chrome.storage) {
      chrome.storage.sync.get(["goodOldTwitterEnabled"], (result) => {
        if (chrome.runtime.lastError) {
          chrome.storage.local.get(["goodOldTwitterEnabled"], (localResult) => {
            this.isEnabled = localResult.goodOldTwitterEnabled !== false;
            this.setupObserver();
            this.hideExistingMedia();
            this.repairAllAvatars(); // <-- NEW: fix anything hidden already
            this.setupAvatarGuard(); // <-- NEW: live self-healing inside avatar areas
            this.setupPeriodicCleanup();
          });
          return;
        }
        this.isEnabled = result.goodOldTwitterEnabled !== false;
        this.setupObserver();
        this.hideExistingMedia();
        this.repairAllAvatars();
        this.setupAvatarGuard();
        this.setupPeriodicCleanup();
      });

      chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === "sync" && changes.goodOldTwitterEnabled) {
          this.isEnabled = changes.goodOldTwitterEnabled.newValue !== false;
          if (this.isEnabled) {
            this.hideExistingMedia();
            this.repairAllAvatars();
          } else {
            this.showAllMedia();
          }
        }
      });

      chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
        if (request.action === "toggle") {
          this.toggle();
          chrome.storage.sync.set({ goodOldTwitterEnabled: this.isEnabled });
          sendResponse({ enabled: this.isEnabled });
        } else if (request.action === "getState") {
          sendResponse({ enabled: this.isEnabled });
        }
        return true;
      });
    } else {
      this.isEnabled = true;
      this.setupObserver();
      this.hideExistingMedia();
      this.repairAllAvatars();
      this.setupAvatarGuard();
      this.setupPeriodicCleanup();
    }
  }

  // ----------------- OBSERVERS -----------------

  setupObserver() {
    this.observer = new MutationObserver((mutations) => {
      if (!this.isEnabled) return;
      for (const m of mutations) {
        // New nodes: hide media (but never avatars), then repair avatars just in case
        for (const node of m.addedNodes || []) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          this.hideMediaInElement(node);
          this.repairAllAvatars(node);
        }
        // Class changes: if our hide class appears inside an avatar, strip it
        if (m.type === "attributes" && m.attributeName === "class") {
          const el = m.target;
          if (
            el.classList &&
            el.classList.contains("good-old-twitter-hidden") &&
            this.isInsideAvatar(el)
          ) {
            el.classList.remove("good-old-twitter-hidden");
          }
        }
      }
    });

    const start = () => {
      this.observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["class"],
      });
    };
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", start);
    } else {
      start();
    }
  }

  // A tiny, focused observer that watches ONLY avatar zones and undoes hiding instantly
  setupAvatarGuard() {
    if (this.avatarGuardObserver) return;
    this.avatarGuardObserver = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === "attributes" && m.attributeName === "class") {
          const el = m.target;
          if (
            el.classList &&
            el.classList.contains("good-old-twitter-hidden")
          ) {
            el.classList.remove("good-old-twitter-hidden");
          }
        }
        for (const node of m.addedNodes || []) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          // remove hide class in any newly-added subtree within the avatar block
          node
            .querySelectorAll?.(".good-old-twitter-hidden")
            ?.forEach((n) => n.classList.remove("good-old-twitter-hidden"));
        }
      }
    });

    const attachGuards = () => {
      document
        .querySelectorAll(this.AVATAR_CONTAINER_SELECTOR)
        .forEach((zone) => {
          this.avatarGuardObserver.observe(zone, {
            subtree: true,
            childList: true,
            attributes: true,
            attributeFilter: ["class"],
          });
        });
    };

    // Attach now and also whenever the DOM mutates (handled by main observer too)
    attachGuards();
    // Re-attach periodically in case Twitter re-renders big chunks
    setInterval(attachGuards, 3000);
  }

  // ----------------- LOGIC -----------------

  hideExistingMedia() {
    if (!this.isEnabled) return;
    this.hideMediaInElement(document);
  }

  hideMediaInElement(root) {
    const mediaSelectors = [
      // images/videos commonly used in tweets/cards
      'img[src*="twimg.com"]',
      "video",
      '[data-testid="tweetPhoto"]',
      '[data-testid*="card"] img',
      '[data-testid*="card"] video',
      '[data-testid*="card"] [data-testid*="media"]',
      '[data-testid="mediaContainer"]',
      '[data-testid="mediaGrid"]',
      '[data-testid="mediaItem"]',
      '[data-testid="mediaWrapper"]',
      '[data-testid="gif"]',
      '[data-testid="gifContainer"]',
      "article img",
      '[data-testid="tweet"] img',
      '[role="img"]',
    ];

    for (const selector of mediaSelectors) {
      let elements = [];
      try {
        elements = root.querySelectorAll ? root.querySelectorAll(selector) : [];
      } catch (_) {}

      elements.forEach((el) => {
        if (!el || el.classList.contains("good-old-twitter-hidden")) return;
        if (this.shouldHideElement(el)) {
          el.classList.add("good-old-twitter-hidden");
          this.hideParentContainers(el);
        }
      });
    }
  }

  shouldHideElement(el) {
    if (!el) return false;
    // Avatar allowlist ALWAYS wins
    if (this.isInsideAvatar(el)) return false;

    // Icon/emoji/small decorative?
    if (this.isIconEmojiOrDecorative(el)) return false;

    // Otherwise, treat as hideable media if it looks like content
    return this.isMediaContent(el);
  }

  isInsideAvatar(el) {
    if (!el || !el.closest) return false;
    return !!el.closest(this.AVATAR_CONTAINER_SELECTOR);
  }

  isIconEmojiOrDecorative(el) {
    const testId = el.getAttribute?.("data-testid") || "";
    if (testId && testId.toLowerCase().includes("icon")) return true;

    const alt = (el.getAttribute?.("alt") || "").toLowerCase();
    if (alt.includes("icon") || alt.includes("emoji") || alt.includes("avatar"))
      return true;

    const src = el.getAttribute?.("src") || "";
    if (src.includes("emoji") || src.includes("icon")) return true;

    if (el.tagName === "IMG" && el.getBoundingClientRect) {
      const r = el.getBoundingClientRect();
      if (r.width < 24 || r.height < 24) return true;
    }
    return false;
  }

  isMediaContent(el) {
    if (el.tagName === "IMG" || el.tagName === "VIDEO") return true;

    const tid = el.getAttribute?.("data-testid") || "";
    if (
      tid &&
      (tid.includes("media") ||
        tid.includes("photo") ||
        tid.includes("video") ||
        tid.includes("gif"))
    )
      return true;

    if (el.querySelector?.("img, video, [data-testid*='media']")) return true;

    return false;
  }

  hideParentContainers(el) {
    let p = el.parentElement;
    let depth = 0;
    while (p && depth < 3) {
      if (p.classList.contains("good-old-twitter-hidden")) break;
      if (this.isInsideAvatar(p)) break; // NEVER hide avatar ancestors
      if (this.isMediaContainer(p)) p.classList.add("good-old-twitter-hidden");
      p = p.parentElement;
      depth++;
    }
  }

  isMediaContainer(el) {
    if (!el) return false;
    const tid = el.getAttribute?.("data-testid") || "";
    if (
      tid &&
      (tid.includes("media") ||
        tid.includes("photo") ||
        tid.includes("video") ||
        tid.includes("gif"))
    )
      return true;

    const cn = (el.className && el.className.toString()) || "";
    if (cn.includes("media") || cn.includes("photo") || cn.includes("image"))
      return true;

    return !!el.querySelector?.("img, video, [data-testid*='media']");
  }

  // --------------- AVATAR REPAIR -------------

  repairAllAvatars(root = document) {
    try {
      // 1) Remove hide class from any avatar zone or descendant
      const sel = `${this.AVATAR_CONTAINER_SELECTOR}.good-old-twitter-hidden, ${this.AVATAR_CONTAINER_SELECTOR} .good-old-twitter-hidden`;
      root
        .querySelectorAll(sel)
        .forEach((n) => n.classList.remove("good-old-twitter-hidden"));

      // 2) If the <img> inside avatar is still hidden for any reason, unhide all descendants explicitly
      root.querySelectorAll(this.AVATAR_CONTAINER_SELECTOR).forEach((zone) => {
        zone.classList.remove("good-old-twitter-hidden");
        zone
          .querySelectorAll(".good-old-twitter-hidden")
          .forEach((n) => n.classList.remove("good-old-twitter-hidden"));
      });
    } catch (_) {}
  }

  // --------------- GLOBAL --------------------

  showAllMedia() {
    document
      .querySelectorAll(".good-old-twitter-hidden")
      .forEach((el) => el.classList.remove("good-old-twitter-hidden"));
  }

  toggle() {
    this.isEnabled = !this.isEnabled;
    chrome.storage.sync.set({ goodOldTwitterEnabled: this.isEnabled });
    if (this.isEnabled) {
      this.hideExistingMedia();
      this.repairAllAvatars();
    } else {
      this.showAllMedia();
    }
  }

  setupPeriodicCleanup() {
    // Regular sweep for new media
    setInterval(() => {
      if (!this.isEnabled) return;
      this.hideExistingMedia();
      this.repairAllAvatars(); // keep avatars clean
    }, 2000);

    // Occasional deeper sweep
    setInterval(() => {
      if (!this.isEnabled) return;
      this.forceHideAllMedia();
      this.repairAllAvatars(); // repair after the deep pass
    }, 10000);
  }

  forceHideAllMedia() {
    const nodes = [
      ...document.querySelectorAll("img:not(.good-old-twitter-hidden)"),
      ...document.querySelectorAll("video:not(.good-old-twitter-hidden)"),
      ...document.querySelectorAll(
        '[data-testid*="media"]:not(.good-old-twitter-hidden)'
      ),
    ];
    nodes.forEach((el) => {
      if (this.isInsideAvatar(el)) return; // hard allowlist
      if (this.shouldHideElement(el)) {
        el.classList.add("good-old-twitter-hidden");
        this.hideParentContainers(el);
      }
    });
  }
}

(function bootstrap() {
  try {
    new TwitterMediaHider();
  } catch (e) {
    setTimeout(() => {
      try {
        new TwitterMediaHider();
      } catch (e2) {
        console.error("Init failed", e2);
      }
    }, 500);
  }
})();
