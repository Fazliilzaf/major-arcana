const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.join(__dirname, '..', '..');

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
}

test('CFO segment modules are imported from src/cfo', () => {
  const modules = {
    cfoExpenseExporter: require('../../src/cfo/cfoExpenseExporter'),
    cfoExpenseRuleStore: require('../../src/cfo/cfoExpenseRuleStore'),
    cfoExpenseStore: require('../../src/cfo/cfoExpenseStore'),
    cfoExpenseVatRules: require('../../src/cfo/cfoExpenseVatRules'),
    cfoFinanceDashboardBuilder: require('../../src/cfo/cfoFinanceDashboardBuilder'),
    cfoFinanceMonthlyCloseStore: require('../../src/cfo/cfoFinanceMonthlyCloseStore'),
    cfoFinanceReportEngine: require('../../src/cfo/cfoFinanceReportEngine'),
    cfoFinanceReportPackager: require('../../src/cfo/cfoFinanceReportPackager'),
    cfoFinanceReviewPackager: require('../../src/cfo/cfoFinanceReviewPackager'),
    cfoFinanceReviewStore: require('../../src/cfo/cfoFinanceReviewStore'),
    cfoFinanceVendorStore: require('../../src/cfo/cfoFinanceVendorStore'),
    cfoFortnoxClient: require('../../src/cfo/cfoFortnoxClient'),
    cfoFortnoxConnector: require('../../src/cfo/cfoFortnoxConnector'),
    cfoFortnoxInvoiceLister: require('../../src/cfo/cfoFortnoxInvoiceLister'),
    cfoFortnoxStore: require('../../src/cfo/cfoFortnoxStore'),
    cfoFortnoxPatientSync: require('../../src/cfo/cfoFortnoxPatientSync'),
    cfoReceiptStore: require('../../src/cfo/cfoReceiptStore'),
    cfoRecurringExpenseStore: require('../../src/cfo/cfoRecurringExpenseStore'),
  };

  assert.equal(typeof modules.cfoExpenseExporter.buildExpenseExportPackage, 'function');
  assert.equal(typeof modules.cfoExpenseRuleStore.createCfoExpenseRuleStore, 'function');
  assert.equal(typeof modules.cfoExpenseStore.createCfoExpenseStore, 'function');
  assert.equal(typeof modules.cfoExpenseVatRules.calculateVatBreakdown, 'function');
  assert.equal(typeof modules.cfoFinanceDashboardBuilder.buildFinanceDashboard, 'function');
  assert.equal(typeof modules.cfoFinanceMonthlyCloseStore.createCfoFinanceMonthlyCloseStore, 'function');
  assert.equal(typeof modules.cfoFinanceReportEngine.generateReport, 'function');
  assert.equal(typeof modules.cfoFinanceReportPackager.buildReportPackage, 'function');
  assert.equal(typeof modules.cfoFinanceReviewPackager.buildReviewPackage, 'function');
  assert.equal(typeof modules.cfoFinanceReviewStore.createCfoFinanceReviewStore, 'function');
  assert.equal(typeof modules.cfoFinanceVendorStore.createCfoFinanceVendorStore, 'function');
  assert.equal(typeof modules.cfoFortnoxClient.buildFortnoxAuthUrl, 'function');
  assert.equal(typeof modules.cfoFortnoxConnector.createInvoice, 'function');
  assert.equal(typeof modules.cfoFortnoxInvoiceLister.createCfoFortnoxInvoiceLister, 'function');
  assert.equal(typeof modules.cfoFortnoxStore.createCfoFortnoxStore, 'function');
  assert.equal(typeof modules.cfoFortnoxPatientSync.syncPatientToFortnox, 'function');
  assert.equal(typeof modules.cfoReceiptStore.createCfoReceiptStore, 'function');
  assert.equal(typeof modules.cfoRecurringExpenseStore.createCfoRecurringExpenseStore, 'function');
});

