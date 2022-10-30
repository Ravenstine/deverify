const BADGED_TYPES = [
  'videoRenderer',
  'compactVideoRenderer',
  'channelRenderer',
  'richItemRenderer',
];
const decoder = new TextDecoder("utf-8");
const encoder = new TextEncoder();

let deverifyIsEnabled = false;

(function boot() {
  (async function () {
    deverifyIsEnabled = Boolean(
      (await browser.storage.local.get('deverifyIsEnabled'))?.deverifyIsEnabled
    )
  })();

  browser.webRequest.onBeforeRequest.addListener(
    (details) => {
      const url = new URL(details.url);

      if (/\/youtubei\/v1\//.test(url.pathname)) {
        onAPIRequest(details);
      }
    },
    {
      urls: ['https://www.youtube.com/*'],
      types: ['xmlhttprequest'],
    },
    ['blocking']
  );

  browser.webRequest.onBeforeRequest.addListener(
    onResultsSSR,
    {
      urls: ['https://www.youtube.com/*'],
      types: ['main_frame', 'sub_frame', 'object'],
    },
    ['blocking']
  );

  async function updateStatus () {
    deverifyIsEnabled = !deverifyIsEnabled;

    await browser.storage.local.set({ deverifyIsEnabled });

    updateIcon(deverifyIsEnabled);
  };

  browser.browserAction.onClicked.addListener(updateStatus);

  updateStatus();
})();

function onAPIRequest(details) {
  const filter = browser.webRequest.filterResponseData(details.requestId);

  let body = '';

  filter.ondata = (event) => {
    body += decoder.decode(event.data, {stream: true});
  };

  filter.onstop = (event) => {
    try {
      const results = JSON.parse(body);

      if (deverifyIsEnabled) {
        deverifyResults(results);
      }

      filter.write(
        encoder.encode(JSON.stringify(results))
      );
    } finally {
      filter.disconnect();
    }
  };
}

function onResultsSSR(details) {
  const filter = browser.webRequest.filterResponseData(details.requestId);

  let body = '';

  filter.ondata = (event) => {
    body += decoder.decode(event.data, {stream: true});
  };

  filter.onstop = (event) => {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(body, 'text/html');

      if (deverifyIsEnabled) {
        const scripts = doc.getElementsByTagName('script');

        for (const script of scripts) {
          const ytInitialData =
            script.textContent?.match(/^\s*var\s*ytInitialData\s*=\s*(.*);/m)?.[1];

          if (!ytInitialData) continue;

          const results = JSON.parse(ytInitialData);

          deverifyResults(results);

          script.textContent = `var ytInitialData = ${JSON.stringify(results)};`;
        }
      }

      filter.write(
        encoder.encode(doc.documentElement.outerHTML)
      );
    } finally {
      filter.disconnect();
    }
  };
}

function deverifyResults(results) {
  if (typeof results !== 'object' || results === null) return;

  for (const key in results) {
    const value = results[key];

    if (!Array.isArray(value)) {
      deverifyResults(value);

      continue;
    }

    const filteredCollection = [];

    for (const item of value) {
      if (
        item.shelfRenderer ||
        item.horizontalCardListRenderer
      ) continue;

      if (
        !item ||
        !BADGED_TYPES.some(type => item[type])
      ) {
        deverifyResults(item);

        filteredCollection.push(item);

        continue;
      }

      const type = Object.keys(item)[0];
      const isVerified =
        getIsVerified(item[type]) ||
        getIsVerified(
          item[type].content?.[Object.keys(item[type].content)]
        );

      if (!isVerified)
        filteredCollection.push(item);
    }

    results[key] = filteredCollection;
  }
}

function getIsVerified(item) {
  return Boolean(
    item?.ownerBadges?.some(badge =>
      badge.metadataBadgeRenderer?.style === 'BADGE_STYLE_TYPE_VERIFIED' ||
      badge.metadataBadgeRenderer?.style === 'BADGE_STYLE_TYPE_VERIFIED_ARTIST'
    )
  );
}

function updateIcon(isEnabled) {
  if (isEnabled) {
    browser.browserAction.setIcon({ path: 'icons/enabled.png' });
  } else {
    browser.browserAction.setIcon({ path: 'icons/disabled.png' });
  }
}
