const UNITS = [
  'kilogram','kg','gram','g','liter','l','milliliter','ml',
  'eetlepel','el','theelepel','tl','eetlepels','theelepels',
  'kop','kopje','kopjes','cup','cups',
  'stuk','stuks','plak','plakken','teen','teentje','teentjes',
  'blikje','blikjes','blik','bakje','bakjes','zakje','zakjes',
  'flesje','flesjes','potje','potjes','bosje','bosjes',
  'handvol','handje','snuf','snufje','mespuntje','mespunt',
  'dl','deciliter','cl','centiliter',
  'pond','ons'
];

const UNIT_NORM = {
  'kilogram': 'kg', 'gram': 'g', 'liter': 'l', 'milliliter': 'ml',
  'deciliter': 'dl', 'centiliter': 'cl',
  'eetlepel': 'el', 'eetlepels': 'el', 'theelepel': 'tl', 'theelepels': 'tl',
  'kopje': 'kop', 'kopjes': 'kop', 'cups': 'cup',
  'stuks': 'stuk', 'plakken': 'plak', 'teentje': 'teen', 'teentjes': 'teen',
  'blikjes': 'blik', 'bakjes': 'bakje', 'zakjes': 'zakje',
  'flesjes': 'flesje', 'potjes': 'potje', 'bosjes': 'bosje'
};

// Conversions to a base unit (g for mass, ml for volume)
const UNIT_TO_ML = { l: 1000, dl: 100, cl: 10, ml: 1, el: 15, tl: 5, kop: 240, cup: 240 };
const UNIT_TO_G  = { kg: 1000, g: 1, pond: 500, ons: 100 };

const UNICODE_FRACTIONS = {
  '½': 0.5, '⅓': 1/3, '¼': 0.25, '¾': 0.75, '⅔': 2/3,
  '⅕': 0.2, '⅖': 0.4, '⅗': 0.6, '⅘': 0.8,
  '⅙': 1/6, '⅚': 5/6, '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875
};

function parseAmount(str) {
  str = str.trim();
  if (!str) return null;

  // "2-3" → average
  const rangeMatch = str.match(/^(\d+(?:[.,]\d+)?)\s*[-–]\s*(\d+(?:[.,]\d+)?)$/);
  if (rangeMatch) {
    return (parseFloat(rangeMatch[1].replace(',', '.')) + parseFloat(rangeMatch[2].replace(',', '.'))) / 2;
  }

  // "2 1/2" → 2.5
  const mixedMatch = str.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/);
  if (mixedMatch) {
    return parseInt(mixedMatch[1]) + parseInt(mixedMatch[2]) / parseInt(mixedMatch[3]);
  }

  // "1/2" → 0.5
  const fracMatch = str.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (fracMatch) return parseInt(fracMatch[1]) / parseInt(fracMatch[2]);

  return parseFloat(str.replace(',', '.')) || null;
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

function parseIngredientText(text) {
  if (!text || typeof text !== 'string') return { amount: null, unit: '', name: text || '', raw: text };

  let str = text.trim();

  // Replace unicode fractions
  for (const [frac, val] of Object.entries(UNICODE_FRACTIONS)) {
    str = str.replace(new RegExp(frac, 'g'), val + ' ');
  }

  // Strip leading bullet / dash
  str = str.replace(/^[-•·]\s*/, '');

  // Try to match amount (with optional fraction) at start
  const amountPattern = /^(\d+(?:[.,]\d+)?(?:\s*[-–]\s*\d+(?:[.,]\d+)?)?(?:\s+\d+\s*\/\s*\d+)?|\d+\s*\/\s*\d+|\d+(?:[.,]\d+)?)/;
  const amountMatch = str.match(amountPattern);

  let amount = null;
  let unit = '';
  let name = str;

  if (amountMatch) {
    amount = parseAmount(amountMatch[1]);
    let rest = str.slice(amountMatch[1].length).trim();

    // Check for unit
    const sortedUnits = [...UNITS].sort((a, b) => b.length - a.length);
    for (const u of sortedUnits) {
      const re = new RegExp(`^${u}(?:\\.)?(?=\\s|$)`, 'i');
      if (re.test(rest)) {
        unit = normalizeUnit(u);
        rest = rest.replace(re, '').trim();
        break;
      }
    }

    name = rest;
  }

  // Strip parenthetical notes from name but keep them accessible
  name = name.replace(/\s*\(.*?\)\s*/g, ' ').trim();
  name = name.replace(/,.*$/, '').trim(); // strip after comma

  return { amount, unit, name: name || str, raw: text };
}

