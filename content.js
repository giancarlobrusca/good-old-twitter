class TwitterMediaHider {
  constructor() {
    this.isEnabled = true;
    this.observer = null;
    this.init();
  }

  init() {
    if (
      typeof chrome !== "undefined" &&
      chrome.storage &&
      chrome.storage.sync
    ) {
      chrome.storage.sync.get(["goodOldTwitterEnabled"], (result) => {
        this.isEnabled = result.goodOldTwitterEnabled !== false;
        this.setupObserver();
        this.hideExistingMedia();
        this.setupPeriodicCleanup();
      });

      // Escuchar cambios en el storage
      chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === "sync" && changes.goodOldTwitterEnabled) {
          this.isEnabled = changes.goodOldTwitterEnabled.newValue !== false;
          if (this.isEnabled) {
            this.hideExistingMedia();
          } else {
            this.showAllMedia();
          }
        }
      });

      chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === "toggle") {
          this.toggle();
          sendResponse({ enabled: this.isEnabled });
        } else if (request.action === "getState") {
          sendResponse({ enabled: this.isEnabled });
        }
        return true; // Mantener el mensaje activo para async response
      });
    } else {
      console.log("Chrome Storage API not available, using default settings.");
      this.isEnabled = true;
      this.setupObserver();
      this.hideExistingMedia();
      this.setupPeriodicCleanup();
    }
  }

  setupObserver() {
    this.observer = new MutationObserver((mutations) => {
      if (!this.isEnabled || !mutations) return;

      mutations.forEach((mutation) => {
        if (mutation.addedNodes) {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              this.hideMediaInElement(node);
            }
          });
        }
      });
    });

    if (document.body) {
      this.observer.observe(document.body, {
        childList: true,
        subtree: true,
      });
    } else {
      document.addEventListener("DOMContentLoaded", () => {
        this.observer.observe(document.body, {
          childList: true,
          subtree: true,
        });
      });
    }
  }

  hideExistingMedia() {
    if (!this.isEnabled) return;
    this.hideMediaInElement(document);
  }

  hideMediaInElement(element) {
    const mediaSelectors = [
      // Images - more aggressive
      'img[src*="pbs.twimg.com"]',
      'img[src*="ton.twitter.com"]',
      'img[src*="video_thumb"]',
      'img[src*="twimg.com"]:not([alt*="emoji"]):not([src*="emoji"])',
      'img[class*="css-"]:not([alt*="emoji"]):not([src*="emoji"])',
      'img[alt="Imagen"]',
      'img[alt="Image"]',
      'img[alt*="photo"]',
      'img[alt*="Photo"]',

      // Video elements
      "video",
      '[data-testid="videoComponent"]',
      '[data-testid="videoPlayer"]',

      // Media containers and placeholders
      '[data-testid="tweetPhoto"]',
      '[data-testid="card.layoutLarge.media"]',
      '[data-testid="card.layoutSmall.media"]',
      '[data-testid="card.layoutMedium.media"]',
      '[data-testid="card.layoutProminent.media"]',

      // GIF containers
      '[data-testid="gif"]',
      '[data-testid="gifContainer"]',

      // Role based
      '[role="img"]:not([aria-label*="emoji"])',

      // Media within tweet content
      'article img:not([alt*="emoji"]):not([src*="emoji"]):not([data-testid*="icon"])',
      '[data-testid="tweet"] img:not([alt*="emoji"]):not([src*="emoji"]):not([data-testid*="icon"])',
      '[data-testid="tweetText"] ~ * img',

      // Video previews and thumbnails
      '[data-testid="previewInterstitial"]',
      '[data-testid="videoPreview"]',

      // Card media - more comprehensive
      '[data-testid*="card"] img',
      '[data-testid*="card"] video',
      '[data-testid*="card"] [data-testid*="media"]',

      // Additional media selectors
      '[data-testid="mediaContainer"]',
      '[data-testid="mediaGrid"]',
      '[data-testid="mediaItem"]',
      '[data-testid="mediaWrapper"]',

      // Profile media
      '[data-testid="profileImage"]:not([alt*="avatar"]):not([alt*="profile"])',

      // Any element with media-related classes
      '[class*="media"]:not([class*="social"]):not([class*="social-media"])',
      '[class*="photo"]:not([class*="profile"])',
      '[class*="image"]:not([class*="profile"])',
    ];

    mediaSelectors.forEach((selector) => {
      try {
        const elements = element.querySelectorAll
          ? element.querySelectorAll(selector)
          : [element].filter((el) => el.matches && el.matches(selector));

        elements.forEach((el) => {
          if (el && !el.classList.contains("good-old-twitter-hidden")) {
            const isMediaContent = this.isMediaContent(el);
            if (isMediaContent) {
              el.classList.add("good-old-twitter-hidden");

              // Also hide parent containers that might still take space
              this.hideParentContainers(el);
            }
          }
        });
      } catch (error) {
        // Ignorar errores de selectores inválidos
      }
    });
  }

  hideParentContainers(element) {
    // Hide parent containers that might still take space
    let parent = element.parentElement;
    let depth = 0;
    const maxDepth = 3; // Limit depth to avoid hiding too much

    while (parent && depth < maxDepth) {
      if (parent.classList.contains("good-old-twitter-hidden")) {
        break;
      }

      // Check if parent is a media container
      const isMediaContainer = this.isMediaContainer(parent);
      if (isMediaContainer) {
        parent.classList.add("good-old-twitter-hidden");
      }

      parent = parent.parentElement;
      depth++;
    }
  }

  isMediaContainer(element) {
    if (!element) return false;

    // Check data-testid for media-related attributes
    const testId = element.getAttribute("data-testid") || "";
    if (
      testId.includes("media") ||
      testId.includes("photo") ||
      testId.includes("video") ||
      testId.includes("gif")
    ) {
      return true;
    }

    // Check classes for media-related classes
    const className = element.className || "";
    if (
      className.includes("media") ||
      className.includes("photo") ||
      className.includes("image")
    ) {
      return true;
    }

    // Check if element contains media elements
    const hasMediaChildren = element.querySelector(
      'img, video, [data-testid*="media"]'
    );
    if (hasMediaChildren) {
      return true;
    }

    return false;
  }

  isMediaContent(element) {
    if (
      element.hasAttribute("data-testid") &&
      element.getAttribute("data-testid").includes("icon")
    ) {
      return false;
    }

    if (element.tagName === "IMG") {
      const rect = element.getBoundingClientRect();
      if (rect.width < 32 || rect.height < 32) {
        return false;
      }
    }

    const alt = element.getAttribute("alt") || "";
    if (
      alt.toLowerCase().includes("icon") ||
      alt.toLowerCase().includes("emoji") ||
      alt.toLowerCase().includes("avatar")
    ) {
      return false;
    }

    const src = element.getAttribute("src") || "";
    if (src.includes("emoji") || src.includes("icon")) {
      return false;
    }

    return true;
  }

  showAllMedia() {
    const hiddenElements = document.querySelectorAll(
      ".good-old-twitter-hidden"
    );
    hiddenElements.forEach((el) => {
      el.classList.remove("good-old-twitter-hidden");
    });
  }

  toggle() {
    this.isEnabled = !this.isEnabled;

    chrome.storage.sync.set({ goodOldTwitterEnabled: this.isEnabled });

    if (this.isEnabled) {
      this.hideExistingMedia();
    } else {
      this.showAllMedia();
    }
  }

  setupPeriodicCleanup() {
    // Clean up every 2 seconds to catch any missed media
    setInterval(() => {
      if (this.isEnabled) {
        this.hideExistingMedia();
      }
    }, 2000);

    // More aggressive cleanup every 10 seconds
    setInterval(() => {
      if (this.isEnabled) {
        this.forceHideAllMedia();
      }
    }, 10000);
  }

  forceHideAllMedia() {
    // Force hide any remaining media elements
    const allImages = document.querySelectorAll(
      "img:not(.good-old-twitter-hidden)"
    );
    const allVideos = document.querySelectorAll(
      "video:not(.good-old-twitter-hidden)"
    );

    [...allImages, ...allVideos].forEach((el) => {
      if (this.isMediaContent(el)) {
        el.classList.add("good-old-twitter-hidden");
        this.hideParentContainers(el);
      }
    });

    // Also check for any media containers that might have been missed
    const mediaContainers = document.querySelectorAll(
      '[data-testid*="media"]:not(.good-old-twitter-hidden)'
    );
    mediaContainers.forEach((container) => {
      if (this.isMediaContainer(container)) {
        container.classList.add("good-old-twitter-hidden");
      }
    });
  }

  // Additional aggressive hiding for stubborn elements
  aggressiveHide() {
    // Hide any element that looks like it contains media
    const potentialMediaElements = document.querySelectorAll(
      "*:not(.good-old-twitter-hidden)"
    );

    potentialMediaElements.forEach((el) => {
      if (el.tagName === "IMG" || el.tagName === "VIDEO") {
        if (this.isMediaContent(el)) {
          el.classList.add("good-old-twitter-hidden");
          this.hideParentContainers(el);
        }
      } else if (el.querySelector && el.querySelector("img, video")) {
        // If element contains media, hide it
        if (this.isMediaContainer(el)) {
          el.classList.add("good-old-twitter-hidden");
        }
      }
    });
  }
}

function initializeExtension() {
  try {
    new TwitterMediaHider();
  } catch (error) {
    console.log("Good Old Twitter: Initialization Error, retrying...", error);
    setTimeout(() => {
      try {
        new TwitterMediaHider();
      } catch (retryError) {
        console.error(
          "Good Old Twitter: Failed to initialize after retry",
          retryError
        );
      }
    }, 1000);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeExtension);
} else {
  initializeExtension();
}
