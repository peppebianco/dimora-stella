// Vercel Serverless Function — invia messaggio WhatsApp via Meta Cloud API
// ENV: WA_TOKEN, WA_PHONE_ID
// Se le credenziali non sono impostate → modalità test (log soltanto)

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const { phone, tipo, nome, checkin, checkout, ospiti, lingua } = req.body || {};
  if (!phone || !tipo || !nome) {
    return res.status(400).json({ ok: false, error: 'Campi obbligatori mancanti: phone, tipo, nome' });
  }

  const WA_TOKEN    = process.env.WA_TOKEN;
  const WA_PHONE_ID = process.env.WA_PHONE_ID;

  const isIT = lingua !== 'en';
  const ci   = fmtData(checkin);
  const co   = fmtData(checkout);

  let testo;
  if (tipo === 'conferma') {
    testo = isIT
      ? `Ciao ${nome}, la tua richiesta per Dimora Stella è confermata.\n\nCheck-in: ${ci}\nCheck-out: ${co}\nOspiti: ${ospiti}\n\nTi aspettiamo in Via Galiani, Pezze di Greco.\nPer qualsiasi necessità rispondi pure qui.\nA presto!`
      : `Hi ${nome}, your booking at Dimora Stella is confirmed.\n\nCheck-in: ${ci}\nCheck-out: ${co}\nGuests: ${ospiti}\n\nWe look forward to welcoming you at Via Galiani, Pezze di Greco.\nFeel free to reply here for anything you need.\nSee you soon!`;
  } else {
    testo = isIT
      ? `Ciao ${nome}, purtroppo le date che hai richiesto non sono più disponibili.\n\nTi invitiamo a controllare le disponibilità sul sito e inviare una nuova richiesta.\nCi scusiamo per l'inconveniente.`
      : `Hi ${nome}, unfortunately the dates you requested are no longer available.\n\nPlease check availability on our website and submit a new request.\nWe apologize for the inconvenience.`;
  }

  // Normalizza numero → formato internazionale senza +
  const digits    = phone.replace(/\D/g, '');
  const fullPhone = digits.startsWith('39') ? digits : '39' + digits;

  // Modalità test — nessuna credenziale ancora configurata
  if (!WA_TOKEN || !WA_PHONE_ID) {
    console.log('[WhatsApp TEST] A:', fullPhone);
    console.log('[WhatsApp TEST] Testo:', testo);
    return res.status(200).json({ ok: true, mode: 'test', testo });
  }

  // Meta Cloud API — invia messaggio testo libero
  const waRes = await fetch(
    `https://graph.facebook.com/v19.0/${WA_PHONE_ID}/messages`,
    {
      method:  'POST',
      headers: { Authorization: `Bearer ${WA_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to:   fullPhone,
        type: 'text',
        text: { body: testo },
      }),
    }
  );

  const data = await waRes.json();
  if (!waRes.ok) {
    console.error('[WhatsApp ERROR]', data);
    return res.status(500).json({ ok: false, error: data });
  }

  return res.status(200).json({ ok: true, data });
};

function fmtData(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
