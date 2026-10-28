// Turns Hospitable Public API responses into public widget data.
//
// Every function here builds its output from an allowlist: a field reaches a
// widget only if it is copied explicitly below. Street address, coordinates,
// Wi-Fi details, guest access, the house manual, iCal URLs, private review
// feedback, guest last names, emails and billing details are never copied, so
// no template can expose them. The one exception is stay(), which copies a
// guest's own reservation and the property's arrival details for that guest
// alone, after they have signed in (src/guest.js).

import { amenities } from './amenities.js';

const BED_LABELS = {
  king_bed: 'King bed', king: 'King bed', king_size: 'King bed',
  queen_bed: 'Queen bed', queen: 'Queen bed', queen_size: 'Queen bed',
  double_bed: 'Double bed', double: 'Double bed',
  single_bed: 'Single bed', single: 'Single bed', twin_bed: 'Single bed', twin: 'Single bed',
  sofa_bed: 'Sofa bed', couch: 'Couch', bunk_bed: 'Bunk bed', crib: 'Crib', toddler_bed: 'Toddler bed',
  air_mattress: 'Air mattress', floor_mattress: 'Floor mattress', hammock: 'Hammock', water_bed: 'Water bed',
};

const ROOM_LABELS = {
  bedroom: 'Bedroom', living_room: 'Living room', common_space: 'Common space', common_spaces: 'Common space',
  studio: 'Studio', loft: 'Loft', den: 'Den', office: 'Office', kitchen: 'Kitchen', dining_room: 'Dining room',
};

const FEE_LABELS = {
  cleaning_fee: 'Cleaning fee', linens_fee: 'Linens fee', management_fee: 'Management fee',
  community_fee: 'Community fee', resort_fee: 'Resort fee', short_term_cleaning_fee: 'Short-stay cleaning fee',
};

const CHANNEL_NAMES = { airbnb: 'Airbnb', homeaway: 'Vrbo', vrbo: 'Vrbo', booking: 'Booking.com', direct: 'Book direct', agoda: 'Agoda' };

function str(value) {
  if (typeof value !== 'string') return null;
  const s = value.replace(/\r\n?/g, '\n').trim();
  return s ? s : null;
}

