chrome.action.onClicked.addListener(async (tab) => {
  const reader = new URL(chrome.runtime.getURL('reader.html'));
  let source = tab.url || '';
  try {
    const url = new URL(source);
    // ACL landing pages have a stable PDF counterpart.
    if (url.hostname === 'aclanthology.org' && /^\/[\w.-]+\/$/.test(url.pathname)) {
      url.pathname = url.pathname.replace(/\/$/, '.pdf');
      source = url.href;
    }
    if (/^(https?|file):$/.test(url.protocol)) reader.searchParams.set('source', source);
  } catch { /* Internal tabs open the local file chooser. */ }
  await chrome.tabs.create({url: reader.href});
});
