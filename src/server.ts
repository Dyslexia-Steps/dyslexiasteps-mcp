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
      description: `Lists the available word lists with id, title, language, section, grade range, the source of the grade placement and word count. Filter by language, grade (English lists whose grade range includes it) or section. ${GUIDE}`,
      inputSchema: {
        language: z.enum(LANGUAGES).optional().describe("en, de, es, fr, nl or pt-br. Omit for all."),
        grade: z.enum(GRADE_IDS).optional().describe("English lists that cover this grade."),
        section: z.enum(SECTIONS).optional().describe("cvc, families, sight, digraphs, patterns or wordlist (other languages)."),
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
      description: "The full list: every word, its groups (for example -at, -an, -ap families), the grade range, the placement basis, the page URL and the license. Use an id from list_word_lists, e.g. short-a, kindergarten, sh.",
      inputSchema: { id: z.string().describe("List id, e.g. short-a, kindergarten, vowel-teams, or es:palabras-con-m") },
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
      description: `Every different English word from the lists that cover a grade, deduplicated, with the lists each word comes from. Optional section filter (for example only sight words or only cvc). ${GUIDE}`,
      inputSchema: {
        grade: z.enum(GRADE_IDS).describe("pre-k, kindergarten, grade-1, grade-2 or grade-3"),
        section: z.enum(SECTIONS).optional(),
        limit: z.number().int().min(1).max(1500).optional().describe("Maximum words to return. Default 300."),
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
      description: "Finds words in the lists that start with, end with or contain a letter pattern, for example 'sh', 'ck', '-ight' or 'ai'. Returns each match with its list, grade range and page. Case-insensitive.",
      inputSchema: {
        contains: z.string().min(1).max(12).optional(),
        starts_with: z.string().min(1).max(12).optional(),
        ends_with: z.string().min(1).max(12).optional(),
        language: z.enum(LANGUAGES).optional(),
        grade: z.enum(GRADE_IDS).optional().describe("Only English lists covering this grade."),
        limit: z.number().int().min(1).max(500).optional().describe("Default 60."),
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
      description: "Explains the source of each grade placement: Dolch's own grade levels (1936, public domain), the Common Core Foundational Skills item that names the skill, or a typical sequence when no standard names it. Includes the limits.",
      inputSchema: {},
      annotations: READ_ONLY,
    },
    async () => text({ note: GUIDE, bases: data.placementBasis, grades: data.grades, page: `${SITE}/word-lists-by-grade#how-placement-works` }),
  );

  server.registerTool(
    "get_citation",
    {
      title: "How to cite and reuse the word lists",
      description: "License (CC BY 4.0 for the compilation; the Dolch words are public domain), the citation text and the CSV and JSON download addresses.",
      inputSchema: {},
      annotations: READ_ONLY,
    },
    async () => text({ license: data.license, citeAs: data.citeAs, page: data.page, updated: data.updated, downloads: { csv: `${SITE}/data/word-lists.csv`, json: `${SITE}/data/word-lists.json` } }),
  );

  return server;
}
