const test = require('node:test');
const assert = require('node:assert/strict');

const { validateJsonSchema } = require('../../src/capabilities/schemaValidator');

test('validateJsonSchema returns schema is missing when schema absent', () => {
  const r = validateJsonSchema({ schema: null, value: {} });
  assert.equal(r.ok, false);
  assert.match(r.errors[0].message, /schema is missing/i);
});

test('validateJsonSchema accepts value matching object schema', () => {
  const r = validateJsonSchema({
    schema: {
      type: 'object',
      required: ['a'],
      additionalProperties: false,
      properties: {
        a: { type: 'string', minLength: 1 },
        b: { type: 'number', minimum: 0, maximum: 10 },
      },
    },
    value: { a: 'ok', b: 3 },
  });
  assert.equal(r.ok, true);
  assert.equal(r.errors.length, 0);
});

test('validateJsonSchema reports required and additional property violations', () => {
  const r = validateJsonSchema({
    schema: {
      type: 'object',
      required: ['id'],
      additionalProperties: false,
      properties: {
        id: { type: 'string' },
      },
    },
    value: { extra: 1 },
    rootPath: 'body',
  });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.message === 'is required'));
  assert.ok(r.errors.some((e) => /additional properties/i.test(e.message)));
});

test('validateJsonSchema checks enum string and array item schemas', () => {
  const badEnum = validateJsonSchema({
    schema: { type: 'string', enum: ['x', 'y'] },
    value: 'z',
  });
  assert.equal(badEnum.ok, false);

  const badItem = validateJsonSchema({
    schema: {
      type: 'array',
      minItems: 1,
      items: { type: 'integer' },
    },
    value: [1, 2.5],
  });
  assert.equal(badItem.ok, false);
  assert.ok(badItem.errors.some((e) => String(e.path).includes('[1]')));
});

test('validateJsonSchema validates boolean and null types', () => {
  const badBool = validateJsonSchema({
    schema: { type: 'boolean' },
    value: 'true',
  });
  assert.equal(badBool.ok, false);
  assert.ok(badBool.errors.some((e) => /expected type "boolean"/i.test(e.message)));

  const badNull = validateJsonSchema({
    schema: { type: 'null' },
    value: 0,
  });
  assert.equal(badNull.ok, false);

  const okNull = validateJsonSchema({ schema: { type: 'null' }, value: null });
  assert.equal(okNull.ok, true);
});

test('validateJsonSchema rejects array when object type expected', () => {
  const r = validateJsonSchema({
    schema: { type: 'object', properties: {} },
    value: [],
    rootPath: 'payload',
  });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.path === 'payload' && /object/i.test(e.message)));
});

test('validateJsonSchema string maxLength and array minItems maxItems', () => {
  const long = validateJsonSchema({
    schema: { type: 'string', maxLength: 3 },
    value: 'abcd',
  });
  assert.equal(long.ok, false);
  assert.ok(long.errors.some((e) => /maxLength/i.test(e.message)));

  const few = validateJsonSchema({
    schema: { type: 'array', minItems: 2, items: { type: 'string' } },
    value: ['a'],
  });
  assert.equal(few.ok, false);

  const many = validateJsonSchema({
    schema: { type: 'array', maxItems: 1, items: { type: 'string' } },
    value: ['a', 'b'],
  });
  assert.equal(many.ok, false);
});

test('validateJsonSchema number rejects NaN and Inf', () => {
  const nan = validateJsonSchema({ schema: { type: 'number' }, value: NaN });
  assert.equal(nan.ok, false);

  const inf = validateJsonSchema({ schema: { type: 'number' }, value: Infinity });
  assert.equal(inf.ok, false);
});

test('validateJsonSchema unknown type keyword skips type check but still validates enum', () => {
  const r = validateJsonSchema({
    schema: { type: 'weird', enum: ['only'] },
    value: 'other',
  });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /must be one of/i.test(e.message)));
});

