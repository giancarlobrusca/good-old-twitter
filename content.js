class TwitterMediaHider {
  constructor() {
    this.isEnabled = true;
    this.observer = null;
    this.init();
  }

  init() {
    chrome.storage.sync.get(["goodOldTwitterEnabled"], (result) => {
      this.isEnabled = result.goodOldTwitterEnabled !== false;
      this.setUpObserver();
      this.hideExistingMedia();
    });

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === "toggle") {
        this.toggle();
        sendResponse({ enabled: this.isEnabled });
      } else if (request.action === "getState") {
        sendResponse({ enabled: this.isEnabled });
      }
    });
  }

  setupObserver() {
    this.observer = new MutationObserver((mutations) => {
      if (!this.isEnabled) return;

      mutations.forEach((mutation) => {
        mutation.addedNotes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            this.hideMediaInElement(node);
          }
        });
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
      // imgs
      '[data-testid="tweetPhoto"]',
      'img[src*="pbs.twimg.com"]',
      'img[src*="ton.twitter.com"]',

      // videos
      '[data-testid="videoComponent"]',
      "video",

      // img cards
      '[data-testid="card.wrapper"] img',

      // promoted content imgs
      '[data-testid="promotedIndicator"] ~ * img',

      // media containers
      '[role="img"]',
      ".css-1dbjc4n img",

      // gifs and animated content
      '[data-testid="gif"]',
      ".tweet-media",

      // any img in tweet content area
      'article img:not([alt*="emoji"]):not([src*="emoji"])',

      // video thumbs
      '[data-testid="previewInterstitial"]',
    ];

    mediaSelectors.forEach((selector) => {
      const elements = element.querySelectorAll
        ? element.querySelectorAll(selector)
        : [element].filter((el) => el.matches && el.matches(selector));

      elements.forEach((el) => {
        if (el && !el.classList.contains("good-old-twitter-hidden")) {
          el.classList.add("good-old-twitter-hidden");
        }
      });
    });
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
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    new TwitterMediaHider();
  });
} else {
  new TwitterMediaHider();
}
