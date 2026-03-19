(function () {
  function setButtonState(button, disabled, label) {
    if (!button) {
      return;
    }

    button.disabled = disabled;
    button.setAttribute('aria-busy', disabled ? 'true' : 'false');

    if (label) {
      button.textContent = label;
    }
  }

  function waitForLayout() {
    return new Promise(function (resolve) {
      requestAnimationFrame(function () {
        requestAnimationFrame(resolve);
      });
    });
  }

  function getExportBackgroundColor(root, config) {
    if (config && config.backgroundColor) {
      return config.backgroundColor;
    }

    var rootStyles = window.getComputedStyle(root);
    var bodyStyles = window.getComputedStyle(document.body);
    var cssVar = rootStyles.getPropertyValue('--spec-paper').trim() || bodyStyles.getPropertyValue('--spec-paper').trim();

    return cssVar || '#ffffff';
  }

  async function withMobileExportLayout(root, config, task) {
    var width = Number(config.mobileWidth || 430);
    var original = {
      width: root.style.width,
      maxWidth: root.style.maxWidth,
      marginLeft: root.style.marginLeft,
      marginRight: root.style.marginRight,
      overflow: root.style.overflow,
    };

    document.body.classList.add(config.exportBodyClass || 'pdf-mobile-export');
    root.classList.add(config.exportRootClass || 'pdf-mobile-export-root');
    root.style.width = width + 'px';
    root.style.maxWidth = width + 'px';
    root.style.marginLeft = 'auto';
    root.style.marginRight = 'auto';
    root.style.overflow = 'visible';

    await waitForLayout();

    try {
      return await task();
    } finally {
      document.body.classList.remove(config.exportBodyClass || 'pdf-mobile-export');
      root.classList.remove(config.exportRootClass || 'pdf-mobile-export-root');
      root.style.width = original.width;
      root.style.maxWidth = original.maxWidth;
      root.style.marginLeft = original.marginLeft;
      root.style.marginRight = original.marginRight;
      root.style.overflow = original.overflow;
      await waitForLayout();
    }
  }

  async function buildPdf(root, config) {
    var html2canvas = window.html2canvas;
    var jsPDF = window.jspdf && window.jspdf.jsPDF;

    if (!html2canvas || !jsPDF) {
      throw new Error('missing_pdf_dependencies');
    }

    await withMobileExportLayout(root, config, async function () {
      var width = Math.ceil(root.scrollWidth);
      var height = Math.ceil(root.scrollHeight);
      var backgroundColor = getExportBackgroundColor(root, config);
      var canvas = await html2canvas(root, {
        backgroundColor: backgroundColor,
        scale: 1,
        useCORS: true,
        logging: false,
        windowWidth: width,
        windowHeight: height,
        scrollX: 0,
        scrollY: 0,
      });

      var pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'px',
        format: [canvas.width, canvas.height],
        hotfixes: ['px_scaling'],
        compress: true,
      });

      pdf.addImage(
        canvas.toDataURL('image/png', 1),
        'PNG',
        0,
        0,
        canvas.width,
        canvas.height,
        undefined,
        'FAST'
      );

      pdf.save(config.fileName || 'Patientinformation-Hair-TP-Clinic.pdf');
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    var config = window.hairtpPiPdfConfig || {};
    var button = document.querySelector(config.buttonSelector || '[data-pdf-trigger]');
    var root = document.querySelector(config.rootSelector || '.page-shell');

    if (!button || !root) {
      return;
    }

    var defaultLabel = button.textContent.trim();

    button.addEventListener('click', async function () {
      try {
        setButtonState(button, true, config.loadingLabel || 'Genererar PDF...');
        await buildPdf(root, config);
      } catch (error) {
        console.error('Hair TP PDF export failed', error);
        setButtonState(button, true, config.fallbackLabel || 'Öppnar utskrift...');
        window.print();
      } finally {
        setButtonState(button, false, defaultLabel);
      }
    });
  });
})();