function numOrNull(value) {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

function boolOrNull(value) {
  return typeof value === 'boolean' ? value : null;
}

function words(slug) {
  const s = String(slug || '').replace(/[_-]+/g, ' ').trim().toLowerCase();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}

/** Only https URLs reach a widget; http is upgraded, anything else is dropped. */
export function httpsUrl(value) {
  if (typeof value !== 'string') return null;
  const s = value.trim();
  if (/^https:\/\//i.test(s)) return s;
  if (/^http:\/\//i.test(s)) return 'https://' + s.slice(7);
  return null;
}

function hhmm(value) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(value || ''));
  return m ? m[1].padStart(2, '0') + ':' + m[2] : null;
}

/** Number of minor units in one unit of a currency (100 for USD, 1 for JPY). */
export function minorUnits(currency) {
  try {
    const digits = new Intl.NumberFormat('en', { style: 'currency', currency: currency || 'USD' }).resolvedOptions().maximumFractionDigits;
    return 10 ** digits;
  } catch {
    return 100;
  }
}

/** Money is {amount (minor units), formatted}; widgets get major units. */
function money(value, currency) {
  if (value == null) return null;
  const amount = typeof value === 'object' ? numOrNull(value.amount) : numOrNull(value);
  if (amount == null) return null;
  return Math.round((amount / minorUnits(currency)) * 100) / 100;
}

// The internal name (raw.name) often holds owner names, unit codes or notes,
// so a property without a public name is shown as "Untitled listing".
function publicName(raw) {
  return str(raw.public_name) || 'Untitled listing';
}

function rooms(raw) {
  const list = Array.isArray(raw.room_details) ? raw.room_details : [];
  // The spec shows two shapes: [{type, beds:[{type, quantity}]}] and a flat [{type, quantity}] of beds.
  const flat = list.length > 0 && list.every((r) => r && !Array.isArray(r.beds) && /bed|crib|couch|mattress|hammock/.test(String(r.type)));
  const groups = flat ? [{ type: 'bedroom', beds: list }] : list;
  const counts = {};
  const out = [];
  for (const room of groups) {
    if (!room || !Array.isArray(room.beds)) continue;
    const beds = room.beds
      .filter((b) => b && b.type)
      .map((b) => ({ type: String(b.type), label: BED_LABELS[String(b.type).toLowerCase()] || words(b.type), quantity: Math.max(1, numOrNull(b.quantity) || 1) }));
    if (!beds.length) continue;
    const type = String(room.type || 'bedroom').toLowerCase();
    counts[type] = (counts[type] || 0) + 1;
    const base = ROOM_LABELS[type] || words(type);
    // Bedrooms are numbered; other rooms keep their plain name ("Living room").
    out.push({ name: type === 'bedroom' ? `${base} ${counts[type]}` : base, type, beds });
  }
  return out;
}

function channels(raw) {
  const out = [];
  const seen = new Set();
  const add = (platform, url) => {
    const safe = httpsUrl(url);
    if (!safe || seen.has(safe)) return;
    seen.add(safe);
    out.push({ platform, name: CHANNEL_NAMES[platform] || words(platform), url: safe });
  };
  for (const l of Array.isArray(raw.listings) ? raw.listings : []) {
    const platform = String(l?.platform || '').toLowerCase();
    const id = String(l?.platform_id || '').trim();
    if (!/^\d+$/.test(id)) continue;
    if (platform === 'airbnb') add('airbnb', `https://www.airbnb.com/rooms/${id}`);
    if (platform === 'homeaway' || platform === 'vrbo') add('vrbo', `https://www.vrbo.com/${id}`);
  }
  const b = raw.bookings || {};
  for (const url of [].concat(b.site_urls || b.site_ids || [])) add('direct', url);
  return out;
}

function fees(raw, currency) {
  const b = raw.bookings || {};
  const out = [];
  for (const fee of Array.isArray(b.fees) ? b.fees : []) {
    if (!fee || !fee.name) continue;
    const name = FEE_LABELS[fee.name] || words(fee.name);
    if (fee.type === 'percent') {
      const pct = numOrNull(fee.value);
      if (pct != null && pct > 0) out.push({ name, amount: pct, type: 'percent' });
    } else {
      const amount = money(fee.value, currency);
      if (amount != null && amount > 0) out.push({ name, amount, type: 'fixed' });
    }
  }
  return out;
}

function deposit(raw, currency) {
  const list = Array.isArray(raw.bookings?.security_deposits) ? raw.bookings.security_deposits : [];
  const pick = list.find((d) => d?.name === 'direct') || list.find((d) => d?.name === 'base');
  if (!pick || pick.type === 'percent') return null;
  const amount = money(pick.value, currency);
  return amount && amount > 0 ? amount : null;
}

function occupancyFee(rule, currency) {
  if (!rule || rule.type === 'percent') return null;
  const amount = money(rule.value, currency);
  return amount && amount > 0 ? amount : null;
}

function discounts(raw) {
  const out = [];
  for (const d of Array.isArray(raw.bookings?.discounts) ? raw.bookings.discounts : []) {
    const pct = numOrNull(d?.value);
    if (d?.type === 'percent' && pct && pct > 0) out.push({ name: `${words(d.name)} discount`, percent: pct });
  }
  return out;
}

function lines(value) {
  const list = Array.isArray(value) ? value : value ? [value] : [];
  const out = list.map(str).filter(Boolean);
  return out.length ? out.join('\n') : null;
}

/** Short card for the property picker and the Property list widget. */
export function summary(raw) {
  const capacity = raw.capacity || {};
  return {
    id: String(raw.id),
    property_name: publicName(raw),
    photo: httpsUrl(raw.picture),
    city: str(raw.address?.city),
    country: str(raw.address?.country_name) || str(raw.address?.country),
    max_guests: numOrNull(capacity.max),
    bedrooms: numOrNull(capacity.bedrooms),
    currency: str(raw.currency) || 'USD',
    price_from: null,
  };
}

/** Full public property data, without photos (they come from a separate call). */
export function property(raw) {
  const capacity = raw.capacity || {};
  const rules = raw.house_rules || {};
  const details = raw.details || {};
  const b = raw.bookings || {};
  const currency = str(raw.currency) || 'USD';
  const occ = b.occupancy_based_rules || {};
  const extraGuestFee = occupancyFee(occ.extra_guest_fee, currency);
  return {
    id: String(raw.id),
    property_name: publicName(raw),
    summary: str(raw.summary),
    description: str(raw.description),
    property_type: str(raw.property_type),
    room_type: str(raw.room_type),
    city: str(raw.address?.city),
    state: str(raw.address?.state),
    country: str(raw.address?.country_name) || str(raw.address?.country),
    max_guests: numOrNull(capacity.max),
    bedrooms: numOrNull(capacity.bedrooms),
    beds: numOrNull(capacity.beds),
    bathrooms: numOrNull(capacity.bathrooms),
    check_in: hhmm(raw['check-in'] ?? raw.check_in ?? raw.checkin),
    check_out: hhmm(raw['check-out'] ?? raw.check_out ?? raw.checkout),
    currency,
    amenities: amenities(raw.amenities),
    pets_allowed: boolOrNull(rules.pets_allowed),
    smoking_allowed: boolOrNull(rules.smoking_allowed),
    events_allowed: boolOrNull(rules.events_allowed),
    children_allowed: boolOrNull(rules.children_allowed),
    infants_allowed: boolOrNull(rules.infants_allowed),
    additional_rules: str(details.additional_rules),
    rooms: rooms(raw),
    space: str(details.space_overview),
    neighborhood: str(details.neighborhood_description),
    getting_around: str(details.getting_around),
    cancellation_policy: lines(b.booking_policies?.cancellation),
    payment_terms: b.booking_policies?.payment_terms?.status === 'disabled' ? null : lines(b.booking_policies?.payment_terms?.description),
    fees: fees(raw, currency),
    cleaning_fee: money((Array.isArray(b.fees) ? b.fees : []).find((f) => f?.name === 'cleaning_fee' && f.type !== 'percent')?.value, currency),
    security_deposit: deposit(raw, currency),
    extra_guest_fee: extraGuestFee,
    extra_guest_after: extraGuestFee ? numOrNull(occ.guests_included) : null,
    pet_fee: occupancyFee(occ.pet_fee, currency),
    discounts: discounts(raw),
    channels: channels(raw),
    photos: [],
  };
}

/** Photos in the host's order; falls back to the cover picture. */
export function photos(rawImages, coverUrl) {
  const list = (Array.isArray(rawImages) ? rawImages : [])
    .map((img, i) => ({ img, i }))
    .sort((a, b) => (numOrNull(a.img?.order) ?? a.i) - (numOrNull(b.img?.order) ?? b.i))
    .map(({ img }) => ({ url: httpsUrl(img?.url), thumbnail_url: httpsUrl(img?.thumbnail_url) || httpsUrl(img?.url), caption: str(img?.caption) }))
    .filter((p) => p.url);
  if (!list.length && httpsUrl(coverUrl)) list.push({ url: httpsUrl(coverUrl), thumbnail_url: httpsUrl(coverUrl), caption: null });
  return list;
}

/** Calendar days: date, available, nightly price (major units), minimum stay. Notes are dropped. */
export function calendar(rawData, fallbackCurrency) {
  const days = Array.isArray(rawData?.days) ? rawData.days : [];
  let currency = fallbackCurrency || 'USD';
  const out = [];
  for (const day of days) {
    if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(String(day.date))) continue;
    if (day.price?.currency) currency = day.price.currency;
    const available = day.status?.available === true;
    out.push({
      date: day.date,
      available,
      price: available ? money(day.price, day.price?.currency || currency) : null,
      min_stay: numOrNull(day.min_stay),
    });
  }
  out.sort((a, b) => (a.date < b.date ? -1 : 1));
  return { currency, calendar: out };
}

