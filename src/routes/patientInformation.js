const express = require('express');

// Patientinformation static pages + PDF-exports. Mounted at "/" by server.js.
// Extracted from server.js (legacy monolit) — se ORGANISATION.md §4.
// Beroenden injiceras: publicRoot (sökväg till /public) och sendStaticPagePdf
// (PDF-render-helper som bor kvar i server.js).
function createPatientInformationRouter({ publicRoot, sendStaticPagePdf }) {
  const router = express.Router();

  router.get('/patientinformation/hartransplantation-dhi-prp', (_req, res) => {
    res.sendFile('patientinformation-hartransplantation-dhi-prp.html', {
      root: publicRoot,
    });
  });

  router.get('/patientinformation/hartransplantation-dhi-prp-minimal', (_req, res) => {
    res.sendFile('patientinformation-hartransplantation-dhi-prp-minimal.html', {
      root: publicRoot,
    });
  });

  router.get('/patientinformation/hartransplantation-dhi-prp-minimal.pdf', (req, res) =>
    sendStaticPagePdf(req, res, {
      pagePath: '/patientinformation/hartransplantation-dhi-prp-minimal',
      fileName: 'Patientinformation-Hartransplantation-DHI-och-PRP-Hair-TP-Clinic-Minimal.pdf',
      media: 'screen',
      viewport: { width: 1100, height: 1600 },
      bodyClass: 'pdf-server-export',
      pdfOptions: {
        format: 'A4',
        printBackground: true,
        displayHeaderFooter: false,
        margin: {
          top: '10mm',
          right: '10mm',
          bottom: '12mm',
          left: '10mm',
        },
      },
    })
  );

  router.get('/patientinformation/hartransplantation-dhi-prp.pdf', (req, res) =>
    sendStaticPagePdf(req, res, {
      pagePath: '/patientinformation/hartransplantation-dhi-prp?export=pdf',
      fileName: 'Patientinformation-Hartransplantation-DHI-och-PRP-Hair-TP-Clinic.pdf',
      media: 'screen',
      viewport: { width: 430, height: 932 },
      pageOptions: { deviceScaleFactor: 2 },
      bodyClass: 'pdf-server-export',
      rasterizePage: true,
    })
  );

  router.get('/patientinformation/ogonlocksplastik-curatiio.pdf', (req, res) =>
    sendStaticPagePdf(req, res, {
      pagePath: '/patientinformation-ogonlocksplastik-curatiio.html?v=20260309b',
      fileName: 'Patientinformation-Ogonlocksplastik-Curatiio.pdf',
      media: 'screen',
      viewport: { width: 430, height: 932 },
      pageOptions: { deviceScaleFactor: 2 },
      bodyClass: 'pdf-server-export',
      rasterizePage: true,
    })
  );

  return router;
}

module.exports = { createPatientInformationRouter };