test('validateJsonSchema nested object reports missing required with dot path', () => {
  const r = validateJsonSchema({
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['outer'],
      properties: {
        outer: {
          type: 'object',
          additionalProperties: false,
          required: ['inner'],
          properties: {
            inner: { type: 'string', minLength: 1 },
          },
        },
      },
    },
    value: { outer: {} },
    rootPath: 'root',
  });
  assert.equal(r.ok, false);
  assert.ok(
    r.errors.some((e) => e.path === 'root.outer.inner' && e.message === 'is required'),
  );
});

test('validateJsonSchema integer rejects non-integer numbers', () => {
  const r = validateJsonSchema({
    schema: { type: 'integer', minimum: 1, maximum: 10 },
    value: 2.5,
  });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /expected type "integer"/i.test(e.message)));
});

test('validateJsonSchema object root rejects null', () => {
  const r = validateJsonSchema({
    schema: { type: 'object', properties: {} },
    value: null,
    rootPath: '$',
  });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.path === '$' && /object/i.test(e.message)));
});

test('validateJsonSchema defaults rootPath to input when omitted', () => {
  const r = validateJsonSchema({
    schema: { type: 'string', minLength: 10 },
    value: 'short',
  });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.path === 'input' && /minLength/i.test(e.message)));
});

test('validateJsonSchema string minLength flags too-short values', () => {
  const r = validateJsonSchema({
    schema: { type: 'string', minLength: 3 },
    value: 'ab',
    rootPath: 'name',
  });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.path === 'name' && /minLength is 3/i.test(e.message)));
});

test('validateJsonSchema number minimum and maximum', () => {
  const low = validateJsonSchema({
    schema: { type: 'number', minimum: 0, maximum: 100 },
    value: -1,
    rootPath: 'score',
  });
  assert.equal(low.ok, false);
  assert.ok(low.errors.some((e) => e.path === 'score' && /minimum is 0/i.test(e.message)));

  const high = validateJsonSchema({
    schema: { type: 'number', minimum: 0, maximum: 100 },
    value: 101,
    rootPath: 'score',
  });
  assert.equal(high.ok, false);
  assert.ok(high.errors.some((e) => e.path === 'score' && /maximum is 100/i.test(e.message)));
});

test('validateJsonSchema nested property type mismatch uses dot path', () => {
  const r = validateJsonSchema({
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        meta: { type: 'object', additionalProperties: false, properties: { count: { type: 'number' } } },
      },
    },
    value: { meta: { count: 'not-a-number' } },
    rootPath: 'body',
  });
  assert.equal(r.ok, false);
  assert.ok(
    r.errors.some((e) => e.path === 'body.meta.count' && /expected type "number"/i.test(e.message)),
  );
});

test('validateJsonSchema treats undefined schema like missing schema', () => {
  const r = validateJsonSchema({ schema: undefined, value: {} });
  assert.equal(r.ok, false);
  assert.equal(r.errors[0].message, 'schema is missing');
});

test('validateJsonSchema non-object properties with additionalProperties false rejects keys', () => {
  const r = validateJsonSchema({
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: 'not-an-object',
    },
    value: { anyKey: 1 },
    rootPath: 'payload',
  });
  assert.equal(r.ok, false);
  assert.ok(
    r.errors.some(
      (e) => e.path === 'payload.anyKey' && /additional properties/i.test(e.message),
    ),
  );
});

test('validateJsonSchema object root rejects icke-objekt value', () => {
  const r = validateJsonSchema({
    schema: { type: 'object', properties: {} },
    value: 'not-an-object',
    rootPath: 'body',
  });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.path === 'body' && /expected type "object"/i.test(e.message)));
});

test('validateJsonSchema array root validerar items med index i path', () => {
  const r = validateJsonSchema({
    schema: { type: 'array', items: { type: 'string' } },
    value: ['ok', 123],
    rootPath: 'items',
  });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.path === 'items[1]' && /expected type "string"/i.test(e.message)));
});

test('validateJsonSchema tillåter extra nycklar när additionalProperties inte är false', () => {
  const r = validateJsonSchema({
    schema: {
      type: 'object',
      properties: { name: { type: 'string', minLength: 1 } },
    },
    value: { name: 'Ada', extraFlag: true },
    rootPath: 'cfg',
  });
  assert.equal(r.ok, true);
  assert.equal(r.errors.length, 0);
});
