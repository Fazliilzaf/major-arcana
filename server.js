require('dotenv').config();
const express = require('express');
const cors = require('cors');

const { config } = require('./src/config');
const { resolveBrandForHost, resolveBrandFromMap } = require('./src/brand/resolveBrand');
const {
  getClientoConfigForBrand,
  getKnowledgeDirForBrand,
} = require('./src/brand/runtimeConfig');

const app = express();
if (config.trustProxy) app.set('trust proxy', 1);
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

const { openai } = require('./src/openai/client');
const { createMemoryStore } = require('./src/memory/store');
const { createKnowledgeRetriever } = require('./src/knowledge/retriever');
const { createChatHandler } = require('./src/routes/chat');

app.get("/", (req, res) => {
  res.sendFile("index.html", { root: __dirname + "/public" });
});

(async () => {
  const memoryStore = await createMemoryStore({
    filePath: config.memoryStorePath,
    ttlMs: config.memoryTtlDays * 24 * 60 * 60 * 1000,
  });

  const knowledgeRetrieverByBrand = new Map();

  function extractHostname(urlValue) {
    if (!urlValue || typeof urlValue !== 'string') return '';
    try {
      return new URL(urlValue).hostname;
    } catch {
      return '';
    }
  }

  function resolveBrand(req, sourceUrl) {
    const sourceHost = extractHostname(sourceUrl);
    const originHost = extractHostname(req.get('origin'));
    const refererHost = extractHostname(req.get('referer'));

    const candidates = config.brandByHost
      ? [sourceHost, originHost, refererHost, req.hostname]
      : [sourceHost, req.hostname, originHost, refererHost];

    if (config.brandByHost) {
      for (const host of candidates) {
        const mapped = resolveBrandFromMap(host, config.brandByHost);
        if (mapped) return mapped;
      }
    }

    for (const host of candidates) {
      const resolved = resolveBrandForHost(host, { defaultBrand: config.brand });
      if (resolved) return resolved;
    }

    return config.brand;
  }

  async function getKnowledgeRetriever(brand) {
    const resolvedBrand =
      typeof brand === 'string' && brand.trim() ? brand.trim() : config.brand;
    const existing = knowledgeRetrieverByBrand.get(resolvedBrand);
    if (existing) return existing;

    const knowledgeDir = getKnowledgeDirForBrand(resolvedBrand);
    const created = createKnowledgeRetriever({ knowledgeDir });
    knowledgeRetrieverByBrand.set(resolvedBrand, created);
    return created;
  }

  app.get('/config', (req, res) => {
    const sourceUrl = typeof req.query.sourceUrl === 'string' ? req.query.sourceUrl : '';
    const brand = resolveBrand(req, sourceUrl);
    const cliento = getClientoConfigForBrand(brand, config);
    return res.json({
      brand,
      cliento,
    });
  });

  app.get('/conversation/:id', async (req, res) => {
    try {
      const conversation = await memoryStore.getConversation(req.params.id);
      if (!conversation) {
        return res.status(404).json({ error: 'Hittade ingen konversation.' });
      }
      const sourceUrl = typeof req.query.sourceUrl === 'string' ? req.query.sourceUrl : '';
      const brand = resolveBrand(req, sourceUrl);
      if (conversation.brand && brand && conversation.brand !== brand) {
        return res.status(404).json({ error: 'Hittade ingen konversation.' });
      }
      if (!conversation.brand && brand) {
        await memoryStore.ensureConversation(conversation.id, brand);
      }
      return res.json({
        conversationId: conversation.id,
        summary: conversation.summary || '',
        messages: conversation.messages || [],
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Något gick fel.' });
    }
  });

  app.delete('/conversation/:id', async (req, res) => {
    try {
      const conversation = await memoryStore.getConversation(req.params.id);
      if (!conversation) return res.json({ ok: false });
      const sourceUrl = typeof req.query.sourceUrl === 'string' ? req.query.sourceUrl : '';
      const brand = resolveBrand(req, sourceUrl);
      if (conversation.brand && brand && conversation.brand !== brand) {
        return res.json({ ok: false });
      }
      const ok = await memoryStore.deleteConversation(req.params.id);
      return res.json({ ok });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Något gick fel.' });
    }
  });

  app.post(
    '/chat',
    createChatHandler({
      openai,
      model: config.openaiModel,
      memoryStore,
      resolveBrand,
      getKnowledgeRetriever,
      publicBaseUrl: config.publicBaseUrl,
    })
  );

  app.listen(config.port, () => {
    console.log(`Arcana kör på ${config.publicBaseUrl}`);
  });
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