function formatAmount(amount, unit) {
  if (amount === null || amount === undefined) return '';
  let num;
  if (Math.abs(amount - Math.round(amount)) < 0.01) {
    num = Math.round(amount).toString();
  } else if (Math.abs(amount * 4 - Math.round(amount * 4)) < 0.01) {
    // Quarter-fractions
    const quarters = { 0.25: '¼', 0.5: '½', 0.75: '¾', 1.25: '1¼', 1.5: '1½', 1.75: '1¾' };
    num = quarters[amount] || amount.toFixed(1);
  } else {
    num = parseFloat(amount.toFixed(2)).toString();
  }
  return unit ? `${num} ${unit}` : num;
}

// ─── Ingredient aggregation ──────────────────────────────────────────────────
function aggregateIngredients(ingredientArrays) {
  // ingredientArrays: array of ingredient arrays (one per recipe)
  const map = new Map();

  for (const ingredients of ingredientArrays) {
    for (const ing of ingredients) {
      const parsed = typeof ing === 'string' ? parseIngredientText(ing) : ing;
      const nameKey = normalizeIngredientName(parsed.name || parsed.raw || '');
      if (!nameKey) continue;

      // Try to merge with same name + compatible units
      let merged = false;
      for (const [key, existing] of map.entries()) {
        if (normalizeIngredientName(existing.name) !== nameKey) continue;

        // Same unit or both null
        if (existing.unit === (parsed.unit || '')) {
          existing.amount = (existing.amount || 0) + (parsed.amount || 0);
          existing.count = (existing.count || 1) + 1;
          merged = true;
          break;
        }

        // Try volume conversion
        const baseExist = UNIT_TO_ML[existing.unit];
        const baseParsed = UNIT_TO_ML[parsed.unit || ''];
        if (baseExist && baseParsed) {
          existing.amount = ((existing.amount || 0) * baseExist + (parsed.amount || 0) * baseParsed) / baseExist;
          existing.count = (existing.count || 1) + 1;
          merged = true;
          break;
        }

        // Try mass conversion
        const massExist = UNIT_TO_G[existing.unit];
        const massParsed = UNIT_TO_G[parsed.unit || ''];
        if (massExist && massParsed) {
          existing.amount = ((existing.amount || 0) * massExist + (parsed.amount || 0) * massParsed) / massExist;
          existing.count = (existing.count || 1) + 1;
          merged = true;
          break;
        }
      }

      if (!merged) {
        const key = `${nameKey}|${parsed.unit || ''}|${map.size}`;
        map.set(key, { ...parsed, name: parsed.name || parsed.raw, count: 1 });
      }
    }
  }

  return Array.from(map.values());
}

// ─── Recipe coverage vs pantry ───────────────────────────────────────────────
function calculateCoverage(recipe, pantry) {
  if (!recipe.ingredients || recipe.ingredients.length === 0) return 0;
  let covered = 0;
  for (const ing of recipe.ingredients) {
    const parsed = typeof ing === 'string' ? parseIngredientText(ing) : ing;
    const ingName = normalizeIngredientName(parsed.name || parsed.raw || '');
    const found = pantry.some(p => {
      const pName = normalizeIngredientName(p.name);
      return pName === ingName || pName.includes(ingName) || ingName.includes(pName);
    });
    if (found) covered++;
  }
  return Math.round((covered / recipe.ingredients.length) * 100);
}
