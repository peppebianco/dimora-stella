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
   SEND EMAIL
   POST /api/send-email
   Body: { tipo, nome, email, checkin, checkout, ospiti, lingua }
   tipo: 'nuova' | 'conferma' | 'rifiuto'
   ══════════════════════════════════════════════════════════════════ */
exports.sendEmail = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const { tipo, nome, email, checkin, checkout, ospiti, lingua } = req.body || {};
  if (!tipo) return res.status(400).json({ ok: false, error: 'tipo obbligatorio' });

  const EMAIL_USER   = process.env.EMAIL_USER;
  const EMAIL_PASS   = process.env.EMAIL_PASS;
  const EMAIL_HOST   = process.env.EMAIL_HOST   || 'smtps.aruba.it';
  const EMAIL_PORT   = parseInt(process.env.EMAIL_PORT || '465');
  const ADMIN_EMAIL  = process.env.ADMIN_EMAIL  || EMAIL_USER || 'info@dimorastella.com';

  const isIT = lingua !== 'en';
  const ci   = fmtData(checkin);
  const co   = fmtData(checkout);

  let to, subject, html;

  if (tipo === 'nuova') {
    to      = ADMIN_EMAIL;
    subject = `Nuova richiesta — ${nome} (${ci} → ${co})`;
    html    = `<p><b>Nuova richiesta di prenotazione</b></p>
               <p><b>Nome:</b> ${nome}<br>
               <b>Email:</b> ${email || '—'}<br>
               <b>Check-in:</b> ${ci}<br>
               <b>Check-out:</b> ${co}<br>
               <b>Ospiti:</b> ${ospiti}</p>
               <p><a href="https://dimora-stella.web.app/admin">Apri il gestionale →</a></p>`;
  } else if (tipo === 'conferma') {
    to      = email;
    subject = isIT ? 'Prenotazione confermata — Dimora Stella' : 'Booking confirmed — Dimora Stella';
    html    = isIT
      ? `<p>Ciao <b>${nome}</b>,</p>
         <p>La tua prenotazione a <b>Dimora Stella</b> è <b>confermata</b>.</p>
         <p><b>Check-in:</b> ${ci}<br><b>Check-out:</b> ${co}<br><b>Ospiti:</b> ${ospiti}</p>
         <p>Indirizzo: Via Galiani, Pezze di Greco (BR)<br>
         Check-in dalle 15:00 · Check-out entro le 10:00</p>
         <p>Per qualsiasi necessità scrivici a <a href="mailto:${ADMIN_EMAIL}">${ADMIN_EMAIL}</a> o su WhatsApp al +39 380 775 2931.</p>
         <p>A presto!<br><i>Dimora Stella</i></p>`
      : `<p>Hi <b>${nome}</b>,</p>
         <p>Your booking at <b>Dimora Stella</b> is <b>confirmed</b>.</p>
         <p><b>Check-in:</b> ${ci}<br><b>Check-out:</b> ${co}<br><b>Guests:</b> ${ospiti}</p>
         <p>Address: Via Galiani, Pezze di Greco (BR)<br>
         Check-in from 15:00 · Check-out by 10:00</p>
         <p>Contact us at <a href="mailto:${ADMIN_EMAIL}">${ADMIN_EMAIL}</a> or WhatsApp +39 380 775 2931.</p>
         <p>See you soon!<br><i>Dimora Stella</i></p>`;
  } else if (tipo === 'rifiuto') {
    to      = email;
    subject = isIT ? 'Richiesta prenotazione — Dimora Stella' : 'Booking request — Dimora Stella';
    html    = isIT
      ? `<p>Ciao <b>${nome}</b>,</p>
         <p>Purtroppo le date che hai richiesto non sono più disponibili.</p>
         <p>Puoi controllare le disponibilità sul nostro sito e inviare una nuova richiesta.<br>
         Ci scusiamo per l'inconveniente.</p>
         <p><i>Dimora Stella</i></p>`
      : `<p>Hi <b>${nome}</b>,</p>
         <p>Unfortunately the dates you requested are no longer available.</p>
         <p>Please check availability on our website and submit a new request.<br>
         We apologize for the inconvenience.</p>
         <p><i>Dimora Stella</i></p>`;
  } else {
    return res.status(400).json({ ok: false, error: 'tipo non valido' });
  }

  if (!to) return res.status(400).json({ ok: false, error: 'email destinatario mancante' });

  // Modalità test — credenziali non configurate
  if (!EMAIL_USER || !EMAIL_PASS) {
    console.log('[Email TEST] To:', to, '\nSubject:', subject);
    return res.status(200).json({ ok: true, mode: 'test', to, subject });
  }

  const nodemailer = require('nodemailer');
  const transporter = nodemailer.createTransport({
    host: EMAIL_HOST,
    port: EMAIL_PORT,
    secure: EMAIL_PORT === 465,
    auth: { user: EMAIL_USER, pass: EMAIL_PASS },
  });

  try {
    await transporter.sendMail({ from: `"Dimora Stella" <${EMAIL_USER}>`, to, subject, html });
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[Email ERROR]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
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
