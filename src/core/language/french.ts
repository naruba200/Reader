import type { LanguageAdapter, Token } from "../types";
import { tokenizeLatin } from "./tokenizer";

const FR_IRREGULAR: Record<string, string> = {
  est: "être", suis: "être", sommes: "être", êtes: "être", sont: "être", étais: "être", été: "être",
  ai: "avoir", as: "avoir", avons: "avoir", avez: "avoir", ont: "avoir", avait: "avoir", eu: "avoir",
  fait: "faire", fais: "faire", faisait: "faire", font: "faire",
  va: "aller", vont: "aller", allait: "aller",
  dit: "dire", disent: "dire", disait: "dire",
  peut: "pouvoir", peuvent: "pouvoir", pouvait: "pouvoir", pu: "pouvoir",
  voit: "voir", voient: "voir", voyait: "voir", vu: "voir",
  sait: "savoir", savait: "savoir", su: "savoir",
  vient: "venir", viennent: "venir", venait: "venir", venu: "venir",
  veut: "vouloir", veulent: "vouloir", voulait: "vouloir", voulu: "vouloir",
  doit: "devoir", doivent: "devoir", devait: "devoir", dû: "devoir",
  prend: "prendre", prennent: "prendre", prenait: "prendre", pris: "prendre",
  met: "mettre", mettent: "mettre", mettait: "mettre", mis: "mettre",
  boit: "boire", bu: "boire",
  dort: "dormir", dormait: "dormir",
  sort: "sortir", sortait: "sortir", sorti: "sortir",
  part: "partir", partait: "partir", parti: "partir",
  court: "courir", courait: "courir", couru: "courir",
  ouvre: "ouvrir", ouvert: "ouvrir",
  meurt: "mourir", mort: "mourir",
  naît: "naître", né: "naître",
  écrit: "écrire", écrire: "écrire",
  lit: "lire", lisait: "lire", lu: "lire",
  conduit: "conduire",
  comprend: "comprendre", compris: "comprendre",
  devient: "devenir", devenu: "devenir",
  revient: "revenir", revenu: "revenir",
  tient: "tenir", tenait: "tenir", tenu: "tenir",
  reçoit: "recevoir", reçu: "recevoir",
  croit: "croire", cru: "croire",
  vit: "vivre", vécu: "vivre",
  je: "je", me: "me", te: "te", se: "se", le: "le", la: "la", les: "les", des: "des",
  un: "un", une: "une", au: "au", aux: "aux", du: "du", de: "de", et: "et", ou: "ou",
  dans: "dans", pour: "pour", avec: "avec", sur: "sur", sous: "sous", chez: "chez",
};

/** Rule-based French lemmatizer (MVP-grade). */
export function lemmatizeFrench(surface: string): string {
  const lower = surface.toLowerCase();
  const irregular = FR_IRREGULAR[lower];
  if (irregular !== undefined) return irregular;
  if (lower.length <= 3) return lower;

  if (lower.endsWith("èrent")) return lower.slice(0, -5) + "er";
  if (lower.endsWith("ais")) return lower.slice(0, -3) + "ir";
  if (lower.endsWith("ait")) return lower.slice(0, -3) + "ir";
  if (lower.endsWith("ée") || lower.endsWith("ées")) {
    return lower.replace(/ées?$/, "ée");
  }
  if (lower.endsWith("aux") && lower.length > 4) return lower.slice(0, -3) + "al";
  if (lower.endsWith("s") && !lower.endsWith("ss")) return lower.slice(0, -1);
  if (lower.endsWith("iez") && lower.length > 5) return lower.slice(0, -3) + "er";
  if (lower.endsWith("ons") && lower.length > 5) return lower.slice(0, -3) + "er";
  if (lower.endsWith("ent") && lower.length > 5) return lower.slice(0, -3) + "er";
  return lower;
}

export const FRENCH_ADAPTER: LanguageAdapter = {
  language: "fr",
  scheme: "CEFR",
  async tokenize(text: string): Promise<Token[]> {
    return tokenizeLatin(text).map((t) => ({ ...t, lemma: lemmatizeFrench(t.surface) }));
  },
  lemmatize(surface: string): string {
    return lemmatizeFrench(surface);
  },
  levels(): ReturnType<LanguageAdapter["levels"]> {
    return ["A1", "A2", "B1", "B2", "C1", "C2"];
  },
};