/** Lowest available nightly price from today on. */
export function priceFrom(days, today) {
  let low = null;
  for (const d of days || []) {
    if (d.date >= today && d.available && typeof d.price === 'number' && (low == null || d.price < low)) low = d.price;
  }
  return low;
}

/** Public reviews only: rating, text, host response, guest first name, date. */
export function reviews(rawList, total) {
  const out = [];
  for (const r of Array.isArray(rawList) ? rawList : []) {
    if (!r || !r.public) continue;
    const rating = numOrNull(r.public.rating);
    out.push({
      id: String(r.id),
      rating: rating && rating > 0 ? rating : null,
      text: str(r.public.review),
      host_response: str(r.public.response),
      guest_name: (str(r.guest?.first_name) || 'Guest').split(/\s+/)[0],
      date: str(r.reviewed_at)?.slice(0, 10) || null,
      platform: str(r.platform),
    });
  }
  out.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const rated = out.filter((r) => r.rating);
  const average = rated.length ? Math.round((rated.reduce((s, r) => s + r.rating, 0) / rated.length) * 100) / 100 : null;
  return {
    reviews: out,
    rating_average: average,
    review_count: Math.max(numOrNull(total) || 0, out.length),
  };
}

/** Parses PUBLIC_GUIDE_TOPICS ("Local attractions, Restaurants") into lowercase names. */
export function topicList(value) {
  return String(value || '')
    .split(/[,\n]/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** Knowledge Hub topics the host allowed in public; everything else is dropped. */
export function guide(rawData, allowed) {
  const names = new Set(allowed);
  const topics = Array.isArray(rawData?.topics) ? rawData.topics : [];
  return {
    guide: topics
      .filter((t) => t && names.has(String(t.name || '').trim().toLowerCase()))
      .map((t) => ({
        title: str(t.name),
        items: (Array.isArray(t.aggregate_items) ? t.aggregate_items : [])
          .filter((i) => i && (i.state == null || i.state === 'ready') && str(i.content))
          .map((i) => guideItem(str(i.content))),
      }))
      .filter((t) => t.items.length),
  };
}

/** "Uluwatu Temple: a sea temple..." becomes a title and a body; other text stays whole. */
function guideItem(content) {
  const m = /^([^:\n]{2,60}):\s+([\s\S]+)$/.exec(content);
  if (m && !/https?$/i.test(m[1])) {
    const body = m[2].trim();
    return { title: m[1].trim(), body: body.charAt(0).toUpperCase() + body.slice(1) };
  }
  return { title: null, body: content };
}

/** Host or company name and profile picture; nothing else from /v2/user. */
export function host(raw) {
  const name = raw?.business && str(raw.company) ? str(raw.company) : str(raw?.name);
  return { host_name: name || 'Your host', host_picture: httpsUrl(raw?.profile_picture) };
}

const PLATFORM_NAMES = { airbnb: 'Airbnb', homeaway: 'Vrbo', vrbo: 'Vrbo', booking: 'Booking.com', direct: 'Direct booking', manual: 'Direct booking' };
const HOUR = 3_600_000;

/** "2026-10-26T15:00:00+08:00" → its date and time on the property's own clock. */
function localParts(iso) {
  const m = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}))?/.exec(String(iso || ''));
  return m ? { date: m[1], time: m[2] || null } : null;
}

