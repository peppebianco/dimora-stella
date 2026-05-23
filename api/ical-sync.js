// Vercel Serverless Function — legge i feed iCal di Airbnb e Booking.com
// e restituisce i periodi bloccati in JSON.
// ENV: ICAL_AIRBNB, ICAL_BOOKING
// Il sito chiama GET /api/ical-sync per integrare le date disabilitate nel datepicker.

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const ICAL_AIRBNB  = process.env.ICAL_AIRBNB;
  const ICAL_BOOKING = process.env.ICAL_BOOKING;

  const ranges = [];

  for (const [fonte, url] of [['Airbnb', ICAL_AIRBNB], ['Booking', ICAL_BOOKING]]) {
    if (!url) continue;
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'DimoraStella/1.0' } });
      if (!r.ok) { console.error(`iCal ${fonte}: HTTP ${r.status}`); continue; }
      const text = await r.text();
      parseICal(text).forEach(e => ranges.push({ ...e, fonte }));
    } catch (err) {
      console.error(`iCal fetch (${fonte}):`, err.message);
    }
  }

  return res.status(200).json({ ok: true, ranges });
};

// Estrae le date di inizio/fine da ogni VEVENT nel feed iCal
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
