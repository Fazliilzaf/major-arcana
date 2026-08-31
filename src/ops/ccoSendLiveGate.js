'use strict';

/**
 * ccoSendLiveGate — den ENDA källan för CCO_SEND_LIVE-avläsningen.
 *
 * Samma flagga som ccoSendActionStore.performSend läser (isDryRunDefault).
 * Vägar som ska grindas under exportgaten delar den här funktionen så att de
 * aldrig kan avvika från performSend — en flagga, en sanning.
 *
 * Avsiktliga driftvägar (bokningsbekräftelse, påminnelser mail+SMS, avbokning,
 * staff-SMS, comm-draft) är UNDANTAGNA — se ORD-153 uppdateringen efter
 * §6-inventeringen. De läser inte den här grinden och ska fortsätta fungera
 * under frysen.
 */

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/** Är exportgrinden öppen? CCO_SEND_LIVE=1/true/yes → live, annars av (dry-run). */
function isCcoSendLive(env = process.env) {
  const optIn = String(env.CCO_SEND_LIVE || '')
    .trim()
    .toLowerCase();
  return optIn === '1' || optIn === 'true' || optIn === 'yes';
}

/** Default dry-run (säkert default): true om grinden är av. */
function isSendDryRunDefault(env = process.env) {
  return !isCcoSendLive(env);
}

module.exports = { isCcoSendLive, isSendDryRunDefault };
