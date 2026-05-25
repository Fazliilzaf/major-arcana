'use strict';

const { devices } = require('playwright');

/** Playwright device profiles for CCO mobil verify (BL.3 Android + befintlig iPhone). */
const MOBILE_DEVICE_PROFILES = {
  'iphone-13': {
    id: 'iphone-13',
    label: 'iPhone 13',
    platform: 'ios',
    context: devices['iPhone 13'],
  },
  'pixel-5': {
    id: 'pixel-5',
    label: 'Pixel 5',
    platform: 'android',
    context: devices['Pixel 5'],
  },
  'galaxy-s9': {
    id: 'galaxy-s9',
    label: 'Galaxy S9+',
    platform: 'android',
    context: devices['Galaxy S9+'],
  },
};

const DEFAULT_MOBILE_DEVICE = 'iphone-13';
const DEFAULT_ANDROID_DEVICE = 'pixel-5';

function normalizeDeviceKey(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-');
}

function resolveMobileDeviceProfile(input = process.env.ARCANA_MOBILE_DEVICE || DEFAULT_MOBILE_DEVICE) {
  const key = normalizeDeviceKey(input);
  const profile = MOBILE_DEVICE_PROFILES[key] || MOBILE_DEVICE_PROFILES[DEFAULT_MOBILE_DEVICE];
  return profile;
}

function resolveAndroidDeviceProfile(input = process.env.ARCANA_ANDROID_DEVICE || DEFAULT_ANDROID_DEVICE) {
  const key = normalizeDeviceKey(input);
  const profile = MOBILE_DEVICE_PROFILES[key];
  if (profile?.platform === 'android') return profile;
  return MOBILE_DEVICE_PROFILES[DEFAULT_ANDROID_DEVICE];
}

function mobileBrowserContextOptions(profile, extra = {}) {
  const safe = profile || MOBILE_DEVICE_PROFILES[DEFAULT_MOBILE_DEVICE];
  return {
    ...safe.context,
    locale: 'sv-SE',
    ...extra,
  };
}

function listAndroidDeviceProfiles() {
  return Object.values(MOBILE_DEVICE_PROFILES).filter((item) => item.platform === 'android');
}

module.exports = {
  DEFAULT_ANDROID_DEVICE,
  DEFAULT_MOBILE_DEVICE,
  MOBILE_DEVICE_PROFILES,
  listAndroidDeviceProfiles,
  mobileBrowserContextOptions,
  normalizeDeviceKey,
  resolveAndroidDeviceProfile,
  resolveMobileDeviceProfile,
};
