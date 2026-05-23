// Firebase Cloud Functions — Dimora Stella
// Deploy: firebase deploy --only functions
// Variabili d'ambiente: functions/.env (mai committare il file reale)

const functions = require('firebase-functions');

/* ══════════════════════════════════════════════════════════════════
   SEND WHATSAPP
   POST /api/send-whatsapp
   Body: { phone, tipo, nome, checkin, checkout, ospiti, lingua }
   ══════════════════════════════════════════════════════════════════ */
exports.sendWhatsapp = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const { phone, tipo, nome, checkin, checkout, ospiti, lingua } = req.body || {};
  if (!phone || !tipo || !nome) {
    return res.status(400).json({ ok: false, error: 'Campi obbligatori: phone, tipo, nome' });
  }

  const WA_TOKEN    = process.env.WA_TOKEN;
  const WA_PHONE_ID = process.env.WA_PHONE_ID;

  const isIT = lingua !== 'en';
  const ci   = fmtData(checkin);
  const co   = fmtData(checkout);

  const testo = tipo === 'conferma'
    ? (isIT
        ? `Ciao ${nome}, la tua richiesta per Dimora Stella è confermata.\n\nCheck-in: ${ci}\nCheck-out: ${co}\nOspiti: ${ospiti}\n\nTi aspettiamo in Via Galiani, Pezze di Greco.\nPer qualsiasi necessità rispondi pure qui.\nA presto!`
        : `Hi ${nome}, your booking at Dimora Stella is confirmed.\n\nCheck-in: ${ci}\nCheck-out: ${co}\nGuests: ${ospiti}\n\nWe look forward to welcoming you at Via Galiani, Pezze di Greco.\nFeel free to reply here for anything you need.\nSee you soon!`)
    : (isIT
        ? `Ciao ${nome}, purtroppo le date che hai richiesto non sono più disponibili.\n\nTi invitiamo a controllare le disponibilità sul sito e inviare una nuova richiesta.\nCi scusiamo per l'inconveniente.`
        : `Hi ${nome}, unfortunately the dates you requested are no longer available.\n\nPlease check availability on our website and submit a new request.\nWe apologize for the inconvenience.`);

  const digits    = phone.replace(/\D/g, '');
  const fullPhone = digits.startsWith('39') ? digits : '39' + digits;

  // Modalità test — nessuna credenziale configurata
  if (!WA_TOKEN || !WA_PHONE_ID) {
    console.log('[WhatsApp TEST] A:', fullPhone, '\nTesto:', testo);
    return res.status(200).json({ ok: true, mode: 'test', testo });
  }

  // Meta Cloud API
  const waRes = await fetch(
    `https://graph.facebook.com/v19.0/${WA_PHONE_ID}/messages`,
    {
      method:  'POST',
      headers: { Authorization: `Bearer ${WA_TOKEN}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({
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
});

/* ══════════════════════════════════════════════════════════════════
   ICAL SYNC
   GET /api/ical-sync
   Legge i feed Airbnb e Booking.com e restituisce i periodi bloccati
   ══════════════════════════════════════════════════════════════════ */
exports.icalSync = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');

  const ICAL_AIRBNB  = process.env.ICAL_AIRBNB;
  const ICAL_BOOKING = process.env.ICAL_BOOKING;

  const ranges = [];
  for (const [fonte, url] of [['Airbnb', ICAL_AIRBNB], ['Booking', ICAL_BOOKING]]) {
    if (!url) continue;
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'DimoraStella/1.0' } });
      if (!r.ok) { console.error(`iCal ${fonte}: HTTP ${r.status}`); continue; }
      parseICal(await r.text()).forEach(e => ranges.push({ ...e, fonte }));
    } catch (err) {
      console.error(`iCal (${fonte}):`, err.message);
    }
  }

  return res.status(200).json({ ok: true, ranges });
});

/* ══════════════════════════════════════════════════════════════════
   UTILS
   ══════════════════════════════════════════════════════════════════ */
function fmtData(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function parseICal(text) {
  const events = [];
  const blocks = text.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g) || [];
  for (const block of blocks) {
    const ds = block.match(/DTSTART[;:]([^\r\n]+)/)?.[1]?.replace(/\D/g, '');
    const de = block.match(/DTEND[;:]([^\r\n]+)/)?.[1]?.replace(/\D/g, '');
    if (ds?.length >= 8 && de?.length >= 8) {
      const fmt = s => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
      events.push({ from: fmt(ds), to: fmt(de) });
    }
  }
  return events;
}
