import { readFileSync } from "node:fs";

/** Snapshot shipped inside the package (`npm run sync` copies it from ../data). */
const file = new URL("../data/word-lists.json", import.meta.url);

export interface WordList {
  id: string;
  language: string;
  title: string;
  section: string;
  gradeFrom: string;
  gradeTo: string;
  basis: string;
  url: string;
  updated: string;
  words: string[];
  groups: Record<string, string[]>;
}
export interface Data {
  name: string;
  page: string;
  license: { name: string; url: string; note: string };
  citeAs: string;
  updated: string;
  grades: { id: string; label: string; typicalAges: string }[];
  placementBasis: Record<string, { kind: string; code: string; summary: string; url: string }>;
  lists: WordList[];
}

export const data: Data = JSON.parse(readFileSync(file, "utf8"));
export const SITE = "https://dyslexiasteps.com";
export const GRADE_IDS = data.grades.map((g) => g.id) as [string, ...string[]];
export const LANGUAGES = [...new Set(data.lists.map((l) => l.language))] as [string, ...string[]];
export const SECTIONS = [...new Set(data.lists.map((l) => l.section))] as [string, ...string[]];

const gradeIndex = (label: string) => data.grades.findIndex((g) => g.label === label);

/** English lists whose grade range includes `grade`. Other languages have no grades. */
export function listsCovering(grade: string): WordList[] {
  const at = GRADE_IDS.indexOf(grade);
  return data.lists.filter((l) => l.language === "en" && gradeIndex(l.gradeFrom) <= at && at <= gradeIndex(l.gradeTo));
}

export const summary = (l: WordList) => ({
  id: l.id,
  title: l.title,
  language: l.language,
  section: l.section,
  grades: l.gradeFrom ? (l.gradeFrom === l.gradeTo ? l.gradeFrom : `${l.gradeFrom} to ${l.gradeTo}`) : null,
  placementBasis: l.basis || null,
  words: l.words.length,
  url: l.url,
});
