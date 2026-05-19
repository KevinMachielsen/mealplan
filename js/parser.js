const UNITS = [
  'kilogram','kg','gram','gr','g','liter','ltr','l','milliliter','ml',
  'centimeter','cm',
  'eetlepel','el','theelepel','tl','eetlepels','theelepels',
  'kop','kopje','kopjes','cup','cups',
  'stuk','stuks','plak','plakken','teen','teentje','teentjes',
  'blikje','blikjes','blik','bakje','bakjes','zakje','zakjes',
  'flesje','flesjes','potje','potjes','bosje','bosjes',
  'handvol','handje','snuf','snufje','mespuntje','mespunt',
  'dl','deciliter','cl','centiliter','pond','ons'
];

const UNIT_NORM = {
  'kilogram': 'kg',
  'gram': 'g', 'gr': 'g',
  'liter': 'l', 'ltr': 'l',
  'centimeter': 'cm',
  'milliliter': 'ml',
  'deciliter': 'dl', 'centiliter': 'cl',
  'eetlepel': 'el', 'eetlepels': 'el',
  'theelepel': 'tl', 'theelepels': 'tl',
  'kopje': 'kop', 'kopjes': 'kop', 'cups': 'cup',
  'stuks': 'stuk', 'plakken': 'plak',
  'teentje': 'teen', 'teentjes': 'teen',
  'blikjes': 'blik', 'bakjes': 'bakje', 'zakjes': 'zakje',
  'flesjes': 'flesje', 'potjes': 'potje', 'bosjes': 'bosje'
};

const UNIT_TO_ML = { l: 1000, dl: 100, cl: 10, ml: 1, el: 15, tl: 5, kop: 240, cup: 240 };
const UNIT_TO_G  = { kg: 1000, g: 1, pond: 500, ons: 100 };

const UNICODE_FRACTIONS = {
  '½': 0.5, '⅓': 1/3, '¼': 0.25, '¾': 0.75, '⅔': 2/3,
  '⅕': 0.2, '⅖': 0.4, '⅗': 0.6, '⅘': 0.8,
  '⅙': 1/6, '⅚': 5/6, '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875
};

function parseAmount(str) {
  str = str.trim().replace(',', '.');
  if (!str) return null;
  // "2-3" → average
  const range = str.match(/^(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)$/);
  if (range) return (parseFloat(range[1]) + parseFloat(range[2])) / 2;
  // "2 1/2"
  const mixed = str.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/);
  if (mixed) return parseInt(mixed[1]) + parseInt(mixed[2]) / parseInt(mixed[3]);
  // "1/2"
  const frac = str.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (frac) return parseInt(frac[1]) / parseInt(frac[2]);
  return parseFloat(str) || null;
}

function normalizeUnit(unit) {
  const lower = unit.toLowerCase().trim();
  return UNIT_NORM[lower] || lower;
}