/** The UTC offset an ISO timestamp is written in, in ms ("Z" and none are 0). */
function offsetOf(iso) {
  const m = /([+-])(\d{2}):?(\d{2})$/.exec(String(iso || ''));
  return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) * 60_000 : 0;
}

/** An instant written on the property's clock: "2026-10-25T15:00". */
function onClock(ms, offset) {
  return new Date(ms + offset).toISOString().slice(0, 16);
}

/** What the guest paid, line by line. The host's side of the financials is never copied. */
function paymentLines(guest, currency) {
  const g = guest || {};
  const out = [];
  const add = (item, kind) => {
    const amount = money(item, currency);
    if (amount == null || (amount === 0 && kind !== 'accommodation')) return;
    out.push({ label: str(item.label) || words(kind), amount, kind });
  };
  if (g.accommodation) add(g.accommodation, 'accommodation');
  for (const [list, kind] of [[g.fees, 'fee'], [g.discounts, 'discount'], [g.adjustments, 'adjustment'], [g.taxes, 'tax']]) {
    for (const item of Array.isArray(list) ? list : []) if (item && typeof item === 'object') add(item, kind);
  }
  return out;
}

/** Hospitable's own word on whether a stay is on: accepted, and a guest's (not an owner's). */
export function confirmed(raw) {
  const category = raw?.reservation_status?.current?.category ?? raw?.status;
  return category === 'accepted' && raw?.stay_type !== 'owner_stay';
}

