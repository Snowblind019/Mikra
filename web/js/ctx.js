// Shared context: book list, server info and navigation, filled in by app.js at startup.
import { lang } from "./i18n.js";

export const ctx = {
  books: [],
  info: {},
  navigate: (tab, params) => {},
  refreshDue: () => {},
  bookName(idx) { const b = this.books[idx]; return b ? (lang() === "ro" ? b.ro : b.en) : "?"; },
  refText(b, c, v) { return `${this.bookName(b)} ${c}${v ? ":" + v : ""}`; },
};
