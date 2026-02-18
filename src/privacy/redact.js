function redactEmails(text) {
  return String(text ?? '').replace(
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
    '[email]'
  );
}

function redactPersonnummer(text) {
  // 850101-1234, 19850101-1234, 8501011234, 198501011234
  return String(text ?? '').replace(
    /\b(\d{6}|\d{8})[-+]?(\d{4})\b/g,
    '[personnummer]'
  );
}

function redactPhones(text) {
  return String(text ?? '').replace(/(\+?\d[\d\s\-().]{7,}\d)/g, (match) => {
    const trimmed = match.trim();
    if (!(trimmed.startsWith('+') || trimmed.startsWith('0'))) return match;

    const digits = trimmed.replace(/\D/g, '');
    if (digits.length < 9 || digits.length > 15) return match;
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return match;

    return '[telefon]';
  });
}

function redactForStorage(text) {
  let output = String(text ?? '');
  output = redactEmails(output);
  output = redactPersonnummer(output);
  output = redactPhones(output);
  return output;
}

module.exports = { redactForStorage };