/**
 * A signed-in guest's own stay. `details` are the property's details
 * (GET /properties/{id}), `guide` the Knowledge Hub topics guests may read.
 * Arrival details (door code, check-in instructions, Wi-Fi) are only copied
 * from `revealHours` before check-in until check-out.
 */
export function stay(raw, details, guide, now, revealHours) {
  const p = (Array.isArray(raw.properties) && raw.properties[0]) || {};
  const d = details || {};
  const g = raw.guests || {};
  const offset = offsetOf(raw.check_in);
  const checkIn = Date.parse(raw.check_in);
  const checkOut = Date.parse(raw.check_out);
  const arrival = localParts(raw.arrival_date)?.date || localParts(raw.check_in)?.date || null;
  const departure = localParts(raw.departure_date)?.date || localParts(raw.check_out)?.date || null;
  const today = onClock(now, offset).slice(0, 10);
  const from = checkIn - revealHours * HOUR;
  const open = Number.isFinite(checkIn) && Number.isFinite(checkOut) && now >= from && now < checkOut;
  let phase = null;
  if (arrival && departure) phase = today < arrival ? 'upcoming' : today === arrival ? 'arrival' : today < departure ? 'staying' : today === departure ? 'departure' : 'over';
  const coords = p.address?.coordinates || {};
  const lat = numOrNull(coords.latitude);
  const lng = numOrNull(coords.longitude);
  const address = str(p.address?.display);
  const currency = str(raw.financials?.currency) || str(p.currency) || 'USD';
  const reveal = Number.isFinite(from) ? onClock(from, offset) : null;
  return {
    signed_in: true,
    stay_guest_name: str(raw.guest?.first_name),
    stay_code: str(raw.platform_id),
    stay_platform: PLATFORM_NAMES[String(raw.platform || '').toLowerCase()] || words(raw.platform) || null,
    stay_property_id: p.id ? String(p.id) : null,
    stay_property_name: publicName(p),
    stay_property_photo: httpsUrl(p.picture),
    stay_arrival_date: arrival,
    stay_departure_date: departure,
    stay_nights: numOrNull(raw.nights),
    stay_check_in: localParts(raw.check_in)?.time || hhmm(p['check-in']),
    stay_check_out: localParts(raw.check_out)?.time || hhmm(p['check-out']),
    stay_guests: numOrNull(g.total),
    stay_adults: numOrNull(g.adult_count),
    stay_children: numOrNull(g.child_count),
    stay_infants: numOrNull(g.infant_count),
    stay_pets: numOrNull(g.pet_count),
    stay_phase: phase,
    stay_days_to_arrival: arrival && today < arrival ? Math.round((Date.parse(arrival) - Date.parse(today)) / 86_400_000) : 0,
    stay_access_open: open,
    stay_access_ended: Number.isFinite(checkOut) && now >= checkOut,
    stay_access_date: reveal && reveal.slice(0, 10),
    stay_access_time: reveal && reveal.slice(11, 16),
    stay_door_code: open ? str(raw.smartlock_code) : null,
    stay_checkin_instructions: open ? str(d.guest_access) : null,
    stay_wifi_name: open ? str(d.wifi_name) : null,
    stay_wifi_password: open ? str(d.wifi_password) : null,
    stay_address: address,
    stay_map_url: lat != null && lng != null ? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}` : address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}` : null,
    stay_house_manual: str(d.house_manual),
    stay_currency: currency,
    stay_payment: paymentLines(raw.financials?.guest, currency),
    stay_total: money(raw.financials?.guest?.total_price, currency),
    stay_guide: Array.isArray(guide) ? guide : [],
  };
}
