// Proxies are tried in order; first success wins
const PROXIES = [
  {
    make: url => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
    parse: async res => res.text()
  },
  {
    make: url => `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
    parse: async res => { const d = await res.json(); return d.contents || ''; }
  },
  {
    make: url => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    parse: async res => res.text()
  }
];

async function fetchWithTimeout(url, ms = 12000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    return res;
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

async function fetchHtml(url) {
  let lastError = null;

  for (const proxy of PROXIES) {
    try {
      const proxyUrl = proxy.make(url);
      const res = await fetchWithTimeout(proxyUrl, 12000);

      if (res.status === 403 || res.status === 401) {
        lastError = 'blocked';
        continue;
      }
      if (!res.ok) continue;

      const html = await proxy.parse(res);
      if (!html || html.length < 200) continue;

      if (isCloudflareChallenge(html)) {
        lastError = 'cloudflare';
        continue;
      }

      return html;
    } catch (e) {
      if (e.name === 'AbortError') lastError = 'timeout';
      else lastError = lastError || 'network';
    }
  }

  // Produce a helpful error message
  if (lastError === 'blocked') {
    throw new Error('Deze website blokkeert automatisch importeren (403). Kopieer de ingrediënten handmatig.');
  }
  if (lastError === 'cloudflare') {
    throw new Error('Deze website is beveiligd en blokkeert automatisch importeren. Kopieer de ingrediënten handmatig.');
  }
  if (lastError === 'timeout') {
    throw new Error('Verbinding time-out. Controleer je internet of probeer het later opnieuw.');
  }
  throw new Error('Kon de pagina niet laden. Kopieer de ingrediënten handmatig of probeer een andere URL.');
}

function isCloudflareChallenge(html) {
  return html.includes('cf-browser-verification') ||
    html.includes('cf_chl_prog') ||
    (html.includes('Just a moment') && html.includes('Checking your browser'));
}

const Scraper = {
  async scrape(url) {
    const html = await fetchHtml(url);

    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    const recipe = this._findJsonLdRecipe(doc);
    if (recipe) return this._parseJsonLd(recipe, url, doc);

    const microdata = this._findMicrodata(doc);
    if (microdata) return microdata;

    throw new Error('Geen recept-data gevonden op deze pagina. Vul de gegevens handmatig in.');
  },

  _findJsonLdRecipe(doc) {
    const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
    for (const script of scripts) {
      try {
        const data = JSON.parse(script.textContent);
        const recipe = this._extractRecipeFromLd(data);
        if (recipe) return recipe;
      } catch {}
    }
    return null;
  },

  _extractRecipeFromLd(data) {
    if (!data) return null;
    if (Array.isArray(data)) {
      for (const item of data) {
        const r = this._extractRecipeFromLd(item);
        if (r) return r;
      }
      return null;
    }
    if (data['@type'] === 'Recipe') return data;
    if (Array.isArray(data['@type']) && data['@type'].includes('Recipe')) return data;
    if (data['@graph']) return this._extractRecipeFromLd(data['@graph']);
    return null;
  },

  _parseJsonLd(recipe, sourceUrl, doc) {
    return {
      name: this._cleanText(recipe.name || ''),
      description: this._cleanText(
        typeof recipe.description === 'string' ? recipe.description : recipe.description?.['@value'] || ''
      ),
      image: this._extractImage(recipe.image, doc),
      source: sourceUrl,
      prepTime: this._parseDuration(recipe.prepTime),
      cookTime: this._parseDuration(recipe.cookTime) || this._parseDuration(recipe.totalTime),
      servings: this._parseServings(recipe.recipeYield),
      ingredients: this._parseIngredients(recipe.recipeIngredient || []),
      instructions: this._parseInstructions(recipe.recipeInstructions || []),
      tags: this._parseTags(recipe.keywords, recipe.recipeCategory, recipe.recipeCuisine)
    };
  },

  _extractImage(imageData, doc) {
    if (!imageData) {
      const og = doc.querySelector('meta[property="og:image"]');
      return og ? og.getAttribute('content') : '';
    }
    if (typeof imageData === 'string') return imageData;
    if (Array.isArray(imageData)) {
      const first = imageData[0];
      return typeof first === 'string' ? first : first?.url || '';
    }
    return imageData.url || imageData.contentUrl || '';
  },

  _parseDuration(iso) {
    if (!iso) return 0;
    const match = iso.match(/PT?(?:(\d+)H)?(?:(\d+)M)?/i);
    if (!match) return 0;
    return (parseInt(match[1] || 0) * 60) + parseInt(match[2] || 0);
  },

  _parseServings(yieldData) {
    if (!yieldData) return 4;
    const str = Array.isArray(yieldData) ? yieldData[0] : yieldData;
    const match = String(str).match(/\d+/);
    return match ? parseInt(match[0]) : 4;
  },

  _parseIngredients(ingredients) {
    if (!Array.isArray(ingredients)) return [];
    return ingredients
      .map(ing => {
        const text = typeof ing === 'string' ? ing : ing.text || ing.name || '';
        return this._cleanText(text);
      })
      .filter(Boolean);
  },

  _parseInstructions(instructions) {
    if (!instructions) return [];
    if (typeof instructions === 'string') {
      return instructions.split(/\n+/).map(s => this._cleanText(s)).filter(Boolean);
    }
    if (!Array.isArray(instructions)) return [];

    const steps = [];
    for (const item of instructions) {
      if (typeof item === 'string') {
        steps.push(this._cleanText(item));
      } else if (item['@type'] === 'HowToStep') {
        steps.push(this._cleanText(item.text || item.name || ''));
      } else if (item['@type'] === 'HowToSection') {
        if (item.name) steps.push(`**${item.name}**`);
        if (Array.isArray(item.itemListElement)) {
          for (const sub of item.itemListElement) {
            steps.push(this._cleanText(sub.text || sub.name || ''));
          }
        }
      }
    }
    return steps.filter(Boolean);
  },

  _parseTags(keywords, category, cuisine) {
    const tags = [];
    if (keywords) {
      const kws = typeof keywords === 'string' ? keywords.split(',') : [].concat(keywords);
      tags.push(...kws.map(k => k.trim()).filter(Boolean).slice(0, 5));
    }
    if (category) tags.push(...[].concat(category).map(c => c.trim()).filter(Boolean));
    if (cuisine) tags.push(...[].concat(cuisine).map(c => c.trim()).filter(Boolean));
    return [...new Set(tags)].slice(0, 8);
  },

  _findMicrodata(doc) {
    const recipeEl = doc.querySelector('[itemtype*="schema.org/Recipe"]');
    if (!recipeEl) return null;
    const get = prop => {
      const el = recipeEl.querySelector(`[itemprop="${prop}"]`);
      return el ? (el.content || el.textContent || '').trim() : '';
    };
    const getAll = prop =>
      Array.from(recipeEl.querySelectorAll(`[itemprop="${prop}"]`))
        .map(el => (el.content || el.textContent || '').trim());

    return {
      name: get('name'),
      description: get('description'),
      image: recipeEl.querySelector('[itemprop="image"]')?.src || get('image'),
      source: '',
      prepTime: this._parseDuration(get('prepTime')),
      cookTime: this._parseDuration(get('cookTime') || get('totalTime')),
      servings: this._parseServings(get('recipeYield')),
      ingredients: getAll('recipeIngredient').filter(Boolean),
      instructions: getAll('recipeInstructions').filter(Boolean),
      tags: []
    };
  },

  _cleanText(text) {
    if (!text) return '';
    return text
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n))
      .trim();
  }
};
