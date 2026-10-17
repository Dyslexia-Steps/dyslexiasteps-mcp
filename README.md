# dyslexiasteps-mcp

MCP server for the free word lists on [Dyslexia Steps](https://dyslexiasteps.com): 38 English phonics and sight word lists
placed by grade (Pre-K to Grade 3) with the source of each placement, plus 216 lists in German, Spanish, French, Dutch and
Brazilian Portuguese. Ask an assistant for "20 words with sh for a first grader" and it answers from sourced lists. Read-only.

## Tools

| Tool | What it returns |
|---|---|
| `list_word_lists` | The lists (id, title, language, section, grade range, placement basis, word count); filter by language, grade or section |
| `get_word_list` | One list in full: words, groups (for example -at, -an, -ap families), basis, URL, license |
| `get_words_for_grade` | Every different English word from the lists that cover a grade, with the lists each word comes from |
| `find_words` | Words that start with, end with or contain a pattern such as `sh`, `ck` or `ight`, with their list and grade |
| `get_placement_basis` | How grades were assigned: Dolch (public domain), a Common Core Foundational Skills item, or a typical sequence |
| `get_citation` | License (compilation CC BY 4.0, Dolch words public domain), citation text and CSV/JSON downloads |

## Use

Local:

```json
{ "mcpServers": { "dyslexiasteps": { "command": "npx", "args": ["-y", "dyslexiasteps-mcp"] } } }
```

Claude Code: `claude mcp add --scope user dyslexiasteps -- npx -y dyslexiasteps-mcp`.
Self-host the HTTP transport: `npm run build && PORT=8787 npm run start:http` (POST `/mcp`, stateless).

## Honest limits

A grade is a typical guide, not a rule: programs and standards differ, and a placement is not an assessment of any child. The
lists in other languages follow each language's own reading curriculum and have no grade. The server only returns word lists;
it gives no advice about a learning difficulty. Source of the placements: https://dyslexiasteps.com/word-lists-by-grade

Data CC BY 4.0, code MIT.
