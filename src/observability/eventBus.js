const { EventEmitter } = require('node:events');

const emitter = new EventEmitter();
emitter.setMaxListeners(2000);

function publishRuntimeEvent(eventName, payload) {
  const normalizedEventName = typeof eventName === 'string' ? eventName.trim() : '';
  if (!normalizedEventName) return;
  emitter.emit(normalizedEventName, {
    eventName: normalizedEventName,
    emittedAt: new Date().toISOString(),
    payload,
  });
}

function subscribeRuntimeEvent(eventName, listener) {
  const normalizedEventName = typeof eventName === 'string' ? eventName.trim() : '';
  if (!normalizedEventName || typeof listener !== 'function') {
    return () => {};
  }
  emitter.on(normalizedEventName, listener);
  return () => {
    emitter.off(normalizedEventName, listener);
  };
}

module.exports = {
  publishRuntimeEvent,
  subscribeRuntimeEvent,
};
