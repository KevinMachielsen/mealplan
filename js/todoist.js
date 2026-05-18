const Todoist = {
  async getProjects(token) {
    const res = await fetch('https://api.todoist.com/rest/v2/projects', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('Ongeldige Todoist API token');
    return res.json();
  },

  async createTask(token, content, projectId, sectionId) {
    const body = { content };
    if (projectId) body.project_id = projectId;
    if (sectionId) body.section_id = sectionId;

    const res = await fetch('https://api.todoist.com/rest/v2/tasks', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Request-Id': crypto.randomUUID()
      },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`Fout bij aanmaken taak: ${res.status}`);
    return res.json();
  },

  async exportShoppingList(token, projectId, items) {
    const errors = [];
    let count = 0;

    for (const item of items) {
      if (item.checked) continue;
      try {
        const content = item.displayAmount
          ? `${item.displayAmount} ${item.name}`
          : item.name;
        await this.createTask(token, content, projectId);
        count++;
        // Small delay to avoid rate limiting
        await new Promise(r => setTimeout(r, 80));
      } catch (e) {
        errors.push(item.name);
      }
    }

    return { count, errors };
  }
};
