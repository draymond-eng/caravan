#!/usr/bin/env node
/* Pretty URLs on a static host need real folders, and hand-made copies drift.
   This makes /weddings/ and /golf/ from the one index.html, rewriting relative
   paths and stamping the flavor so each page picks itself with no query string.
   Run it after touching index.html:  node tools/build-landings.js            */
const fs = require("fs"), path = require("path");
const root = path.join(__dirname, "..");
const src = fs.readFileSync(path.join(root, "index.html"), "utf8");

const PAGES = [
  { dir: "weddings", flavor: "wedding",
    title: "SquadTrip for weddings - one link for your guests",
    desc: "The schedule, dress codes, room block, shuttles and their table, in one link your guests already have open. RSVPs, seating and a run of show for you." },
];

const CHECK = process.argv.includes("--check");
let stale = 0;
for (const p of PAGES) {
  let out = src
    // one level deeper, so every relative asset has to climb out
    .replace(/(src|href)="((?!https?:|\/\/|#|\?|data:|mailto:)[^"]+)"/g, (m, a, v) => `${a}="../${v}"`)
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${p.title}</title>`)
    .replace(/(<meta name="description" content=")[^"]*(")/, `$1${p.desc}$2`)
    .replace(/<body([^>]*)>/, `<body$1 data-landing="${p.flavor}">`);
  if (out.indexOf('data-landing="' + p.flavor + '"') === -1) throw new Error("could not stamp the flavor onto " + p.dir);
  const dir = path.join(root, p.dir);
  const file = path.join(dir, "index.html");
  if (CHECK) {
    // A generated page that quietly falls behind index.html is worse than none.
    const have = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
    if (have !== out) { console.error(`/${p.dir}/index.html is out of date: run node tools/build-landings.js`); stale++; }
    else console.log(`/${p.dir}/ is current`);
    continue;
  }
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, out);
  console.log(`built /${p.dir}/  (${p.flavor})`);
}
if (CHECK) process.exit(stale ? 1 : 0);
