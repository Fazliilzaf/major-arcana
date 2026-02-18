const { buildClinicMessages } = require('../clinic/buildMessages');
const { maybeSummarizeConversation } = require('../memory/summarize');
const { runChatWithTools } = require('../openai/runChatWithTools');
const { redactForStorage } = require('../privacy/redact');

function createChatHandler({
  openai,
  model,
  memoryStore,
  resolveBrand,
  getKnowledgeRetriever,
}) {
  return async function chat(req, res) {
    try {
      const body = req.body || {};
      const message =
        typeof body.message === 'string' ? body.message.trim() : '';
      if (!message) {
        return res.status(400).json({ error: 'Meddelande saknas.' });
      }

      const brand =
        typeof resolveBrand === 'function'
          ? resolveBrand(req, typeof body.sourceUrl === 'string' ? body.sourceUrl : '')
          : undefined;

      const incomingConversationId =
        typeof body.conversationId === 'string' ? body.conversationId : '';

      let conversationId = incomingConversationId;
      let conversation = conversationId
        ? await memoryStore.getConversation(conversationId)
        : null;

      if (conversation && conversation.brand && brand && conversation.brand !== brand) {
        conversationId = '';
        conversation = null;
      }

      if (!conversationId) {
        conversationId = await memoryStore.createConversation(brand);
        conversation = await memoryStore.getConversation(conversationId);
      }

      await memoryStore.ensureConversation(conversationId, brand);

      const convoBefore = await memoryStore.getConversation(conversationId);
      const summaryResult = await maybeSummarizeConversation({
        openai,
        model,
        conversation: convoBefore,
        brand,
      });
      if (summaryResult.summarized) {
        await memoryStore.setSummary(conversationId, summaryResult.summary);
        await memoryStore.replaceMessages(
          conversationId,
          summaryResult.remainingMessages
        );
      }

      conversation = await memoryStore.getConversation(conversationId);

      const knowledgeRetriever =
        typeof getKnowledgeRetriever === 'function'
          ? await getKnowledgeRetriever(brand)
          : null;
      const knowledge = knowledgeRetriever
        ? await knowledgeRetriever.search(message)
        : [];

      const messages = await buildClinicMessages({
        brand,
        conversation,
        knowledge,
        currentUserMessage: message,
      });

      await memoryStore.appendMessage(
        conversationId,
        'user',
        redactForStorage(message)
      );

      const reply = await runChatWithTools({
        openai,
        model,
        messages,
      });

      await memoryStore.appendMessage(
        conversationId,
        'assistant',
        redactForStorage(reply)
      );

      return res.json({ reply, conversationId });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Något gick fel.' });
    }
  };
}

module.exports = { createChatHandler };
