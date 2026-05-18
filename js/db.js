const db = new Dexie('MealPlanDB');

db.version(1).stores({
  recipes:   '++id, name, createdAt',
  mealplans: 'weekStart',
  pantry:    '++id, name',
  settings:  'key'
});

const DB = {
  // ─── Recipes ───────────────────────────────────
  async getRecipes() {
    return db.recipes.orderBy('createdAt').reverse().toArray();
  },

  async getRecipe(id) {
    return db.recipes.get(id);
  },

  async saveRecipe(recipe) {
    if (recipe.id) {
      await db.recipes.put(recipe);
      return recipe.id;
    } else {
      recipe.createdAt = new Date().toISOString();
      return db.recipes.add(recipe);
    }
  },

  async deleteRecipe(id) {
    await db.recipes.delete(id);
    // Remove from all meal plans
    const plans = await db.mealplans.toArray();
    for (const plan of plans) {
      let changed = false;
      for (const day of Object.keys(plan.days || {})) {
        const before = plan.days[day].length;
        plan.days[day] = plan.days[day].filter(rid => rid !== id);
        if (plan.days[day].length !== before) changed = true;
      }
      if (changed) await db.mealplans.put(plan);
    }
  },

  // ─── Meal plans ────────────────────────────────
  async getMealPlan(weekStart) {
    const plan = await db.mealplans.get(weekStart);
    if (plan) return plan;
    return {
      weekStart,
      days: { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] }
    };
  },

  async saveMealPlan(plan) {
    await db.mealplans.put(plan);
  },

  async getMealPlanRange(fromWeek, toWeek) {
    return db.mealplans
      .where('weekStart')
      .between(fromWeek, toWeek, true, true)
      .toArray();
  },

  // ─── Pantry ────────────────────────────────────
  async getPantry() {
    return db.pantry.orderBy('name').toArray();
  },

  async savePantryItem(item) {
    if (item.id) {
      await db.pantry.put(item);
      return item.id;
    } else {
      return db.pantry.add(item);
    }
  },

  async deletePantryItem(id) {
    await db.pantry.delete(id);
  },

  // ─── Settings ──────────────────────────────────
  async getSetting(key, defaultValue = null) {
    const row = await db.settings.get(key);
    return row ? row.value : defaultValue;
  },

  async setSetting(key, value) {
    await db.settings.put({ key, value });
  },

  async getAllSettings() {
    const rows = await db.settings.toArray();
    return Object.fromEntries(rows.map(r => [r.key, r.value]));
  },

  // ─── Export / Import ───────────────────────────
  async exportAll() {
    const [recipes, pantry, settings] = await Promise.all([
      db.recipes.toArray(),
      db.pantry.toArray(),
      db.settings.toArray()
    ]);
    const plans = await db.mealplans.toArray();
    return { version: 1, exportedAt: new Date().toISOString(), recipes, mealplans: plans, pantry, settings };
  },

  async importAll(data) {
    if (!data || data.version !== 1) throw new Error('Ongeldig bestandsformaat');
    await db.transaction('rw', db.recipes, db.mealplans, db.pantry, db.settings, async () => {
      await db.recipes.clear();
      await db.mealplans.clear();
      await db.pantry.clear();
      await db.settings.clear();
      if (data.recipes?.length) await db.recipes.bulkAdd(data.recipes);
      if (data.mealplans?.length) await db.mealplans.bulkAdd(data.mealplans);
      if (data.pantry?.length) await db.pantry.bulkAdd(data.pantry);
      if (data.settings?.length) await db.settings.bulkAdd(data.settings);
    });
  }
};
