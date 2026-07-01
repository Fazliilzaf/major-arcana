'use strict';

/**
 * Parsar C3 deep-link URL-parametrar för navigering från kundkortet till
 * konversationsshellen med rätt tråd och kundkontext.
 *
 * URL-format: ?view=conversations&conv={conversationId}&customerId={customerId}
 */
function parseC3DeepLinkParams(search) {
  const params = new URLSearchParams(search || '');
  const conversationId = (params.get('conv') || '').trim();
  const customerId = (params.get('customerId') || '').trim();
  return { conversationId, customerId };
}

/**
 * Bygger en C3 deep-link URL från conversationId och customerId.
 * Resultatet används som href i C2-panelens "Visa"-länk.
 */
function buildC3DeepLinkUrl({ conversationId = '', customerId = '', base = '' } = {}) {
  if (!conversationId) return '';
  const params = new URLSearchParams();
  params.set('view', 'conversations');
  params.set('conv', conversationId);
  if (customerId) params.set('customerId', customerId);
  return (base || '') + '?' + params.toString();
}

module.exports = { parseC3DeepLinkParams, buildC3DeepLinkUrl };
