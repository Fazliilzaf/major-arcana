const test = require('node:test');
const assert = require('node:assert/strict');

const { requestContextMiddleware, getRequestContext } = require('../../src/observability/requestContext');

function createReq(headers = {}) {
  return {
    headers: { ...headers },
    get(name) {
      const want = String(name).toLowerCase();
      for (const [key, value] of Object.entries(this.headers)) {
        if (String(key).toLowerCase() === want) return value;
      }
      return undefined;
    },
  };
}

function createRes() {
  const headers = {};
  return {
    setHeader(n, v) {
      headers[String(n).toLowerCase()] = String(v);
    },
    getHeader(name) {
      return headers[String(name).toLowerCase()];
    },
  };
}

test('requestContextMiddleware preserves valid x-correlation-id', () => {
  const mw = requestContextMiddleware({ headerName: 'x-correlation-id' });
  const req = createReq({ 'x-correlation-id': 'tenant-1.req_abc:9' });
  const res = createRes();

  mw(req, res, () => {
    assert.equal(req.correlationId, 'tenant-1.req_abc:9');
    assert.equal(res.getHeader('x-correlation-id'), 'tenant-1.req_abc:9');
    const ctx = getRequestContext();
    assert.ok(ctx);
    assert.equal(ctx.correlationId, 'tenant-1.req_abc:9');
    assert.ok(typeof ctx.startedAt === 'string');
  });
});

test('requestContextMiddleware generates UUID when header missing or invalid', () => {
  const mw = requestContextMiddleware({ headerName: 'x-correlation-id' });
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  const req1 = createReq({});
  const res1 = createRes();
  mw(req1, res1, () => {
    assert.match(req1.correlationId, uuidRe);
    assert.equal(res1.getHeader('x-correlation-id'), req1.correlationId);
  });

  const req2 = createReq({ 'x-correlation-id': 'has space' });
  const res2 = createRes();
  mw(req2, res2, () => {
    assert.match(req2.correlationId, uuidRe);
  });

  const req3 = createReq({ 'x-correlation-id': `${'a'.repeat(121)}` });
  const res3 = createRes();
  mw(req3, res3, () => {
    assert.match(req3.correlationId, uuidRe);
  });
});

test('requestContextMiddleware tom eller blank korrelations-header ger UUID', () => {
  const mw = requestContextMiddleware();
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const reqEmpty = createReq({ 'x-correlation-id': '' });
  const resEmpty = createRes();
  mw(reqEmpty, resEmpty, () => {
    assert.match(reqEmpty.correlationId, uuidRe);
  });
  const reqBlank = createReq({ 'x-correlation-id': '   \t  ' });
  const resBlank = createRes();
  mw(reqBlank, resBlank, () => {
    assert.match(reqBlank.correlationId, uuidRe);
  });
});

test('requestContextMiddleware använder custom headerName och accepterar punkt/underscore/kolon', () => {
  const mw = requestContextMiddleware({ headerName: '  X-Trace-Id  ' });
  const cid = 'svc.prod.req_01:abc._-Z9';
  const req = createReq({ 'x-trace-id': cid });
  const res = createRes();
  mw(req, res, () => {
    assert.equal(req.correlationId, cid);
    assert.equal(res.getHeader('x-trace-id'), cid);
    assert.equal(getRequestContext().correlationId, cid);
  });
});

test('requestContextMiddleware faller tillbaka till x-correlation-id vid blankt headerName', () => {
  const mw = requestContextMiddleware({ headerName: '   ' });
  const req = createReq({ 'x-correlation-id': 'tenant.req:1' });
  const res = createRes();
  mw(req, res, () => {
    assert.equal(req.correlationId, 'tenant.req:1');
    assert.equal(res.getHeader('x-correlation-id'), 'tenant.req:1');
  });
});

test('getRequestContext returns null outside middleware scope', () => {
  assert.equal(getRequestContext(), null);
});

test('requestContextMiddleware avvisar korrelations-id med ogiltiga tecken', () => {
  const mw = requestContextMiddleware({ headerName: 'x-correlation-id' });
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  const req = createReq({ 'x-correlation-id': 'bad/value\nwith-tab\t' });
  const res = createRes();
  mw(req, res, () => {
    assert.match(req.correlationId, uuidRe);
    assert.equal(res.getHeader('x-correlation-id'), req.correlationId);
  });
});

test('request context lever kvar över await inom samma middleware-scope', async () => {
  const mw = requestContextMiddleware({ headerName: 'x-correlation-id' });
  const req = createReq({ 'x-correlation-id': 'scope.await.123' });
  const res = createRes();

  await new Promise((resolve, reject) => {
    mw(req, res, async () => {
      try {
        assert.equal(getRequestContext().correlationId, 'scope.await.123');
        await Promise.resolve();
        assert.equal(getRequestContext().correlationId, 'scope.await.123');
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  });
});

test('requestContextMiddleware trimmar giltigt korrelations-id', () => {
  const mw = requestContextMiddleware();
  const req = createReq({ 'x-correlation-id': '  tenant.req:1  ' });
  const res = createRes();
  mw(req, res, () => {
    assert.equal(req.correlationId, 'tenant.req:1');
    assert.equal(res.getHeader('x-correlation-id'), 'tenant.req:1');
  });
});

test('requestContextMiddleware accepterar korrelations-id med exakt 120 tecken', () => {
  const cid = 'a'.repeat(120);
  assert.equal(cid.length, 120);
  const mw = requestContextMiddleware();
  const req = createReq({ 'x-correlation-id': cid });
  const res = createRes();
  mw(req, res, () => {
    assert.equal(req.correlationId, cid);
  });
});

test('requestContextMiddleware avvisar id med ogiltiga tecken som @ eller komma', () => {
  const mw = requestContextMiddleware();
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const req = createReq({ 'x-correlation-id': 'trace@svc,1' });
  const res = createRes();
  mw(req, res, () => {
    assert.match(req.correlationId, uuidRe);
  });
});

test('requestContextMiddleware avvisar plus i korrelations-id', () => {
  const mw = requestContextMiddleware();
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const req = createReq({ 'x-correlation-id': 'trace+1' });
  const res = createRes();
  mw(req, res, () => {
    assert.match(req.correlationId, uuidRe);
  });
});

test('requestContextMiddleware avvisar icke-ASCII i korrelations-id', () => {
  const mw = requestContextMiddleware();
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const req = createReq({ 'x-correlation-id': 'trace-åäö' });
  const res = createRes();
  mw(req, res, () => {
    assert.match(req.correlationId, uuidRe);
  });
});
