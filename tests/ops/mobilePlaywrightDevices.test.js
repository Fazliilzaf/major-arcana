const test = require('node:test');
const assert = require('node:assert/strict');

const {
  resolveAndroidDeviceProfile,
  resolveMobileDeviceProfile,
  listAndroidDeviceProfiles,
} = require('../../scripts/lib/mobilePlaywrightDevices');

test('resolveMobileDeviceProfile defaults to iPhone 13', () => {
  const profile = resolveMobileDeviceProfile('');
  assert.equal(profile.id, 'iphone-13');
  assert.equal(profile.platform, 'ios');
});

test('resolveAndroidDeviceProfile defaults to Pixel 5', () => {
  const profile = resolveAndroidDeviceProfile('');
  assert.equal(profile.id, 'pixel-5');
  assert.equal(profile.platform, 'android');
});

test('resolveAndroidDeviceProfile accepts galaxy-s9', () => {
  const profile = resolveAndroidDeviceProfile('galaxy-s9');
  assert.equal(profile.id, 'galaxy-s9');
});

test('listAndroidDeviceProfiles includes Pixel and Galaxy', () => {
  const ids = listAndroidDeviceProfiles().map((item) => item.id).sort();
  assert.deepEqual(ids, ['galaxy-s9', 'pixel-5']);
});
