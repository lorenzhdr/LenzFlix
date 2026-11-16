// LenzFlix: kleine gemeinsame Formatierer des Hauptbundles (keine Abhängigkeiten).

/** Zahl mit führender Null auf zwei Stellen (5 -> "05"). */
export const pad2 = (n) => String(n).padStart(2, '0');
