let deverifyIsEnabled = false;

async function updateState() {
  deverifyIsEnabled = (await browser.storage.local.get('deverifyIsEnabled')).deverifyIsEnabled;
}

updateState();

browser.storage.local.onChanged.addListener(updateState);
