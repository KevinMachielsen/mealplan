# MealPlan

Een web-app om recepten op te slaan, een weekmenu te plannen en automatisch een boodschappenlijst te maken.

🔗 **[Open de app](https://kevinmachielsen.github.io/mealplan/)**

## Functies

- **Recepten importeren** van populaire websites (lekkerensimpel.nl, chickslovefood.com, leukerecepten.nl, miljuschka.nl, etc.) via automatische import
- **Eigen recepten aanmaken** met foto, ingrediënten en stap-voor-stap bereiding
- **Weekmenu planner** — recepten toevoegen per dag of automatisch verdelen over de week
- **Voorraad bijhouden** — voer in wat je thuis hebt, de app toont welk percentage van een recept je al in huis hebt
- **Boodschappenlijst** — automatisch gegenereerd vanuit je weekmenu, met slimme samenvoeging van ingrediënten
- **Todoist export** — boodschappenlijst direct naar Todoist sturen
- **Installeerbaar als app** — werkt als PWA op mobiel en desktop

## Techniek

- Vanilla JavaScript, geen framework
- Data opgeslagen in IndexedDB op het apparaat zelf (geen account nodig, geen server)
- Werkt offline dankzij Service Worker
- Mobiel-first design
