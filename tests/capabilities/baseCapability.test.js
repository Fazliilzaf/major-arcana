const test = require('node:test');
const assert = require('node:assert/strict');

const { BaseCapability, isBaseCapabilityClass } = require('../../src/capabilities/baseCapability');

test('isBaseCapabilityClass is true for subclasses only', () => {
  assert.equal(isBaseCapabilityClass(BaseCapability), false);
  assert.equal(isBaseCapabilityClass(null), false);
  assert.equal(isBaseCapabilityClass(function () {}), false);

  class Demo extends BaseCapability {
    static name = 'Demo';
    static version = '0.0.0';
  }
  assert.equal(isBaseCapabilityClass(Demo), true);
});

test('BaseCapability execute rejects until overridden', async () => {
  await assert.rejects(() => new BaseCapability().execute({}), /Not implemented/);
});

test('isBaseCapabilityClass ar false for icke-subklasser och icke-funktioner', () => {
  class Plain {}
  assert.equal(isBaseCapabilityClass(Plain), false);
  assert.equal(isBaseCapabilityClass({}), false);
  assert.equal(isBaseCapabilityClass('Fn'), false);
  assert.equal(isBaseCapabilityClass(1), false);
});

test('subklass kan overridea execute med egen implementation', async () => {
  class Ok extends BaseCapability {
    static name = 'Ok';
    static version = '1.0.0';
    async execute() {
      return { ok: true };
    }
  }
  assert.deepEqual(await new Ok().execute(), { ok: true });
});

test('isBaseCapabilityClass ar true for indirekt subklass av BaseCapability', () => {
  class Middle extends BaseCapability {
    static name = 'Middle';
    static version = '1.0.0';
  }
  class Leaf extends Middle {
    static name = 'Leaf';
    static version = '1.0.0';
  }
  assert.equal(isBaseCapabilityClass(Middle), true);
  assert.equal(isBaseCapabilityClass(Leaf), true);
});

test('BaseCapability har forvantade statiska risk- och audit-flaggor', () => {
  assert.equal(BaseCapability.requiresInputRisk, true);
  assert.equal(BaseCapability.requiresOutputRisk, true);
  assert.equal(BaseCapability.requiresPolicyFloor, true);
  assert.equal(BaseCapability.auditStrategy, 'always');
  assert.equal(BaseCapability.persistStrategy, 'none');
});
