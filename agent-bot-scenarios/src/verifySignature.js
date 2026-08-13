const crypto = require('crypto');

// Chatwoot подписывает вебхук так (lib/webhooks/trigger.rb):
//   ts = Time.now.to_i.to_s
//   X-Chatwoot-Timestamp: ts
//   X-Chatwoot-Signature: sha256=HMAC_SHA256(secret, "#{ts}.#{raw_body}")
//
// Если AGENT_BOT_SECRET не задан — проверка пропускается (для локальной разработки).
function verifySignature(secret) {
  return (req, res, next) => {
    if (!secret) return next();

    const signatureHeader = req.get('X-Chatwoot-Signature') || '';
    const timestamp = req.get('X-Chatwoot-Timestamp') || '';
    const expected =
      'sha256=' +
      crypto
        .createHmac('sha256', secret)
        .update(`${timestamp}.${req.rawBody}`)
        .digest('hex');

    const valid =
      signatureHeader.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expected));

    if (!valid) {
      return res.status(401).json({ error: 'invalid signature' });
    }
    return next();
  };
}

module.exports = { verifySignature };
