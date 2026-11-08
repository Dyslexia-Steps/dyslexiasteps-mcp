import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { GRADE_IDS, LANGUAGES, SECTIONS, SITE, data, listsCovering, summary } from "./data.js";

const text = (value: unknown) => ({ content: [{ type: "text" as const, text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }] });
const fail = (message: string) => ({ isError: true, content: [{ type: "text" as const, text: message }] });
const READ_ONLY = { readOnlyHint: true, openWorldHint: false } as const;

const GUIDE =
  "A grade is a typical guide, not a rule: programs and standards differ, and it is not an assessment of any child. English lists are placed by grade; lists in other languages follow each language's own curriculum and have no grade.";

/**
 * Every tool is read-only and returns word lists from the published dataset. Nothing here
 * assesses a child or gives advice about a learning difficulty.
 */
export function createServer(): McpServer {
  const server = new McpServer({ name: "dyslexiasteps", version: "0.1.0" });

  server.registerTool(
    "list_word_lists",
    {
      title: "List word lists",
      description: `Lists word lists as summaries (id, title, language, section, grade range, placement basis code, word count, page URL) without their words; returns { count, note, lists } in dataset order, all matches, no paging. Use this to discover ids, then get_word_list for one list's words; use get_words_for_grade or find_words instead when you want words directly. Filters combine with AND. ${GUIDE}`,
      inputSchema: {
        language: z.enum(LANGUAGES).optional().describe("Language code: en, de, es, fr, nl or pt-br. Omit for all languages."),
        grade: z.enum(GRADE_IDS).optional().describe("Keep only English lists whose grade range includes this grade; other-language lists have no grade and are excluded. Omit for all grades."),
        section: z.enum(SECTIONS).optional().describe("cvc, families, sight, digraphs or patterns (English), or wordlist (every other-language list). Omit for all sections."),
      },
      annotations: READ_ONLY,
    },
    async ({ language, grade, section }) => {
      let lists = grade ? listsCovering(grade) : data.lists;
      if (language) lists = lists.filter((l) => l.language === language);
      if (section) lists = lists.filter((l) => l.section === section);
      return text({ count: lists.length, note: GUIDE, lists: lists.map(summary) });
    },
  );

  server.registerTool(
    "get_word_list",
    {
      title: "Get one word list",
      description: "Returns one word list in full: the list summary plus every word, its groups (for example -at, -an, -ap families), placementBasisDetail (null for lists in other languages), license and citation text. Use this when you know the list id from list_word_lists; use get_words_for_grade for words merged across a grade's lists, or find_words to search by letter pattern. An unknown id returns an error that points to list_word_lists.",
      inputSchema: { id: z.string().describe("Exact list id as returned by list_word_lists (case-sensitive), e.g. short-a, kindergarten, vowel-teams; other-language ids carry a language prefix, e.g. es:palabras-con-m.") },
      annotations: READ_ONLY,
    },
    async ({ id }) => {
      const l = data.lists.find((x) => x.id === id);
      if (!l) return fail(`No list "${id}". Call list_word_lists to see the ids (for example ${data.lists.slice(0, 5).map((x) => x.id).join(", ")}).`);
      const basis = l.basis ? Object.values(data.placementBasis).find((b) => b.code === l.basis) : undefined;
      return text({ ...summary(l), words: l.words, groups: l.groups, placementBasisDetail: basis ?? null, license: data.license.name, note: GUIDE, citeAs: data.citeAs });
    },
  );

  server.registerTool(
    "get_words_for_grade",
    {
      title: "Words for a grade",
      description: `Returns every different English word from all lists whose grade range includes a grade, deduplicated, each with the ids of the lists it comes from, plus totalDifferentWords and returned. Words come in dataset list order and are cut at limit (no offset or paging). Use this for a grade-wide pool; use get_word_list for one specific list, or find_words to search by letter pattern. ${GUIDE}`,
      inputSchema: {
        grade: z.enum(GRADE_IDS).describe("Required grade: pre-k, kindergarten, grade-1, grade-2 or grade-3."),
        section: z.enum(SECTIONS).optional().describe("Only lists in this section, e.g. sight or cvc. wordlist (other languages) gives no words here. Omit for all sections."),
        limit: z.number().int().min(1).max(1500).optional().describe("Maximum words to return, 1 to 1500. Default 300; compare returned with totalDifferentWords to see if the result was cut."),
      },
      annotations: READ_ONLY,
    },
    async ({ grade, section, limit }) => {
      const lists = listsCovering(grade).filter((l) => !section || l.section === section);
      const from = new Map<string, string[]>();
      for (const l of lists) for (const w of l.words) from.set(w, [...(from.get(w) ?? []), l.id]);
      const all = [...from.entries()];
      const cap = limit ?? 300;
      return text({ grade, section: section ?? null, lists: lists.map((l) => l.id), totalDifferentWords: all.length, returned: Math.min(cap, all.length), words: all.slice(0, cap).map(([word, sources]) => ({ word, lists: sources })), note: GUIDE });
    },
  );

  server.registerTool(
    "find_words",
    {
      title: "Find words by pattern",
      description: "Searches all lists for words matching a letter pattern, for example starts_with 'sh', ends_with 'ck' or contains 'ight'. Patterns are plain case-insensitive substrings (no wildcards) and all given patterns and filters must match (AND). Returns { totalMatches, returned, matches }, each match a word with its language and every list it appears in (id, grade range, page URL), in dataset order and cut at limit (no paging). Use this to search by spelling pattern; use get_words_for_grade for a whole grade's words, or get_word_list for one known list. Calling it with none of contains, starts_with or ends_with returns an error.",
      inputSchema: {
        contains: z.string().min(1).max(12).optional().describe("Word contains this substring anywhere, e.g. ai or ight. 1 to 12 characters."),
        starts_with: z.string().min(1).max(12).optional().describe("Word begins with this substring, e.g. sh. 1 to 12 characters."),
        ends_with: z.string().min(1).max(12).optional().describe("Word ends with this substring, e.g. ck. 1 to 12 characters."),
        language: z.enum(LANGUAGES).optional().describe("Only lists in this language: en, de, es, fr, nl or pt-br. Omit to search every language."),
        grade: z.enum(GRADE_IDS).optional().describe("Only English lists whose grade range includes this grade; other languages have no grade, so combining it with a non-en language returns no matches."),
        limit: z.number().int().min(1).max(500).optional().describe("Maximum matches to return, 1 to 500. Default 60; totalMatches gives the full count."),
      },
      annotations: READ_ONLY,
    },
    async ({ contains, starts_with, ends_with, language, grade, limit }) => {
      if (!contains && !starts_with && !ends_with) return fail("Give at least one of contains, starts_with or ends_with.");
      const c = contains?.toLowerCase(), s = starts_with?.toLowerCase(), e = ends_with?.toLowerCase();
      let lists = grade ? listsCovering(grade) : data.lists;
      if (language) lists = lists.filter((l) => l.language === language);
      const found = new Map<string, { word: string; language: string; lists: { id: string; grades: string | null; url: string }[] }>();
      for (const l of lists) {
        for (const w of l.words) {
          const lw = w.toLowerCase();
          if ((c && !lw.includes(c)) || (s && !lw.startsWith(s)) || (e && !lw.endsWith(e))) continue;
          const key = `${l.language}:${w}`;
          const hit = found.get(key) ?? { word: w, language: l.language, lists: [] };
          hit.lists.push({ id: l.id, grades: summary(l).grades, url: l.url });
          found.set(key, hit);
        }
      }
      const all = [...found.values()];
      const cap = limit ?? 60;
      return text({ totalMatches: all.length, returned: Math.min(cap, all.length), matches: all.slice(0, cap) });
    },
  );

  server.registerTool(
    "get_placement_basis",
    {
      title: "How grades were assigned",
      description: "Returns the full table of grade-placement sources, document-level and not per word: bases (each with kind, code, summary and source URL), the grade ids with labels and typical ages, the limits note and the methodology page. Sources are Dolch's own grade levels (1936, public domain), the Common Core Foundational Skills item that names the skill, or a typical sequence when no standard names it. Placement is per list: match a list's placementBasis code (from list_word_lists or get_word_list) to a code here. Use this to explain why a list sits at a grade; use get_citation instead for license and reuse.",
      inputSchema: {},
      annotations: READ_ONLY,
    },
    async () => text({ note: GUIDE, bases: data.placementBasis, grades: data.grades, page: `${SITE}/word-lists-by-grade#how-placement-works` }),
  );

  server.registerTool(
    "get_citation",
    {
      title: "How to cite and reuse the word lists",
      description: "Returns how to cite and reuse the dataset: license (name, URL, note; CC BY 4.0 for the compilation, the Dolch words are public domain), citeAs text, the source page, the data's updated date and the fixed CSV and JSON download URLs on dyslexiasteps.com that hold every list. Use this when someone reuses, prints or redistributes the lists; use get_placement_basis instead to explain how grades were assigned.",
      inputSchema: {},
      annotations: READ_ONLY,
    },
    async () => text({ license: data.license, citeAs: data.citeAs, page: data.page, updated: data.updated, downloads: { csv: `${SITE}/data/word-lists.csv`, json: `${SITE}/data/word-lists.json` } }),
  );

  return server;
}
