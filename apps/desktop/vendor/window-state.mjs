// OpenCode 014614d35b397775e5d397a490fc72368c894ec2 · MIT; see THIRD_PARTY_NOTICES.md
const destroyedWindowURL = "<destroyed>";
function safeWebContentsURL(webContents) {
  try {
    if (webContents.isDestroyed()) return destroyedWindowURL;
    return webContents.getURL();
  } catch {
    return destroyedWindowURL;
  }
}
function safeWindowURL(win) {
  try {
    if (win.isDestroyed()) return destroyedWindowURL;
    return safeWebContentsURL(win.webContents);
  } catch {
    return destroyedWindowURL;
  }
}
export {
  destroyedWindowURL,
  safeWebContentsURL,
  safeWindowURL
};