test('legacy finance module locations are no longer present', () => {
  const removedPaths = [
    'src/ops/ccoExpenseExporter.js',
    'src/ops/ccoExpenseRuleStore.js',
    'src/ops/ccoExpenseStore.js',
    'src/ops/ccoExpenseVatRules.js',
    'src/ops/ccoFinanceDashboardBuilder.js',
    'src/ops/ccoFinanceMonthlyCloseStore.js',
    'src/ops/ccoFinanceReportEngine.js',
    'src/ops/ccoFinanceReportPackager.js',
    'src/ops/ccoFinanceReviewPackager.js',
    'src/ops/ccoFinanceReviewStore.js',
    'src/ops/ccoFinanceVendorStore.js',
    'src/ops/ccoFortnoxInvoiceLister.js',
    'src/ops/ccoFortnoxPatientSync.js',
    'src/ops/ccoFortnoxStore.js',
    'src/ops/ccoReceiptStore.js',
    'src/ops/ccoRecurringExpenseStore.js',
    'src/infra/fortnoxClient.js',
    'src/pos/fortnoxConnector.js',
  ];

  for (const relativePath of removedPaths) {
    assert.equal(fs.existsSync(path.join(projectRoot, relativePath)), false, relativePath);
  }
});

test('finance routes, storage keys, and Fortnox env/config names stay unchanged', () => {
  const server = readProjectFile('server.js');
  const config = readProjectFile('src/config.js');
  const ccoFortnoxRoute = readProjectFile('src/routes/ccoFortnox.js');
  const receiptStore = readProjectFile('src/cfo/cfoReceiptStore.js');
  const expenseStore = readProjectFile('src/cfo/cfoExpenseStore.js');
  const expenseExporter = readProjectFile('src/cfo/cfoExpenseExporter.js');
  const reviewPackager = readProjectFile('src/cfo/cfoFinanceReviewPackager.js');
  const reportPackager = readProjectFile('src/cfo/cfoFinanceReportPackager.js');

  for (const route of [
    '/api/v1/cco-cf/dashboard',
    '/api/v1/cco-cf/receipts',
    '/api/v1/cco-cf/expenses',
    '/api/v1/cco-cf/reports/generate',
    '/api/v1/cco-cf/monthly-close',
  ]) {
    assert.match(server, new RegExp(route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  for (const route of [
    "/cco-fortnox/status",
    "/cco-fortnox/connect",
    "/cco-fortnox/oauth/callback",
    "/cco-fortnox/sync-patient",
  ]) {
    assert.match(ccoFortnoxRoute, new RegExp(route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  for (const storagePath of [
    './data/cco/receipts.json',
    './data/cco/expenses.json',
    './data/cco/expense-rules.json',
    './data/cco/finance-vendors.json',
    './data/cco/recurring-expenses.json',
    './data/cco/finance-reviews.json',
    './data/cco/finance-monthly-close.json',
  ]) {
    assert.match(server, new RegExp(storagePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  assert.match(config, /ccoFortnoxStorePath/);
  assert.match(config, /ARCANA_CCO_FORTNOX_STORE_PATH/);
  assert.match(config, /FORTNOX_CLIENT_ID/);
  assert.match(config, /FORTNOX_CLIENT_SECRET/);

  assert.match(receiptStore, /`receipts\/\$\{ym\}\/\$\{sha\.slice\(0, 8\)\}-\$\{id\}\.\$\{ext\}`/);
  assert.match(expenseStore, /`expenses\/\$\{ym\}\/\$\{sha\.slice\(0, 8\)\}-\$\{e\.id\}\.\$\{ext\}`/);
  assert.match(expenseExporter, /`exports\/expenses\/\$\{ym\}\/\$\{realBatchId\}\.csv`/);
  assert.match(expenseExporter, /`exports\/expenses\/\$\{ym\}\/\$\{realBatchId\}\.json`/);
  assert.match(reviewPackager, /`exports\/reviews\/\$\{ym\}\/\$\{batchId\}-manifest\.json`/);
  assert.match(reportPackager, /`reports\/\$\{periodSeg\}\/\$\{reportKind\}\/\$\{packageId\}`/);
});
