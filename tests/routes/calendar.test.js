const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');

const { createCalendarRouter } = require('../../src/routes/calendar');

async function withServer(run) {
  const app = express();
  app.use('/api/v1', createCalendarRouter());
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}/api/v1`;
  try {
    await run(baseUrl);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('GET /calendar/day returnerar ok + dagvy', async () => {
  await withServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/calendar/day?date=2026-06-24`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
  });
});

test('GET /calendar/week returnerar ok + veckovy', async () => {
  await withServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/calendar/week?startDate=2026-06-22`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
  });
});

test('GET /calendar/ical/:resourceId.ics returnerar iCal-feed', async () => {
  await withServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/calendar/ical/all.ics`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') || '', /text\/calendar/);
    const text = await res.text();
    assert.match(text, /BEGIN:VCALENDAR/);
  });
});
