(function initArcanaCcoNextCollaboration(global) {
  'use strict';

  function asText(value, fallback = '') {
    const safeValue = String(value == null ? '' : value).trim();
    return safeValue || fallback;
  }

  function asNumber(value, fallback = 0) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
  }

  function cloneCollaborators(value) {
    return Array.isArray(value)
      ? value
          .map((entry, index) => {
            const safeEntry = entry && typeof entry === 'object' && !Array.isArray(entry) ? entry : {};
            return {
              id: asText(safeEntry.id, `collab-${index + 1}`),
              name: asText(safeEntry.name || safeEntry.label, `Kollega ${index + 1}`),
              action: asText(safeEntry.action || safeEntry.status, 'viewing'),
              location: asText(safeEntry.location || safeEntry.context),
              durationSeconds:
                asNumber(
                  safeEntry.durationSeconds != null ? safeEntry.durationSeconds : safeEntry.duration_seconds,
                  0
                ) || 0,
            };
          })
          .filter((entry) => entry.name)
          .slice(0, 6)
      : [];
  }

  function formatActionLabel(value = '') {
    const normalized = asText(value).toLowerCase();
    if (normalized === 'editing') return 'redigerar';
    if (normalized === 'typing') return 'skriver';
    return 'tittar';
  }

  function formatClock(value = '') {
    const timestamp = Date.parse(asText(value));
    if (!Number.isFinite(timestamp)) return '';
    return new Intl.DateTimeFormat('sv-SE', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(timestamp));
  }

  function deriveCollisionState(conversation = {}, actorLabel = '') {
    const safeConversation = conversation && typeof conversation === 'object' ? conversation : {};
    const actor = asText(actorLabel).toLowerCase();
    const explicit = asText(safeConversation.collisionState).toLowerCase();
    if (explicit) return explicit;
    const activeEditor = asText(safeConversation.activeEditor).toLowerCase();
    if (activeEditor && activeEditor !== actor) return 'editing';
    const viewers = cloneCollaborators(safeConversation.activeViewers).filter(
      (entry) => asText(entry.name).toLowerCase() !== actor
    );
    return viewers.length ? 'viewing' : 'none';
  }

  function buildPresenceCard(conversation = {}, actorLabel = '') {
    const actor = asText(actorLabel).toLowerCase();
    const viewers = cloneCollaborators(conversation.activeViewers);
    const visiblePeers = viewers.filter((entry) => asText(entry.name).toLowerCase() !== actor);
    const activeEditor = asText(conversation.activeEditor);
    const detail = activeEditor
      ? `${activeEditor} ${formatActionLabel(
          viewers.find((entry) => entry.name === activeEditor)?.action || 'editing'
        )}`
      : visiblePeers.length
      ? `${visiblePeers.length} i tråden`
      : 'Ingen annan i tråden';
    const lines = visiblePeers.slice(0, 3).map((entry) => ({
      label: entry.name,
      value: `${formatActionLabel(entry.action)}${entry.location ? ` · ${entry.location}` : ''}`,
    }));
    return {
      title: 'Närvaro',
      detail,
      note: visiblePeers.length
        ? 'Visar vilka kollegor som just nu tittar eller skriver i samma tråd.'
        : 'Ingen annan kollega är aktiv i tråden just nu.',
      lines,
      badges: visiblePeers.slice(0, 3).map((entry) => ({
        label: `${entry.name} ${formatActionLabel(entry.action)}`,
        tone: entry.action === 'editing' || entry.action === 'typing' ? 'warn' : 'neutral',
      })),
    };
  }

  function buildDraftCard(conversation = {}) {
    const draftOwner = asText(conversation.draftOwner || conversation.activeEditor);
    const updatedAt = formatClock(conversation.draftUpdatedAt);
    const detail = draftOwner ? `Senast av ${draftOwner}` : 'Ingen separat draftägare';
    const note = updatedAt
      ? `Utkastet uppdaterades senast ${updatedAt}.`
      : 'Ingen nylig draftuppdatering registrerad i previewn.';
    return {
      title: 'Utkast',
      detail,
      note,
      badges: draftOwner
        ? [
            {
              label: asText(conversation.activeEditor) ? 'Live edit' : 'Senaste ägare',
              tone: asText(conversation.activeEditor) ? 'warn' : 'neutral',
            },
          ]
        : [],
    };
  }

  function buildHandoffCard(conversation = {}) {
    const request = asText(conversation.handoffRequest).toLowerCase();
    const target = asText(conversation.handoffTarget);
    const note = asText(conversation.handoffNote);
    const statusDetail = asText(conversation.handoffStatusDetail);
    let detail = 'Ingen aktiv handoff';
    let tone = 'neutral';
    if (request === 'pending' && target) {
      detail = `Väntar på ${target}`;
      tone = 'warn';
    } else if (request === 'accepted' && target) {
      detail = `${target} har tagit över`;
      tone = 'success';
    } else if (request === 'reclaimed') {
      detail = 'Återtagen';
      tone = 'neutral';
    } else if (request === 'draft') {
      detail = 'Förbereds';
      tone = 'neutral';
    }
    const lines = [];
    if (target) lines.push({ label: 'Mottagare', value: target });
    if (note) lines.push({ label: 'Kontext', value: note });
    if (asText(conversation.owner)) lines.push({ label: 'Ägare nu', value: asText(conversation.owner) });
    return {
      title: 'Handoff',
      detail,
      note:
        statusDetail ||
        (note
          ? note
          : request === 'pending'
          ? 'En kollega behöver ta över nästa steg i tråden.'
          : 'Ingen handoff behövs i detta läge.'),
      lines,
      badges: [
        {
          label:
            request === 'pending'
              ? 'Väntar svar'
              : request === 'accepted'
              ? 'Övertagen'
              : request === 'draft'
              ? 'Utkast'
              : 'Ingen handoff',
          tone,
        },
      ],
    };
  }

  function buildNotice(conversation = {}, actorLabel = '') {
    const collisionState = deriveCollisionState(conversation, actorLabel);
    const activeEditor = asText(conversation.activeEditor);
    const handoffRequest = asText(conversation.handoffRequest).toLowerCase();
    const handoffTarget = asText(conversation.handoffTarget);
    if (collisionState === 'editing' || collisionState === 'typing') {
      return {
        tone: 'warn',
        title: 'Krockrisk i tråden',
        note: activeEditor
          ? `${activeEditor} skriver just nu. Vänta eller skicka handoff i stället för att dubbelarbeta.`
          : 'En annan kollega redigerar utkastet just nu.',
      };
    }
    if (handoffRequest === 'pending' && handoffTarget) {
      return {
        tone: 'neutral',
        title: `Handoff väntar på ${handoffTarget}`,
        note: asText(conversation.handoffStatusDetail || conversation.handoffNote) || 'Nästa steg ligger hos annan kollega.',
      };
    }
    return null;
  }

  function buildModel(conversation = {}, options = {}) {
    const actorLabel = asText(options.actorLabel);
    return {
      collisionState: deriveCollisionState(conversation, actorLabel),
      notice: buildNotice(conversation, actorLabel),
      presenceCard: buildPresenceCard(conversation, actorLabel),
      handoffCard: buildHandoffCard(conversation),
      draftCard: buildDraftCard(conversation),
    };
  }

  global.ArcanaCcoNextCollaboration = {
    cloneCollaborators,
    deriveCollisionState,
    buildModel,
  };
})(typeof window !== 'undefined' ? window : globalThis);
