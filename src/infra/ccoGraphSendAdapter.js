'use strict';

/**
 * ccoGraphSendAdapter — tunn shim som exponerar draft-routerns förväntade
 * `sendMail({ from, to, subject, body, attachments })`-form ovanpå den delade
 * microsoftGraphSendConnector (steg 2d-wiring, "B1").
 *
 * Avgränsning:
 *   - Connectorns `sendNewMessage` stödjer INTE bilagor (Graph POST /sendMail
 *     skickar bara to/subject/body). Därför avvisar denna shim utkast med
 *     bilagor (`supportsAttachments = false` + kastar om den ändå anropas), så
 *     ett ofullständigt mail aldrig kan lämna systemet. Bilage-stöd är en egen
 *     följd-uppgift (B2) som rör den delade connectorn.
 *   - Nya utskick ger inget message-id från Graph (202 utan body), så
 *     providerMessageId blir null.
 *   - Wire:as bara in när connectorn finns (flagga + Graph-creds i server.js);
 *     annars förblir graphSendAdapter null → routern svarar 503 no_adapter.
 */

function createCcoGraphSendAdapter(connector) {
  if (!connector || typeof connector.sendNewMessage !== 'function') {
    throw new Error('createCcoGraphSendAdapter kräver en connector med sendNewMessage.');
  }

  async function sendMail({ from, to, subject, body, attachments } = {}) {
    const hasAttachments = Array.isArray(attachments)
      ? attachments.length > 0
      : attachments != null && attachments !== false;
    if (hasAttachments) {
      // Defense-in-depth: routern ska ha blockerat detta före anrop, men om det
      // ändå händer skickar vi hellre inget än ett mail utan sina bilagor.
      const err = new Error('cco_send_attachments_unsupported');
      err.code = 'attachments_not_supported';
      throw err;
    }
    const result = await connector.sendNewMessage({
      mailboxId: from,
      sourceMailboxId: from,
      to: to ? [to] : [],
      subject: subject || '',
      body: body || '',
    });
    return {
      // Graph /sendMail returnerar 202 utan body → inget message-id.
      messageId: null,
      sentAt: result?.sentAt || null,
      provider: result?.provider || 'microsoft_graph',
    };
  }

  return {
    sendMail,
    // Kapabilitets-flagga som draft-routern läser för att blockera bilage-utkast
    // med ett tydligt 422 i stället för att markera utkastet failed.
    supportsAttachments: false,
  };
}

module.exports = { createCcoGraphSendAdapter };
