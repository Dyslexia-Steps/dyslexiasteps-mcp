// Refreshes ./data from the sibling dyslexiasteps-data checkout when there is one.
// Standalone clones keep the committed snapshot, so `npm run build` works without it.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
const source = new URL("../../data/word-lists.json", import.meta.url);
if (existsSync(source)) {
  mkdirSync(new URL("../data", import.meta.url), { recursive: true });
  copyFileSync(source, new URL("../data/word-lists.json", import.meta.url));
}