function normalizeIngredientName(name) {
  return name.toLowerCase()
    .replace(/[()[\]{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Strips common Dutch plural suffixes for smarter ingredient matching
function stemName(name) {
  const n = normalizeIngredientName(name);
  if (n.endsWith('tjes')) return n.slice(0, -4) + 'tje';
  if (n.endsWith('jes'))  return n.slice(0, -3) + 'je';
  if (n.endsWith('ies'))  return n.slice(0, -3) + 'ie';
  if (n.endsWith('eren')) return n.slice(0, -4);   // eieren → ei
  if (n.endsWith('eren')) return n.slice(0, -4);
  if (n.endsWith('aten')) return n.slice(0, -4) + 'aat'; // tomaten → tomaat
  if (n.endsWith('elen')) return n.slice(0, -4) + 'el';  // wortelen → wortel
  if (n.endsWith('olen')) return n.slice(0, -4) + 'ol';
  if (n.endsWith('alen')) return n.slice(0, -4) + 'aal';
  if (n.endsWith('en'))   return n.slice(0, -2);   // uien → ui, filets → filet (handled below)
  if (n.endsWith('s'))    return n.slice(0, -1);   // courgettes → courgette
  return n;
}

function namesMatch(a, b) {
  const na = normalizeIngredientName(a);
  const nb = normalizeIngredientName(b);
  if (na === nb) return true;
  return stemName(na) === stemName(nb);
}

function parseIngredientText(text) {
  if (!text || typeof text !== 'string') return { amount: null, unit: '', name: text || '', raw: text };

  let str = text.trim();

  // Replace unicode fractions
  for (const [frac, val] of Object.entries(UNICODE_FRACTIONS)) {
    str = str.replace(new RegExp(frac, 'g'), val + ' ');
  }

  // Strip leading decorative characters (bullets, checkboxes like ▢□◻, dashes)
  str = str.replace(/^[\s■-◿☐-☒✔✘•·\-–]\s*/u, '');

  // Amount regex: fractions first so "1/2" isn't stolen by plain "1"
  // Order: "2 1/2" → "1/2" → "2-3" → "2.5" → "2"
  const amountPattern = /^(\d+\s+\d+\s*\/\s*\d+|\d+\s*\/\s*\d+|\d+(?:[.,]\d+)?(?:\s*[-–]\s*\d+(?:[.,]\d+)?)?)/;
  const amountMatch = str.match(amountPattern);

  let amount = null;
  let unit = '';
  let name = str;

  if (amountMatch) {
    amount = parseAmount(amountMatch[1]);
    let rest = str.slice(amountMatch[1].length).trim();

    // Match unit (longest first to avoid 'g' matching before 'gr')
    const sortedUnits = [...UNITS].sort((a, b) => b.length - a.length);
    for (const u of sortedUnits) {
      const re = new RegExp(`^${u}\\.?(?=\\s|$)`, 'i');
      if (re.test(rest)) {
        unit = normalizeUnit(u);
        rest = rest.replace(re, '').trim();
        break;
      }
    }

    name = rest;
  }

  // Strip parenthetical notes and anything after comma
  name = name.replace(/\s*\(.*?\)\s*/g, ' ').trim();
  name = name.replace(/,.*$/, '').trim();

  return { amount, unit, name: name || str, raw: text };
}

function formatAmount(amount, unit) {
  if (amount === null || amount === undefined) return '';
  let num;
  if (Math.abs(amount - Math.round(amount)) < 0.01) {
    num = Math.round(amount).toString();
  } else {
    const quarters = { 0.25: '¼', 0.5: '½', 0.75: '¾', 1.25: '1¼', 1.5: '1½', 1.75: '1¾', 2.5: '2½', 3.5: '3½' };
    num = quarters[amount] !== undefined ? quarters[amount] : parseFloat(amount.toFixed(2)).toString();
  }
  return unit ? `${num} ${unit}` : num;
}

// ─── Ingredient aggregation ──────────────────────────────────────────────────
function aggregateIngredients(ingredientArrays) {
  const list = [];

  for (const ingredients of ingredientArrays) {
    for (const ing of ingredients) {
      const parsed = typeof ing === 'string' ? parseIngredientText(ing) : { ...ing };
      const ingName = normalizeIngredientName(parsed.name || parsed.raw || '');
      if (!ingName) continue;

      // Try to find an existing entry with a matching name
      const existing = list.find(e => namesMatch(e.name, ingName));

      if (existing) {
        // Same or convertible unit → add amounts
        if (existing.unit === (parsed.unit || '')) {
          existing.amount = (existing.amount || 0) + (parsed.amount || 0);
          existing.count = (existing.count || 1) + 1;
          continue;
        }
        // Volume conversion
        const evml = UNIT_TO_ML[existing.unit], pvml = UNIT_TO_ML[parsed.unit || ''];
        if (evml && pvml) {
          existing.amount = ((existing.amount || 0) * evml + (parsed.amount || 0) * pvml) / evml;
          existing.count = (existing.count || 1) + 1;
          continue;
        }
        // Mass conversion
        const evg = UNIT_TO_G[existing.unit], pvg = UNIT_TO_G[parsed.unit || ''];
        if (evg && pvg) {
          existing.amount = ((existing.amount || 0) * evg + (parsed.amount || 0) * pvg) / evg;
          existing.count = (existing.count || 1) + 1;
          continue;
        }
        // Incompatible units: append separate entry
      }

      list.push({ ...parsed, name: parsed.name || parsed.raw, count: 1 });
    }
  }

  return list;
}

// ─── Recipe coverage vs pantry ───────────────────────────────────────────────
function calculateCoverage(recipe, pantry) {
  if (!recipe.ingredients || recipe.ingredients.length === 0) return 0;
  let covered = 0;
  for (const ing of recipe.ingredients) {
    const parsed = typeof ing === 'string' ? parseIngredientText(ing) : ing;
    const ingName = parsed.name || parsed.raw || '';
    const found = pantry.some(p => namesMatch(p.name, ingName));
    if (found) covered++;
  }
  return Math.round((covered / recipe.ingredients.length) * 100);
}
