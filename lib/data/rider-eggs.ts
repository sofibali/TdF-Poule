// 🥚 Rider easter eggs. Some of the time, clicking a rider's name doesn't go to
// their results page — it goes somewhere silly. Mostly Dutch name puns (a
// picture of the literal thing) plus a few rider in-jokes. Keyed by a name word
// (lower-cased, accent-stripped) so it matches "Tadej Pogačar", "Pogacar", or
// even a mangled "DER POEL Mathieu Van". Extend freely.

export type Egg = { url: string; label: string };

const G = (q: string) =>
  `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(q)}`;
const YT = (q: string) =>
  `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;

// key (a name word) → egg
const EGGS: Record<string, Egg> = {
  // the star turn
  pogacar: { url: G("pikachu"), label: "Pogachu ⚡" },
  // Dutch name → a picture of the literal thing
  boonen: { url: G("beans"), label: "bonen 🫘" },
  eenkhoorn: { url: G("squirrel"), label: "eekhoorn 🐿️" },
  mollema: { url: G("mole animal"), label: "mol" },
  bol: { url: G("ball"), label: "bol" },
  poels: { url: G("puddle"), label: "poel" },
  groenewegen: { url: G("green country road"), label: "groene weg" },
  // rider lore / memes
  roglic: { url: YT("primoz roglic ski jumping"), label: "ski jumper" },
  pinot: { url: G("pinot noir wine glass"), label: "🍷" },
  pidcock: { url: YT("tom pidcock alpe d'huez descent 2022"), label: "descent" },
  cavendish: { url: G("rocket launch"), label: "Manx Missile 🚀" },
  poel: { url: "https://en.wikipedia.org/wiki/Raymond_Poulidor", label: "grandpa Poulidor" },
  cancellara: { url: G("spartacus"), label: "Spartacus" },
};

/** The egg for a rider name, if any (matches on any name word). */
export function riderEgg(name: string): Egg | null {
  for (const w of name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z]+/)) {
    if (w && EGGS[w]) return EGGS[w];
  }
  return null;
}

// Rare surprise: ~1 in 6 clicks on an egg-rider hits the gag.
export const EGG_CHANCE = 1 / 6;

/** Returns the egg only when the dice say so — otherwise null (use the normal link). */
export function rollEgg(name: string): Egg | null {
  const e = riderEgg(name);
  return e && Math.random() < EGG_CHANCE ? e : null;
}
