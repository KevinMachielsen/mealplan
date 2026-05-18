const CORS_PROXY = 'https://api.allorigins.win/get?url=';

const Scraper = {
  async scrape(url) {
    const proxyUrl = CORS_PROXY + encodeURIComponent(url);
    const response = await fetch(proxyUrl);
    if (!response.ok) throw new Error('Kon de pagina niet laden');

    const data = await response.json();
    if (!data.contents) throw new Error('Lege response van server');

    const parser = new DOMParser();
    const doc = parser.parseFromString(data.contents, 'text/html');

    // Try JSON-LD first (most reliable)
    const recipe = this._findJsonLdRecipe(doc);
    if (recipe) return this._parseJsonLd(recipe, url, doc);

    // Try microdata
    const microdata = this._findMicrodata(doc);
    if (microdata) return microdata;

    throw new Error('Kon recept niet automatisch importeren. Vul de gegevens handmatig in.');
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
    const name = this._cleanText(recipe.name || '');
    const description = this._cleanText(
      typeof recipe.description === 'string' ? recipe.description :
      recipe.description?.['@value'] || ''
    );

    const image = this._extractImage(recipe.image, doc);
    const prepTime = this._parseDuration(recipe.prepTime);
    const cookTime = this._parseDuration(recipe.cookTime) || this._parseDuration(recipe.totalTime);
    const servings = this._parseServings(recipe.recipeYield);
    const ingredients = this._parseIngredients(recipe.recipeIngredient || []);
    const instructions = this._parseInstructions(recipe.recipeInstructions || []);
    const tags = this._parseTags(recipe.keywords, recipe.recipeCategory, recipe.recipeCuisine);

    return { name, description, image, source: sourceUrl, prepTime, cookTime, servings, ingredients, instructions, tags };
  },

  _extractImage(imageData, doc) {
    if (!imageData) {
      // Try og:image as fallback
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
    // ISO 8601: PT1H30M or P0DT30M
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
        // Section with sub-steps
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
    const get = (prop) => {
      const el = recipeEl.querySelector(`[itemprop="${prop}"]`);
      return el ? (el.content || el.textContent || '').trim() : '';
    };
    const getAll = (prop) => {
      return Array.from(recipeEl.querySelectorAll(`[itemprop="${prop}"]`))
        .map(el => (el.content || el.textContent || '').trim());
    };

    return {
      name: get('name'),
      description: get('description'),
      image: recipeEl.querySelector('[itemprop="image"]')?.src || get('image'),
      source: doc.location?.href || '',
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
      .replace(/<[^>]+>/g, '') // strip HTML
      .replace(/\s+/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&nbsp;/g, ' ')
      .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n))
      .trim();
  }
};
