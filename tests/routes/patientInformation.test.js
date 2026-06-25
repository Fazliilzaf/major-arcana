const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const express = require('express');

const { createPatientInformationRouter } = require('../../src/routes/patientInformation');

function makePublicRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arcana-patientinfo-'));
  fs.writeFileSync(
    path.join(dir, 'patientinformation-hartransplantation-dhi-prp.html'),
    '<html>full</html>'
  );
  fs.writeFileSync(
    path.join(dir, 'patientinformation-hartransplantation-dhi-prp-minimal.html'),
    '<html>minimal</html>'
  );
  return dir;
}

async function withServer({ publicRoot, sendStaticPagePdf }, run) {
  const app = express();
  app.use(createPatientInformationRouter({ publicRoot, sendStaticPagePdf }));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    await run(baseUrl);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

const noopPdf = (_req, res) => res.json({ ok: true });

test('HTML-routes serverar rätt fil från publicRoot', async () => {
  const publicRoot = makePublicRoot();
  await withServer({ publicRoot, sendStaticPagePdf: noopPdf }, async (baseUrl) => {
    const full = await fetch(`${baseUrl}/patientinformation/hartransplantation-dhi-prp`);
    assert.equal(full.status, 200);
    assert.match(await full.text(), /full/);

    const minimal = await fetch(`${baseUrl}/patientinformation/hartransplantation-dhi-prp-minimal`);
    assert.equal(minimal.status, 200);
    assert.match(await minimal.text(), /minimal/);
  });
});

test('PDF-routes delegerar till sendStaticPagePdf med rätt fileName', async () => {
  const calls = [];
  const stubPdf = (_req, res, opts) => {
    calls.push(opts.fileName);
    res.json({ fileName: opts.fileName });
  };
  await withServer({ publicRoot: '/tmp', sendStaticPagePdf: stubPdf }, async (baseUrl) => {
    const a = await fetch(`${baseUrl}/patientinformation/hartransplantation-dhi-prp-minimal.pdf`);
    assert.equal(
      (await a.json()).fileName,
      'Patientinformation-Hartransplantation-DHI-och-PRP-Hair-TP-Clinic-Minimal.pdf'
    );

    const b = await fetch(`${baseUrl}/patientinformation/hartransplantation-dhi-prp.pdf`);
    assert.equal(
      (await b.json()).fileName,
      'Patientinformation-Hartransplantation-DHI-och-PRP-Hair-TP-Clinic.pdf'
    );

    const c = await fetch(`${baseUrl}/patientinformation/ogonlocksplastik-curatiio.pdf`);
    assert.equal((await c.json()).fileName, 'Patientinformation-Ogonlocksplastik-Curatiio.pdf');

    assert.equal(calls.length, 3);
  });
});
