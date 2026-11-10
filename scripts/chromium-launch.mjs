/** Resolve a Chromium-family executable for Playwright on Linux, macOS and Windows. */
import {existsSync} from 'node:fs';

const candidates = {
  linux: ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome'],
  darwin: ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium'],
  win32: [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  ],
};

export function chromiumExecutable() {
  const fromEnv = process.env.PULSO_CHROMIUM;
  if (fromEnv) return fromEnv;
  return (candidates[process.platform] ?? []).find(existsSync) ?? '/usr/bin/chromium';
}

export function chromiumLaunchOptions(extra = {}) {
  return {executablePath: chromiumExecutable(), headless: true, chromiumSandbox: true, ...extra};
}
