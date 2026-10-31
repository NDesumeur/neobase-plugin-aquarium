// Aquarium : ton appli d'origine (HTML et code inchangés), livrée en plugin.
// Ses données sont dans le dossier du plugin, que NeoBase sauvegarde (synchro cloud et sauvegardes) ; à la première ouverture elle reprend ce que tu avais dans NeoBase.
// Elle demande l'accès complet pour utiliser les outils d'interface de NeoBase. NeoBase ne l'ouvre que si elle est signée.
const HTML = "<div class=\"appWrap\">\n      <div class=\"agHead\"><span class=\"label\">Aquarium</span><span class=\"hint\" id=\"aqInfo\"></span><div class=\"agNav\"><select class=\"f gSel\" id=\"aqTank\" title=\"Bassin\"></select><button class=\"btn px\" id=\"aqFeed\">NOURRIR</button><button class=\"btn px\" id=\"aqClean\">NETTOYER</button><button class=\"btn main px\" id=\"aqCash\" title=\"Les pièces des visiteurs vont dans ta bourse de Pêche\">ENCAISSER</button></div></div>\n      <div class=\"gameBox g169\"><canvas id=\"aqCanvas\" width=\"384\" height=\"216\"></canvas></div>\n      <div class=\"aqPanel\" id=\"aqPanel\"></div>\n      <div class=\"hint\">Chaque poisson pêché dans Pêche arrive vivant dans le vivier (et ta première visite y met un poisson de chaque espèce déjà dans ta collection). Mets-les dans un bassin de leur eau : douce (étang, rivière, lac), mer, tropicale, polaire ou abysses ; les gros poissons veulent un grand bassin. Ils ont faim et l'eau se salit, même quand NeoBase est fermé : nourris, nettoie, ou installe un distributeur et un filtre. Les poissons heureux attirent des visiteurs : encaisse leurs pièces, elles vont dans ta bourse de Pêche, qui paie aussi les bassins, les améliorations et les décors. Clic sur un poisson : son nom. Sauvegardé et synchronisé.</div>\n    </div>";
export default async function (ctx) {
  const view = ctx.view;
  if (!ctx.host) { view.textContent = "Ce plugin doit être approuvé par NeoBase pour s'ouvrir."; return; }
  const host = ctx.host, { el, toast, sfx, ask, newTab, pixIcon, PIX, WX } = host;
  const folder = ctx.folder, legacy = ctx.legacy || {};
  view.innerHTML = HTML;
  const $ = id => id === "aquaApp" ? view : (view.querySelector('#' + id) || document.getElementById(id));  // les identifiants de ta vue d'abord, puis ceux de la page (fenêtres, menus)
  const doc = async n => { try { return await gf.read(n); } catch { return null; } };
  const __icon = () => ctx.icon;  // l'icône de ce plugin
  const gf = { read: n => neo.pluginFolder("neobase.peche", 'read', n), write: (n, d) => neo.pluginFolder("neobase.peche", 'write', n, d) };  // la sauvegarde est dans le dossier de la Pêche
  const LEGACY_GAMES = {"top":["fish","aquarium"],"best":"^$"};
  let games = await doc('games');
  if (games == null) {  // première ouverture : tu retrouves tes records et tes parties d'avant
    const old = legacy.api ? await legacy.api('games').catch(() => null) : null; games = { best: {} };
    if (old) { const re = new RegExp(LEGACY_GAMES.best); for (const [k, v] of Object.entries(old.best || {})) if (re.test(k)) games.best[k] = v; for (const k of LEGACY_GAMES.top) if (old[k] !== undefined) games[k] = old[k]; await gf.write('games', games); }
  }
  games = { best: {}, ...games };
  let gamesTimer = null;
  const saveGames = () => { clearTimeout(gamesTimer); gamesTimer = setTimeout(() => { gamesTimer = null; gf.write('games', games).catch(() => {}); }, 500); };
  const best = (k, v, higher = true) => { const b = games.best[k]; if (b == null || (higher ? v > b : v < b)) { games.best[k] = v; saveGames(); return true; } return false; };
  const gstore = (k, init) => (games[k] ??= init);  // la section d'un jeu
function gameLoop(st, appKey, update, draw) {
  cancelAnimationFrame(st.raf);
  const STEP = 1000 / 60; let acc = 0, last = performance.now();
  const frame = t => {
    if (!view.classList.contains('on')) { st.raf = 0; if (st.mode === 'play') st.mode = 'pause'; return; }  // leaving the tab pauses the game
    st.raf = requestAnimationFrame(frame);
    acc += Math.min(200, t - last); last = t;
    while (acc >= STEP) { if (st.mode === 'play') update(); st.tick++; acc -= STEP; }
    draw();
  };
  st.raf = requestAnimationFrame(frame);
}
function gameText(g, w, lines, y0) {  // centred pixel-font lines over a dark band
  g.fillStyle = 'rgba(11,3,28,.72)'; g.fillRect(0, y0 - 14, w, lines.length * 14 + 14);
  g.textAlign = 'center';
  lines.forEach(([text, color, size], i) => { g.fillStyle = color; g.font = (size || 8) + 'px "Press Start 2P", monospace'; g.fillText(text, w / 2, y0 + i * 14); });
  g.textAlign = 'left';
}
const px = (g, color, x, y, w = 1, h = 1) => { g.fillStyle = color; g.fillRect(Math.round(x), Math.round(y), w, h); };
function sprite(g, rows, x, y, pal) { rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) { const c = pal[r[i]]; if (c) px(g, c, x + i, y + j); } }); }
  // ---- ton code d'origine ----
const seeded = s => () => { s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

/* NeoBase games, part 5: Pêche. 7 places, 128 species drawn by code in pixel art, day / night and weather, rods and baits, a collection.
   The whole game (money, gear, places, collection, clock) is saved in games.fish, so it follows you between PCs. */

/* name | places | time (J day, A dawn & dusk, N night, * any) | weather (* any, P rain or storm, S clear, N snow) | rarity 1-5 | size cm | shape | back, belly, fins | pattern | baits it likes */
const FI_DATA = `Gardon|E|*|*|1|12-30|f|8a9,dde,c55|-|pv
Rotengle|E|J|*|1|12-28|f|8a6,eed,e44|-|pv
Ablette|ER|J|*|1|8-18|f|9ab,eef,ccd|h|pa
Perche commune|EL|J|*|2|15-45|f|7a4,ed9,e63|s|vl
Tanche|E|A|*|2|20-60|f|564,9a5,453|-|v
Brème|ER|*|*|2|30-70|h|776,cc9,554|-|pv
Carpe commune|E|*|*|2|35-90|h|875,db8,a64|-|pv
Carpe miroir|E|N|*|3|40-100|h|986,ec9,b75|d|pv
Carpe koï|E|J|S|4|40-90|h|f84,fff,f84|m|p
Carassin doré|E|J|*|2|10-30|h|ea3,fd8,e83|-|p
Poisson-chat|E|N|*|2|20-45|w|443,776,332|-|va
Brochet|ELR|A|*|3|50-120|g|6a5,dd9,797|d|l
Sandre|EL|N|*|3|40-90|g|796,dda,575|b|l
Black-bass|E|J|S|3|25-60|f|5a4,dd9,464|h|l
Silure glane|ER|N|P|4|100-250|w|554,aa9,443|m|vk
Pseudorasbora|E|J|*|1|5-10|f|aa9,eed,887|h|pa
Bouvière|E|J|S|2|5-9|h|9ab,fcd,e6a|-|p
Amour blanc|E|J|S|3|50-120|g|8a8,ddd,797|-|p
Carpe céleste|E|N|S|5|80-130|h|7cf,fff,f6e|n|p
Truite fario|RL|A|*|2|20-60|f|875,ec9,c74|d|va
Truite arc-en-ciel|RL|J|*|2|25-70|f|797,eee,e7a|h|vl
Ombre commun|R|J|*|3|25-50|f|889,ddd,a6c|d|a
Chevesne|R|J|*|1|20-60|f|788,ddd,e85|-|pva
Barbeau|R|*|*|2|25-80|w|974,dc9,b64|-|va
Goujon|R|J|*|1|8-15|f|998,ddd,887|d|va
Vairon|R|J|*|1|5-10|f|675,ec8,e44|-|pa
Hotu|R|J|*|1|25-45|f|889,eee,e66|-|p
Vandoise|R|J|*|1|15-30|f|8ab,eef,ddd|-|pa
Spirlin|R|J|S|2|8-13|f|897,eed,e75|h|a
Loche franche|R|N|*|2|8-12|l|986,dc9,764|d|va
Chabot|R|N|*|2|10-15|w|875,cb9,764|m|v
Anguille|REC|N|P|3|50-120|l|564,cc9,453|-|va
Saumon atlantique|R|A|P|4|60-120|f|79a,eee,9ab|d|lc
Esturgeon|R|N|*|4|100-250|g|776,dcb,665|h|lk
Lamproie|R|N|P|3|40-90|l|776,aa9,665|m|v
Aspe|R|J|*|3|40-80|g|889,eee,c88|-|l
Brochet fantôme|R|N|P|5|120-160|g|cdf,fff,9bf|n|l
Omble chevalier|L|A|*|3|25-60|f|687,f84,f84|d|vl
Corégone|L|J|*|2|30-60|f|99a,eee,aab|-|a
Cristivomer|L|N|*|3|50-100|f|575,ddc,686|d|lk
Ombre arctique|L|J|S|3|30-50|f|778,ddd,b8d|d|a
Lotte de rivière|L|N|*|3|30-70|w|775,cc9,664|m|v
Truite dorée|L|J|S|4|25-50|f|fc4,fe9,f84|h|a
Vendace|L|J|*|1|15-25|f|9ab,eef,bbc|-|a
Épinoche|LE|J|*|1|4-8|f|786,e66,998|s|a
Truite marbrée|L|A|P|4|50-100|f|796,ddc,797|m|l
Perche soleil|LE|J|S|2|10-20|h|5a8,fb4,e83|h|v
Saumon de fontaine|L|A|*|2|20-40|f|575,f95,e63|d|v
Huchon|L|N|N|4|60-120|g|877,edc,b77|d|l
Ide mélanote|L|J|*|2|25-50|f|888,eee,e66|-|pa
Truite fardée|L|J|*|3|30-60|f|887,ecb,e55|d|v
Dragon des cimes|L|A|N|5|90-150|g|8df,fff,fd7|n|lg
Bar|C|A|*|2|30-80|f|9ab,eee,889|-|lc
Dorade royale|C|J|S|2|25-60|h|aab,eee,fc5|-|c
Maquereau|C|J|*|1|20-40|f|486,eee,9ab|s|lc
Sardine|C|J|*|1|12-20|f|68a,eef,9ab|d|c
Anchois|C|J|*|1|8-15|f|79a,eef,aab|h|c
Mulet|C|*|*|1|30-60|f|889,ddd,888|h|p
Lieu jaune|C|A|*|2|40-90|f|775,ddb,fc5|h|l
Cabillaud|C|N|*|3|50-120|f|897,eed,796|d|kv
Merlan|C|J|*|1|25-45|f|998,eee,887|-|c
Sole|C|N|*|2|25-50|p|875,edc,654|d|v
Turbot|C|N|*|3|40-80|p|776,ddc,665|d|k
Plie|C|J|*|2|25-50|p|875,edc,e64|d|v
Raie bouclée|C|N|*|3|50-100|y|987,edc,765|d|k
Rouget-barbet|C|J|*|2|15-30|f|e75,fdc,ea8|-|v
Congre|C|N|P|3|80-200|l|667,bbb,556|-|k
Saint-pierre|C|*|*|3|30-60|h|998,ddc,776|d|c
Grondin perlon|C|J|*|2|25-60|f|e66,fcc,59c|-|c
Vieille|C|J|S|1|25-50|f|8a5,ec8,9b6|d|c
Baudroie|C|N|*|4|50-150|a|875,cb9,654|m|k
Thon rouge|C|J|S|4|100-250|f|335,ccd,eb4|-|lk
Espadon|C|A|*|4|150-300|e|557,ccd,446|-|k
Léviathan d'argent|C|N|P|5|200-400|e|cdf,fff,8bf|n|k
Poisson-clown|T|J|*|2|6-11|f|f72,fff,f72|b|c
Chirurgien bleu|T|J|*|2|15-30|h|35d,36d,fd3|-|c
Poisson-ange royal|T|J|S|3|15-25|h|e93,fd5,47c|s|c
Poisson-papillon|T|J|*|1|10-20|h|fd5,fff,333|s|c
Poisson-perroquet|T|J|*|2|30-70|f|3c9,7ec,f6c|m|c
Baliste picasso|T|J|*|3|15-30|h|ecb,fff,47c|h|c
Mérou géant|T|*|*|4|100-250|f|775,cb9,554|d|k
Barracuda|T|J|*|3|60-150|g|99a,eee,778|s|l
Poisson-lion|T|A|*|3|20-38|h|e75,fdc,e75|s|c
Murène javanaise|T|N|*|3|80-250|l|9a5,cc8,775|d|k
Hippocampe|T|J|S|3|8-20|x|fd5,fe9,eb4|-|c
Raie manta|T|J|S|4|200-500|y|334,eee,223|-|c
Poisson-coffre|T|J|*|2|15-35|r|fe4,ffb,333|d|c
Poisson-globe|T|N|*|2|15-40|r|cb8,fff,987|d|c
Napoléon|T|J|*|4|80-200|h|3a8,8dc,36a|m|k
Idole des Maures|T|J|*|2|15-25|h|fe6,fff,222|b|c
Demoiselle bleue|T|J|*|1|5-10|f|36f,47f,fd4|-|c
Labre nettoyeur|T|J|*|1|8-14|g|ccd,fff,36d|h|c
Requin à pointes noires|T|A|*|4|100-180|s|889,eee,222|-|k
Coryphène|T|J|S|3|60-150|f|5c6,fe5,3a8|d|l
Carangue géante|T|A|*|3|60-170|h|99a,ddd,666|-|l
Dragon de corail|T|N|*|5|30-50|x|f8c,fdf,8fd|n|c
Morue polaire|B|*|*|1|15-35|f|889,ddd,778|-|c
Flétan du Groenland|B|N|*|3|60-120|p|445,ccc,334|-|k
Omble arctique|B|J|*|2|30-70|f|577,f85,f85|d|v
Poisson des glaces|B|N|N|3|25-50|f|cdf,fff,bcd|-|c
Capelan|B|J|*|1|12-20|f|8ab,eef,9ab|-|c
Lompe|B|J|*|2|30-50|r|8a6,dc8,675|d|c
Loup atlantique|B|N|*|3|60-120|l|778,bbb,556|b|k
Requin du Groenland|B|N|N|4|250-500|s|556,aaa,445|-|k
Sébaste|B|A|*|2|25-50|f|e65,fcb,d54|-|c
Hareng|B|J|*|1|20-35|f|79a,eef,9ab|-|c
Églefin|B|J|*|2|30-60|f|889,eee,666|-|c
Chimère arctique|B|N|*|3|40-90|g|bbc,eee,99a|-|k
Grenadier|B|N|*|2|40-80|g|889,bbb,778|-|k
Saumon rouge|B|A|*|3|50-80|f|e44,fbb,575|-|l
Plie arctique|B|J|*|1|20-40|p|887,edd,765|d|v
Léviathan des glaces|B|N|N|5|300-600|s|cef,fff,9cf|n|k
Poisson-lanterne|A|*|*|1|5-15|f|335,446,7ff|n|g
Poisson-hache|A|*|*|2|5-12|h|aab,ccd,7ff|n|g
Grandgousier|A|*|*|3|40-80|l|222,333,f6e|n|g
Baudroie abyssale|A|*|*|3|10-40|a|332,443,7fd|n|g
Dragon noir|A|*|*|3|20-40|l|112,223,f5f|n|g
Poisson-vipère|A|*|*|2|20-35|g|445,556,7df|n|g
Calmar géant|A|N|*|4|300-1200|c|e66,fbb,e66|-|k
Cœlacanthe|A|*|*|4|100-200|f|459,8ab,9cd|d|k
Régalec|A|*|P|4|300-800|l|ccd,eee,f45|-|k
Poisson-ogre|A|*|*|2|10-16|a|432,543,ccc|-|g
Chimère abyssale|A|*|*|2|50-100|g|99a,bbc,778|-|k
Requin-lutin|A|*|*|4|200-400|s|eaa,fcc,c88|-|k
Poisson-tripode|A|*|*|2|20-35|g|776,998,665|-|g
Pieuvre Dumbo|A|*|*|3|10-30|c|f9b,fcd,f9b|-|g
Kraken|A|N|P|5|800-1500|c|a34,e78,f6a|n|k
Poisson-NeoBase|A|N|*|5|50-80|f|e1c,fff,7fe|n|g`;
const FI_SPOTS = {
  E: {name: 'Étang des saules', price: 0, water: ['#3d6e7a', '#244a58', '#102632'], sky: 1, shore: 'wood', decor: 'saules', weather: {clair: 4, nuageux: 3, pluie: 2, orage: .5, brouillard: 1}},
  R: {name: 'Rivière claire', price: 600, water: ['#4a8a96', '#2b6070', '#14343f'], shore: 'wood', decor: 'collines', flow: true, weather: {clair: 4, nuageux: 3, pluie: 2.5, orage: .6, brouillard: 1}},
  L: {name: 'Lac de montagne', price: 1800, water: ['#4a7aa8', '#2b5080', '#142a4a'], shore: 'wood', decor: 'montagnes', weather: {clair: 4, nuageux: 3, pluie: 1.5, neige: 1.5, brouillard: 1}},
  C: {name: 'Côte rocheuse', price: 3500, water: ['#3a7f9c', '#215672', '#0e2c40'], shore: 'rock', decor: 'falaises', weather: {clair: 3, nuageux: 3, pluie: 2.5, orage: 1.2, brouillard: 1}},
  T: {name: 'Lagon tropical', price: 8000, water: ['#4fd8cc', '#24a0ae', '#0e5c72'], shore: 'wood', decor: 'palmiers', weather: {clair: 6, nuageux: 2, pluie: 1.5, orage: .6}},
  B: {name: 'Banquise', price: 14000, water: ['#6a9cbc', '#3d6c92', '#1c3856'], shore: 'ice', decor: 'icebergs', weather: {clair: 3, nuageux: 2, neige: 4, brouillard: 1.5}},
  A: {name: 'Abysses', price: 30000, water: ['#16205a', '#0b1236', '#04061a'], shore: 'boat', decor: 'large', dark: true, weather: {clair: 4, nuageux: 2, pluie: 2, orage: 1.2}},
};
const FI_RODS = [
  {name: 'Canne en bambou', price: 0, str: 1, reel: 1, luck: 0},
  {name: 'Canne en fibre', price: 400, str: 1.3, reel: 1.15, luck: .06},
  {name: 'Canne en carbone', price: 1800, str: 1.7, reel: 1.3, luck: .12},
  {name: 'Canne de compétition', price: 6000, str: 2.2, reel: 1.5, luck: .2},
  {name: 'Canne stellaire', price: 18000, str: 3, reel: 1.8, luck: .32},
];
const FI_BAITS = {  // pack = how many casts you get for the price; bread is free
  p: {name: 'Pain', price: 0, pack: 0, wait: 1},
  v: {name: 'Vers de terre', price: 30, pack: 20, wait: .8},
  a: {name: 'Asticots', price: 40, pack: 20, wait: .75},
  c: {name: 'Crevettes', price: 80, pack: 15, wait: .8},
  l: {name: 'Leurre', price: 150, pack: 25, wait: .9},
  k: {name: 'Calamar', price: 250, pack: 10, wait: .85},
  g: {name: 'Appât lumineux', price: 600, pack: 10, wait: .7},
};
const FI_RARITY = [null, ['Commun', '#c9bdf0', 100, 12], ['Peu commun', '#8ee8a0', 45, 35], ['Rare', '#7fe0ee', 15, 100], ['Épique', '#ff5ad9', 4.5, 380], ['Légendaire', '#ffd07a', 1.2, 1800]];  // label, colour, weight, base price
const FI_TIMES = {J: 'le jour', A: 'à l\'aube et au crépuscule', N: 'la nuit', '*': 'à toute heure'};
const FI_WEATHER = {'*': '', P: 'sous la pluie', S: 'par beau temps', N: 'quand il neige'};
const hex3 = h => '#' + [...h].map(c => c + c).join('');
const FISH = FI_DATA.trim().split('\n').map((line, id) => {
  const [name, spots, time, weather, rar, size, shape, cols, pattern, likes] = line.split('|'), [min, max] = size.split('-').map(Number), [back, belly, fin] = cols.split(',').map(hex3);
  return {id, name, spots, time, weather, rarity: +rar, min, max, shape, back, belly, fin, pattern, likes};
});
console.assert(FISH.length >= 100 && FISH.every(f => f.spots && f.max >= f.min && FI_RARITY[f.rarity]), 'FISH: 100+ well-formed species');
console.assert(Object.keys(FI_SPOTS).every(s => [...'JAN'].every(t => FISH.some(f => f.spots.includes(s) && f.rarity < 5 && f.weather === '*' && (f.time === '*' || f.time.includes(t))))), 'FISH: every place has something to catch at every hour');

/* ---------- species drawn by code: a body outline per shape, fins, shading, pattern and eye; cached as small canvases ---------- */
const mixc = (a, b, k) => { const p = h => [1, 3, 5].map(i => parseInt(h.substr(i, 2), 16)), x = p(a), y = p(b); return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * k).toString(16).padStart(2, '0')).join(''); };
const FI_SEAHORSE = ['....bbb.....', '...bbebb....', '..bbbbbbbb..', '...bbbb.....', '....bbbf....', '....bbbff...', '...bbbbff...', '...bbbbbf...', '...bbbbbf...', '....bbbbf...', '....bbbb....', '.....bbb....', '.....bbb....', '......bb....', '......bbb...', '.......bb...', '.....b.bb...', '.....bbb....', '......b.....', '............', '............', '............'];
const fiArtCache = new Map();
function fiArt(f, silhouette) {
  const k = f.id + (silhouette ? 's' : ''); if (fiArtCache.has(k)) return fiArtCache.get(k);
  const D = {f: [26, 11], g: [32, 8], h: [22, 17], l: [36, 7], p: [24, 15], y: [30, 22], r: [18, 15], s: [38, 13], e: [40, 13], a: [24, 15], w: [32, 9], x: [12, 22], c: [30, 15]}[f.shape];
  const [W, H] = D, m = Array.from({length: H}, () => Array(W).fill(''));  // '' empty, b body, f fin, e eye, w white, k dark, g glow
  const rnd = seeded(f.id * 977 + 13), cy = (H - 1) / 2, set = (x, y, v, over) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < W && y < H && (over || !m[y][x])) m[y][x] = v; };
  const side = 'fghseawr'.includes(f.shape);
  if (side) {
    const P = {f: [.55, .3, .2], g: [.5, .32, .2], h: [.48, .22, .22], s: [.42, .2, .18], e: [.45, .25, .22], a: [.78, .28, .2], w: [.62, .32, .18], r: [.5, .45, .12]}[f.shape];
    const [c, ped, tailK] = P, bill = f.shape === 'e' ? 9 : 0, x0 = Math.round(W * tailK), x1 = W - 1 - bill, hb = (H - 3) / 2;
    const hh = t => hb * Math.max(ped * (1 - t), Math.sqrt(Math.max(0, 1 - ((t - c) / (t < c ? c : 1 - c)) ** 2)));
    for (let x = x0; x <= x1; x++) { const t = (x - x0) / (x1 - x0), h = hh(t), top = f.shape === 'w' && t > .6 ? cy - h * .7 : cy - h; for (let y = Math.ceil(top - .3); y <= cy + h + .3; y++) set(x, y, 'b'); }
    for (let x = 0; x < x0; x++) {  // tail fin
      const u = (x0 - x) / x0, reach = hb * ped + u * hb * (f.shape === 'r' ? .6 : .95);
      for (let y = 0; y < H; y++) {
        const dy = y - cy, ad = Math.abs(dy);
        if (ad > reach) continue;
        if ('fgse'.includes(f.shape) && u > .45 && ad < (u - .45) * hb * 1.8) continue;  // forked
        if (f.shape === 's' && dy > 0 && u > .55) continue;  // shark: longer upper lobe
        set(x, y, 'f');
      }
    }
    const dorsal = f.shape === 'e' ? [.25, .7, hb * 1.1] : f.shape === 's' ? [.42, .58, hb * .9] : f.shape === 'h' ? [.2, .7, hb * .35] : [.35, .6, hb * .55];
    for (let x = x0; x <= x1; x++) {
      const t = (x - x0) / (x1 - x0); if (t < dorsal[0] || t > dorsal[1]) continue;
      const k = (t - dorsal[0]) / (dorsal[1] - dorsal[0]), hgt = dorsal[2] * (f.shape === 's' || f.shape === 'e' ? (1 - k) : Math.sin(k * Math.PI)), top = Math.ceil(cy - hh(t));
      for (let y = 1; y <= hgt; y++) set(x, top - y, 'f');
      if (t > .3 && t < .45) for (let y = 1; y <= hgt * .5 + 1; y++) set(x, Math.floor(cy + hh(t)) + y, 'f');  // anal fin
    }
    const px0 = x0 + (x1 - x0) * .68;
    for (let i = 0; i < 3; i++) set(px0 - i, cy + 1 + i * .6, 'f', true);  // pectoral fin
    const ex = x0 + (x1 - x0) * (f.shape === 'a' ? .9 : .86), ey = cy - hh(.86) * .35;
    if (f.shape === 'a') { for (let i = 0; i < 6; i++) set(ex - i * .6, ey - 3 - i * .4 - (i > 3 ? (i - 3) : 0), 'k', true); set(ex - 3, ey - 6, 'g', true); set(x1, cy + 1, 'w', true); set(x1 - 2, cy + 1, 'w', true); }
    if (f.shape === 'w') for (let i = 1; i < 5; i++) { set(x1 + 1 - i * .2, cy + i * .5, 'k', true); set(x1 - i, cy + 1 + i * .4, 'k', true); }
    if (bill) for (let x = x1 + 1; x < W; x++) set(x, cy - .5, 'k');
    if (H >= 10) for (let y = cy - hh(.75) * .6; y <= cy + hh(.75) * .6; y++) set(x0 + (x1 - x0) * .75, y, 'k', true);  // gill
    set(ex, ey, 'e', true); if (H >= 13) { set(ex + 1, ey, 'e', true); set(ex, ey + 1, 'e', true); set(ex + 1, ey + 1, 'e', true); }
    set(x1, cy + (f.shape === 'w' ? 0 : .5), 'k', true);
  } else if (f.shape === 'l') {  // eel: a thick wavy line
    for (let x = 0; x < W; x++) { const t = x / (W - 1), yc = cy + Math.sin(t * Math.PI * 2) * 1.2, th = 2.2 * Math.min(1, t * 4, (1 - t) * 6 + .3); for (let y = Math.ceil(yc - th); y <= yc + th; y++) set(x, y, 'b'); if (t < .6) { set(x, yc - th - 1, 'f'); set(x, yc + th + 1, 'f'); } }
    set(W - 4, cy - 1 + Math.sin(Math.PI * 2 * (W - 4) / (W - 1)) * 1.2, 'e', true); set(W - 1, cy, 'k', true);
  } else if (f.shape === 'p') {  // flatfish, seen from above
    for (let y = 0; y < H; y++) for (let x = 4; x < W; x++) { const v = ((x - 14) / 10) ** 2 + ((y - cy) / (H / 2)) ** 2; if (v <= .7) set(x, y, 'b'); else if (v <= 1) set(x, y, 'f'); }
    for (let x = 0; x < 5; x++) for (let y = cy - (5 - x) * .6 - 1; y <= cy + (5 - x) * .6 + 1; y++) set(x, y, 'f');
    set(20, cy - 2, 'e', true); set(21, cy, 'e', true);
  } else if (f.shape === 'y') {  // ray: a diamond and a long tail
    for (let y = 0; y < H; y++) for (let x = 8; x < W; x++) { const v = Math.abs(x - 19) / 11 + Math.abs(y - cy) / (H / 2); if (v <= 1 && !(x > 26 && Math.abs(y - cy) > 4)) set(x, y, 'b'); }
    for (let x = 0; x < 9; x++) set(x, cy, 'f');
    set(25, cy - 2, 'e', true); set(25, cy + 2, 'e', true);
  } else if (f.shape === 'x') {
    FI_SEAHORSE.forEach((r, y) => [...r].forEach((ch, x) => { if (ch !== '.') set(x, y, ch === 'e' ? 'e' : ch); }));
  } else if (f.shape === 'c') {  // squid / octopus: mantle on the left, tentacles to the right
    for (let x = 0; x < 16; x++) { const h = 1 + x * .32; for (let y = Math.ceil(cy - h); y <= cy + h; y++) set(x + 1, y, 'b'); }
    for (let y = cy - 4; y <= cy + 4; y++) set(0, y, 'f'); for (let y = cy - 3; y <= cy + 3; y++) set(1, y, 'f');
    for (let x = 16; x < 20; x++) for (let y = cy - 4; y <= cy + 4; y++) set(x, y, 'b');
    for (let i = 0; i < 6; i++) { const y0 = cy - 3.5 + i * 1.4, len = 8 + (i * 7) % 5; for (let x = 0; x < len; x++) set(20 + x, y0 + Math.sin(x / 2 + i) * 1.2 + (i - 2.5) * x * .08, 'b'); }
    set(17, cy - 2, 'e', true);
  }
  // colours: back / belly with dithering, highlight on top, pattern, then a dark outline around everything
  const out = document.createElement('canvas'); out.width = W + 2; out.height = H + 2;
  const g = out.getContext('2d'), line = mixc(f.back, '#05010b', .72), dark = mixc(f.back, '#05010b', .35), light = mixc(f.back, '#ffffff', .35);
  const dots = new Set(); for (let i = 0; i < W * H / 14; i++) dots.add(Math.floor(rnd() * W) + ',' + Math.floor(rnd() * H));
  for (let x = 0; x < W; x++) {
    let top = -1, bot = -1; for (let y = 0; y < H; y++) if (m[y][x] === 'b') { if (top < 0) top = y; bot = y; }
    for (let y = 0; y < H; y++) {
      const v = m[y][x]; if (!v) continue;
      let c = f.fin;
      if (v === 'b') {
        const k = bot > top ? (y - top) / (bot - top) : 0;
        c = k < .45 ? f.back : k > .65 ? f.belly : (x + y) % 2 ? f.back : f.belly;
        if (y === top) c = light;
        const p = f.pattern;
        if (p === 's' && x % 5 < 2 && k < .8) c = dark;
        if (p === 'b' && x % 7 < 2) c = f.belly;
        if (p === 'h' && Math.abs(y - (top + bot) / 2) < .8) c = f.fin;
        if ((p === 'd' || p === 'n') && dots.has(x + ',' + y) && k > .1) c = p === 'n' ? f.fin : dark;
        if (p === 'm' && (Math.sin(x * .9 + f.id) + Math.cos(y * 1.3 + f.id * 2)) > 1.1) c = f.fin;
        if (p === 'n' && Math.abs(y - (top + bot) / 2) < .6) c = f.fin;
      }
      if (v === 'e') c = '#0b031c'; if (v === 'w') c = '#ffffff'; if (v === 'k') c = line; if (v === 'g') c = '#ffffaa';
      g.fillStyle = silhouette ? '#1c1238' : c; g.fillRect(x + 1, y + 1, 1, 1);
    }
  }
  if (!silhouette) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (m[y][x] === 'e' && (x === 0 || m[y][x - 1] !== 'e') && (y === 0 || m[y - 1][x] !== 'e') && H >= 13) { g.fillStyle = '#ffffff'; g.fillRect(x + 1, y + 1, 1, 1); }
  const img = g.getImageData(0, 0, W + 2, H + 2), d = img.data, filled = i => d[i * 4 + 3] > 0;
  const edge = [];
  for (let y = 0; y < H + 2; y++) for (let x = 0; x < W + 2; x++) { const i = y * (W + 2) + x; if (filled(i)) continue; if ((x > 0 && filled(i - 1)) || (x < W + 1 && filled(i + 1)) || (y > 0 && filled(i - W - 2)) || (y < H + 1 && filled(i + W + 2))) edge.push([x, y]); }
  g.fillStyle = silhouette ? '#0b031c' : line; for (const [x, y] of edge) g.fillRect(x, y, 1, 1);
  fiArtCache.set(k, out); return out;
}
const fiUrlCache = new Map();
const fiArtUrl = (f, s, scale = 3) => { const key = f.id + ',' + !!s + ',' + scale; if (fiUrlCache.has(key)) return fiUrlCache.get(key); const a = fiArt(f, s), c = document.createElement('canvas'); c.width = a.width * scale; c.height = a.height * scale; const g = c.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(a, 0, 0, c.width, c.height); fiUrlCache.set(key, c.toDataURL()); return fiUrlCache.get(key); };

/* ---------- the save ---------- */
let fi = null;
const fiSave = () => gstore('fish', {money: 0, rod: 0, baits: {}, bait: 'p', spots: ['E'], spot: 'E', dex: {}, clock: 8 * 60, weather: 'clair', wUntil: 11 * 60, total: 0, earned: 0, best: null, xp: 0, streak: 0, perfect: 0, chests: 0, quests: null});
const fiHour = () => (fiSave().clock / 60) % 24;
const fiPhase = h => h >= 5 && h < 8 ? 'A' : h >= 8 && h < 18 ? 'J' : h >= 18 && h < 21 ? 'A' : 'N';
const fiPhaseName = h => h >= 5 && h < 8 ? 'Aube' : h >= 8 && h < 18 ? 'Jour' : h >= 18 && h < 21 ? 'Crépuscule' : 'Nuit';
const FI_WNAMES = {clair: 'Ciel clair', nuageux: 'Nuageux', pluie: 'Pluie', orage: 'Orage', brouillard: 'Brouillard', neige: 'Neige'};
function fiNewWeather() {
  const s = fiSave(), opts = Object.entries(FI_SPOTS[s.spot].weather); let r = Math.random() * opts.reduce((a, o) => a + o[1], 0);
  s.weather = opts.find(o => (r -= o[1]) < 0)[0]; s.wUntil = s.clock + 120 + Math.floor(Math.random() * 240);
}
const fiWeatherOk = (f, w) => f.weather === '*' || (f.weather === 'P' && (w === 'pluie' || w === 'orage')) || (f.weather === 'S' && w === 'clair') || (f.weather === 'N' && w === 'neige');
const fiTimeOk = (f, h) => f.time === '*' || f.time.includes(fiPhase(h));
function fiPick(power) {  // which fish bites: place, hour, weather, bait, rod and how far you cast
  const s = fiSave(), h = fiHour(), rod = FI_RODS[s.rod];
  const pool = FISH.filter(f => f.spots.includes(s.spot) && fiTimeOk(f, h) && fiWeatherOk(f, s.weather) && (f.rarity < 5 || s.rod >= 3));
  const ws = pool.map(f => FI_RARITY[f.rarity][2] * (f.likes.includes(s.bait) ? 2.6 : 1) * (f.rarity >= 3 ? (1 + (rod.luck + fiLevel().luck) * f.rarity) * (.6 + power * .8) : 1));
  let r = Math.random() * ws.reduce((a, b) => a + b, 0);
  return pool[ws.findIndex(w => (r -= w) < 0)] || pool[0];
}
// angler level from the experience: each level reels a little faster and brings a little more luck with the rare fish
const fiLevel = (xp = fiSave().xp || 0) => { const lv = Math.floor(Math.sqrt(xp / 60)) + 1, cur = 60 * (lv - 1) ** 2, next = 60 * lv ** 2; return {lv, k: (xp - cur) / (next - cur), reel: Math.min(.4, (lv - 1) * .02), luck: Math.min(.3, (lv - 1) * .015)}; };
// three challenges a day (the same all day), rewarded in coins and experience
const FI_QUESTS = [
  ['catch', n => 'Pêcher ' + n + ' poissons', [5, 8, 12]], ['rare', n => 'Pêcher ' + n + ' poisson' + (n > 1 ? 's' : '') + ' rare' + (n > 1 ? 's' : '') + ' ou mieux', [1, 2]],
  ['perfect', n => 'Réussir ' + n + ' ferrages parfaits', [3, 5]], ['big', n => 'Pêcher ' + n + ' poisson' + (n > 1 ? 's' : '') + ' presque à la taille maximale de son espèce', [1, 2]],
  ['new', n => 'Découvrir ' + n + ' nouvelle' + (n > 1 ? 's' : '') + ' espèce' + (n > 1 ? 's' : ''), [1, 2]], ['streak', n => 'Faire une série de ' + n + ' prises sans en rater', [4, 6]],
  ['night', n => 'Pêcher ' + n + ' poissons la nuit', [3, 5]], ['chest', () => 'Remonter un coffre au trésor', [1]],
];
function fiQuests() {
  const s = fiSave(), d = new Date(), day = d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  if (s.quests?.day !== day) {
    const r = seeded(day.split('-').reduce((a, x) => a * 41 + +x, 7)), kinds = [...FI_QUESTS].sort(() => r() - .5).slice(0, 3);
    s.quests = {day, list: kinds.map(([kind, , ns]) => { const n = ns[Math.floor(r() * ns.length)]; return {kind, n, got: 0, done: false, coins: Math.round((60 + n * 35) * (1 + 'ERLCTBA'.indexOf(s.spots.at(-1)) * .4) / 10) * 10, xp: 40 + n * 15}; })};
  }
  return s.quests;
}
const fiQuestText = q => FI_QUESTS.find(x => x[0] === q.kind)[1](q.n);
function fiQuestEvent(kind, amount = 1, value) {  // something happened: the matching challenges advance
  const s = fiSave();
  for (const q of fiQuests().list) {
    if (q.done || q.kind !== kind) continue;
    q.got = kind === 'streak' ? Math.max(q.got, value) : q.got + amount;
    if (q.got >= q.n) { q.done = true; s.money += q.coins; s.xp = (s.xp || 0) + q.xp; fi.questMsg = {text: 'DÉFI RÉUSSI : ' + fiQuestText(q) + ' · +' + q.coins + ' pièces', t: 240}; sfx('launch'); }
  }
}
const fiValue = (f, cm) => Math.max(1, Math.round(FI_RARITY[f.rarity][3] * (.6 + .8 * (cm - f.min) / Math.max(1, f.max - f.min)) * (1 + 'ERLCTBA'.indexOf(f.spots[0]) * .25)));


const fmtAway = s => s < 3600 ? Math.round(s / 60) + ' min' : s < 86400 ? Math.floor(s / 3600) + ' h ' + String(Math.round(s % 3600 / 60)).padStart(2, '0') : Math.floor(s / 86400) + ' j ' + Math.floor(s % 86400 / 3600) + ' h';

/* ---------- jeu "Aquarium": keep alive the fish caught in Pêche. Every catch also goes, alive, to the holding pool (the first visit brings one
   of each species already in the collection). Tanks of 5 waters (fresh, sea, tropical, polar, abyss) hold the fish of their places; they get
   hungry and the water gets dirty, also while NeoBase is closed. Happy fish bring visitors: the ticket money goes to the Pêche purse, which
   also pays for the tanks, filters, feeders and decorations. Saved in games.aquarium (synced). ---------- */
const AQA = {W: 384, H: 216, SAND: 196,
  waters: {douce: ['Eau douce', 'ERL', 'E'], mer: ['Mer', 'C', 'C'], tropical: ['Tropical', 'T', 'T'], polaire: ['Polaire', 'B', 'B'], abysses: ['Abysses', 'A', 'A']},  // name, places, colours of
  sizes: [['Petit', 6, 0], ['Moyen', 10, 900], ['Grand', 16, 3500]],  // name, places, price to get to it
  decor: {plante: ['Plante', 120], rocher: ['Rocher', 150], corail: ['Corail', 250], chateau: ['Château', 400], coffre: ['Coffre', 500], epave: ['Épave', 900]},
  tankPrice: n => [0, 600, 2500, 7000, 16000, 35000][n] ?? 35000 * 2 ** (n - 5),
};
const aqSave = () => gstore('aquarium', {tanks: [{water: 'douce', size: 0, filter: false, feeder: false, decor: [], food: 100, dirt: 0, fish: []}], pool: [], cash: 0, last: Date.now(), gift: false, earned: 0, visitors: 0, seq: 1});
const aqFish = f => FISH[f.id];
const aqFits = (fish, tank) => [...aqFish(fish).spots].some(p => AQA.waters[tank.water][1].includes(p));
const aqNeedSize = fish => fish.cm > 120 ? 2 : fish.cm > 60 ? 1 : 0;  // a big fish needs a big tank
// how happy a fish is, 0-100: fed, clean water, decorations, not crowded
function aqHappy(t) {
  const crowd = t.fish.length > AQA.sizes[t.size][1] * .8 ? -10 : 0;
  return Math.max(0, Math.min(100, 50 + (t.food > 30 ? 20 : t.food > 0 ? 0 : -35) + (t.dirt < 40 ? 15 : t.dirt < 75 ? 0 : -25) + Math.min(4, t.decor.length) * 5 + crowd));
}
// ticket money an hour: what the fish are worth (rarity, size, place), times how happy they are
const aqIncome = t => t.fish.reduce((a, f) => a + fiValue(aqFish(f), f.cm) * .08, 0) * aqHappy(t) / 100;
// time passes: hunger, dirt and visitors, hour by hour (also for the time spent away)
function aqTick(now = Date.now()) {
  const s = aqSave(); let h = Math.max(0, (now - s.last) / 3.6e6); s.last = now;
  while (h > 0) {
    const d = Math.min(1, h); h -= d;
    for (const t of s.tanks) {
      s.cash += aqIncome(t) * d; s.visitors += t.fish.length * d * aqHappy(t) / 25;
      if (t.feeder) t.food = Math.max(t.food, 60); else t.food = Math.max(0, t.food - 8 * d);
      t.dirt = Math.min(100, t.dirt + (t.filter ? 1.5 : 5) * d * (.4 + t.fish.length / AQA.sizes[t.size][1]));
    }
  }
}
// Pêche: a fish that is landed is also kept alive in the holding pool
const aqKeep = (id, cm) => { const s = aqSave(); s.pool.push({id, cm, k: s.seq++}); if (s.pool.length > 60) s.pool.shift(); };

let aq = null;
const aqTank = () => aqSave().tanks[Math.min(aq?.tank || 0, aqSave().tanks.length - 1)];
function aqOpen() {
  const s = aqSave(), away = (Date.now() - s.last) / 1000, c0 = s.cash;
  if (!s.gift) {  // a first visit: one of each species already caught
    s.gift = true; const fs = fiSave();
    for (const id of Object.keys(fs.dex)) aqKeep(+id, fs.dex[id].best);
  }
  aqTick();
  if (away > 600 && s.cash - c0 >= 1) toast('Pendant ton absence (' + fmtAway(away) + '), les visiteurs ont laissé ' + Math.floor(s.cash - c0) + ' pièces à la caisse');
  aq ??= {raf: 0, g: $('aqCanvas').getContext('2d'), tick: 0, tank: 0, swim: {}, bubbles: [], flakes: [], sel: null};
  aq.mode = 'play'; saveGames(); aqUi(); gameLoop(aq, 'neodyme:aquarium', aqUpdate, aqDraw);
}
function aqUpdate() {
  if (aq.tick % 600 === 0) { aqTick(); aqUi(true); if (aq.tick % 3600 === 0) saveGames(); }
  if (Math.random() < .08) aq.bubbles.push({x: 20 + Math.random() * (AQA.W - 40), y: AQA.SAND, v: .3 + Math.random() * .4});
  for (const b of aq.bubbles) b.y -= b.v; aq.bubbles = aq.bubbles.filter(b => b.y > 12);
  for (const f of aq.flakes) f.y += f.y < AQA.SAND - 4 ? .35 : 0; if (aq.tick % 4 === 0) aq.flakes = aq.flakes.filter(f => ++f.t < 300);
  // each fish swims towards a target, and to the food when there is some
  for (const f of aqTank().fish) {
    const sw = aq.swim[f.k] ??= {x: 40 + Math.random() * 300, y: 40 + Math.random() * 120, tx: 0, ty: 0, dir: 1, wait: 0};
    const food = aq.flakes.find(fl => Math.abs(fl.x - sw.x) < 120);
    if (food) { sw.tx = food.x; sw.ty = food.y; if (Math.hypot(food.x - sw.x, food.y - sw.y) < 6) aq.flakes.splice(aq.flakes.indexOf(food), 1); }
    else if (--sw.wait <= 0 || Math.hypot(sw.tx - sw.x, sw.ty - sw.y) < 3) { sw.tx = 30 + Math.random() * (AQA.W - 60); sw.ty = 30 + Math.random() * (AQA.SAND - 70); sw.wait = 200 + Math.random() * 300; }
    const sp = (food ? .9 : .35) * (aqHappy(aqTank()) < 30 ? .5 : 1), dx = sw.tx - sw.x, dy = sw.ty - sw.y, d = Math.hypot(dx, dy) || 1;
    sw.x += dx / d * Math.min(sp, d); sw.y += dy / d * Math.min(sp * .6, d); if (Math.abs(dx) > 2) sw.dir = dx > 0 ? 1 : -1;
  }
}
/* ---------- drawing ---------- */
const AQ_DECOR = {  // little pixel decorations, standing on the sand
  plante: (g, x, t) => { for (let i = 0; i < 4; i++) for (let y = 0; y < 26 + i * 4; y += 2) px(g, i % 2 ? '#3fa05a' : '#5fd08a', x + i * 4 + Math.round(Math.sin((y + t / 8) / 6) * 2), AQA.SAND - y, 2, 2); },
  rocher: (g, x) => { px(g, '#5a5470', x, AQA.SAND - 12, 26, 12); px(g, '#8f8fa8', x + 4, AQA.SAND - 16, 14, 6); px(g, '#3a3448', x + 18, AQA.SAND - 8, 6, 6); },
  corail: (g, x) => { for (const [a, h, c] of [[0, 18, '#ff7a8a'], [6, 26, '#ff5ad9'], [12, 14, '#ffa07a'], [18, 22, '#ff7a8a']]) { px(g, c, x + a, AQA.SAND - h, 3, h); px(g, c, x + a - 2, AQA.SAND - h + 4, 2, 3); px(g, c, x + a + 3, AQA.SAND - h + 8, 2, 3); } },
  chateau: (g, x) => { px(g, '#a08a70', x, AQA.SAND - 30, 30, 30); for (let i = 0; i < 4; i++) px(g, '#a08a70', x + i * 8, AQA.SAND - 34, 5, 4); px(g, '#3a2a1a', x + 11, AQA.SAND - 14, 8, 14); px(g, '#3a2a1a', x + 5, AQA.SAND - 24, 4, 4); px(g, '#3a2a1a', x + 21, AQA.SAND - 24, 4, 4); },
  coffre: (g, x, t) => { px(g, '#8a5020', x, AQA.SAND - 12, 22, 12); px(g, '#ffd07a', x, AQA.SAND - 8, 22, 2); px(g, '#ffd07a', x + 9, AQA.SAND - 10, 4, 4); if (t % 240 < 30) px(g, '#ffffff', x + 4, AQA.SAND - 14 - (t % 240) / 3, 2, 2); },
  epave: (g, x) => { px(g, '#5a3a20', x, AQA.SAND - 14, 50, 14); px(g, '#7a5030', x + 6, AQA.SAND - 20, 30, 6); px(g, '#4a2a10', x + 30, AQA.SAND - 46, 3, 32); px(g, '#130a20', x + 10, AQA.SAND - 10, 5, 5); px(g, '#130a20', x + 24, AQA.SAND - 10, 5, 5); },
};
function aqDraw() {
  const g = aq.g, t = aq.tick, tank = aqTank(), W = AQA.W, H = AQA.H, water = FI_SPOTS[AQA.waters[tank.water][2]].water;
  for (let y = 0; y < H; y += 4) { px(g, mixc(water[0], water[2], y / H), 0, y, W, 4); }
  for (let i = 0; i < 6; i++) { g.fillStyle = 'rgba(255,255,255,.04)'; g.beginPath(); const x = (i * 83 + t / 6) % (W + 80) - 40; g.moveTo(x, 0); g.lineTo(x + 24, 0); g.lineTo(x - 30, AQA.SAND); g.lineTo(x - 44, AQA.SAND); g.fill(); }  // light rays
  px(g, '#c9b47a', 0, AQA.SAND, W, H - AQA.SAND); for (let x = 0; x < W; x += 7) px(g, '#a8935a', x, AQA.SAND + 3 + (x * 5) % 12, 3, 1);
  tank.decor.forEach((d, i) => AQ_DECOR[d](g, 18 + i * 92 + (i % 2) * 20, t));
  for (const f of aq.flakes) px(g, '#e8b070', f.x, f.y, 2, 2);
  for (const f of tank.fish) {
    const sw = aq.swim[f.k]; if (!sw) continue;
    const art = fiArt(aqFish(f)), sc = art.width <= 26 ? 2 : 1, w = art.width * sc, h = art.height * sc, bob = Math.sin((t + f.k * 40) / 20) * 1.5;
    g.save(); g.imageSmoothingEnabled = false; g.translate(Math.round(sw.x), Math.round(sw.y + bob)); if (sw.dir < 0) g.scale(-1, 1);
    g.drawImage(art, -w / 2, -h / 2, w, h); g.restore();
    if (aq.sel === f.k) { g.strokeStyle = '#ffd07a'; g.strokeRect(Math.round(sw.x - w / 2) - 2.5, Math.round(sw.y - h / 2) - 2.5, w + 5, h + 5); }
  }
  for (const b of aq.bubbles) { g.strokeStyle = 'rgba(255,255,255,.5)'; g.strokeRect(Math.round(b.x + Math.sin(b.y / 9) * 2) + .5, Math.round(b.y) + .5, 2, 2); }
  if (tank.dirt > 30) { g.fillStyle = `rgba(90,110,40,${(tank.dirt - 30) / 180})`; g.fillRect(0, 0, W, AQA.SAND); }  // the water goes green
  // the glass and the gauges
  g.fillStyle = 'rgba(11,3,28,.6)'; g.fillRect(0, 0, W, 16);
  g.font = '6px "Press Start 2P", monospace'; const gauge = (x, label, v, col) => { g.fillStyle = '#d9c6ff'; g.fillText(label, x, 11); px(g, '#2a1f50', x + 46, 5, 50, 6); px(g, col, x + 46, 5, v / 2, 6); };
  gauge(6, 'FAIM', 100 - tank.food, tank.food > 30 ? '#8ee8a0' : '#ff4f6d'); gauge(110, 'SALE', tank.dirt, tank.dirt < 40 ? '#8ee8a0' : '#ffc23a'); gauge(214, 'JOIE', aqHappy(tank), '#ff5ad9');
  g.fillStyle = '#ffd07a'; g.textAlign = 'right'; g.fillText(tank.fish.length + '/' + AQA.sizes[tank.size][1], W - 6, 11); g.textAlign = 'left';
  if (!tank.fish.length) gameText(g, W, [['BASSIN VIDE', '#ffd07a', 9], ['AJOUTE DES POISSONS DU VIVIER', '#ffffff', 7]], 100);
}
/* ---------- page ---------- */
function aqBuy(price, then) { const f = fiSave(); if (f.money < price) return toast('Pas assez de pièces (' + f.money + ' / ' + price + ')', true); f.money -= price; then(); saveGames(); sfx('notify'); aqUi(); }
const aqFishName = f => aqFish(f).name + ' · ' + f.cm + ' cm';
function aqUi(soft) {
  const s = aqSave(), tank = aqTank(), money = fiSave().money;
  $('aqInfo').textContent = money + ' pièces (Pêche) · caisse ' + Math.floor(s.cash) + ' · ' + s.tanks.reduce((a, t) => a + aqIncome(t), 0).toFixed(1).replace('.', ',') + ' pièces / h · ' + s.tanks.reduce((a, t) => a + t.fish.length, 0) + ' poissons · ' + Math.floor(s.visitors) + ' visiteurs';
  $('aqCash').textContent = 'ENCAISSER ' + Math.floor(s.cash);
  $('aqTank').replaceChildren(...s.tanks.map((t, i) => Object.assign(el('option', '', 'Bassin ' + (i + 1) + ' · ' + AQA.waters[t.water][0] + ' · ' + AQA.sizes[t.size][0] + ' (' + t.fish.length + '/' + AQA.sizes[t.size][1] + ')'), {value: i})));
  $('aqTank').value = s.tanks.indexOf(tank);
  if (soft) return;
  // the fish of this tank
  const inTank = el('div', 'sysCard px aqCol'); inTank.append(el('b', '', 'Dans ce bassin'));
  if (!tank.fish.length) inTank.append(el('small', 'hint', 'Aucun poisson.'));
  for (const f of tank.fish) {
    const row = el('div', 'aqRow' + (aq.sel === f.k ? ' on' : '')), img = el('img'); img.src = fiArtUrl(aqFish(f), false, 2);
    const out = el('button', 'btn px', 'AU VIVIER'); out.onclick = () => { tank.fish.splice(tank.fish.indexOf(f), 1); s.pool.push(f); saveGames(); aqUi(); };
    row.append(img, el('span', '', aqFishName(f) + ' · ' + FI_RARITY[aqFish(f).rarity][0]), out); row.onclick = e => { if (e.target !== out) { aq.sel = aq.sel === f.k ? null : f.k; aqUi(); } };
    inTank.append(row);
  }
  // the holding pool: fish waiting for a tank
  const pool = el('div', 'sysCard px aqCol'); pool.append(el('b', '', 'Vivier · ' + s.pool.length + ' poisson' + (s.pool.length > 1 ? 's' : '')), el('small', 'hint', 'Chaque poisson pêché arrive ici vivant (60 au plus).'));
  for (const f of [...s.pool].reverse()) {
    const row = el('div', 'aqRow'), img = el('img'); img.src = fiArtUrl(aqFish(f), false, 2);
    const fits = aqFits(f, tank), big = aqNeedSize(f) > tank.size, full = tank.fish.length >= AQA.sizes[tank.size][1];
    const put = el('button', 'btn px' + (fits && !big && !full ? ' main' : ''), 'METTRE'); put.disabled = !fits || big || full;
    put.title = !fits ? 'Pas la bonne eau : ' + [...aqFish(f).spots].map(p => FI_SPOTS[p].name).join(', ') : big ? 'Trop grand : il faut un bassin ' + AQA.sizes[aqNeedSize(f)][0].toLowerCase() : full ? 'Bassin plein' : 'Dans ce bassin';
    put.onclick = () => { s.pool.splice(s.pool.indexOf(f), 1); tank.fish.push(f); saveGames(); sfx('click'); aqUi(); };
    const v = Math.max(1, Math.round(fiValue(aqFish(f), f.cm) / 2)), free = el('button', 'btn px', 'RELÂCHER +' + v);
    free.title = 'Le rendre à l\'eau : la moitié de sa valeur en pièces'; free.onclick = () => { s.pool.splice(s.pool.indexOf(f), 1); fiSave().money += v; saveGames(); aqUi(); };
    row.append(img, el('span', '', aqFishName(f)), put, free); pool.append(row);
  }
  // the shop, paid with the Pêche coins
  const shop = el('div', 'sysCard px aqCol'); shop.append(el('b', '', 'Boutique · ' + money + ' pièces'));
  const item = (label, price, ok, then, why = '') => { const b = el('button', 'btn px aqShop', label + (ok ? ' · ' + price : why ? ' · ' + why : '')); b.disabled = !ok || money < price; b.onclick = () => aqBuy(price, then); shop.append(b); };
  const next = AQA.sizes[tank.size + 1];
  item(next ? 'Agrandir : ' + next[0].toLowerCase() + ' (' + next[1] + ' places)' : 'Bassin au plus grand', next?.[2], !!next, () => tank.size++);
  item('Filtre (l\'eau se salit 3 × moins vite)', 600, !tank.filter, () => tank.filter = true, 'installé');
  item('Distributeur (nourrit tout seul)', 1200, !tank.feeder, () => tank.feeder = true, 'installé');
  for (const [k, [name, price]] of Object.entries(AQA.decor)) item('Décor : ' + name.toLowerCase(), price, tank.decor.length < 4, () => tank.decor.push(k), '4 au plus');
  const nb = el('div', 'row'), sel = el('select', 'f gSel'); sel.append(...Object.entries(AQA.waters).map(([k, [n]]) => Object.assign(el('option', '', n), {value: k})));
  const price = AQA.tankPrice(s.tanks.length), add = el('button', 'btn main px', 'NOUVEAU BASSIN · ' + price); add.disabled = money < price;
  add.onclick = () => aqBuy(price, () => { s.tanks.push({water: sel.value, size: 0, filter: false, feeder: false, decor: [], food: 100, dirt: 0, fish: []}); aq.tank = s.tanks.length - 1; });
  nb.append(sel, add); shop.append(nb);
  $('aqPanel').replaceChildren(inTank, pool, shop);
}
$('aqTank').onchange = () => { aq.tank = +$('aqTank').value; aq.sel = null; aqUi(); $('aqTank').blur(); };
$('aqFeed').onclick = () => { const t = aqTank(); t.food = 100; for (let i = 0; i < 14; i++) aq.flakes.push({x: 40 + Math.random() * (AQA.W - 80), y: 18 + Math.random() * 8, t: 0}); saveGames(); aqUi(true); $('aqFeed').blur(); };
$('aqClean').onclick = () => { aqTank().dirt = 0; sfx('click'); saveGames(); aqUi(true); $('aqClean').blur(); };
$('aqCash').onclick = () => { const s = aqSave(), n = Math.floor(s.cash); if (!n) return; s.cash -= n; s.earned += n; fiSave().money += n; saveGames(); sfx('notify'); toast('+' + n + ' pièces pour la Pêche'); aqUi(); $('aqCash').blur(); };
$('aqCanvas').onpointerdown = e => {
  const r = $('aqCanvas').getBoundingClientRect(), x = (e.clientX - r.left) * AQA.W / r.width, y = (e.clientY - r.top) * AQA.H / r.height;
  const f = aqTank().fish.find(f => { const sw = aq.swim[f.k]; return sw && Math.abs(sw.x - x) < 22 && Math.abs(sw.y - y) < 14; });
  aq.sel = f ? f.k : null; if (f) toast(aqFishName(f) + ' · ' + FI_RARITY[aqFish(f).rarity][0] + ' · de : ' + [...aqFish(f).spots].map(p => FI_SPOTS[p].name).join(', ')); aqUi();
};
{  // self-check: a fed, clean, decorated tank is happy; 10 hours away make it hungry and dirty; an eel lives in fresh and sea water, not in the abyss
  const t = {water: 'douce', size: 0, filter: false, feeder: false, decor: ['plante', 'rocher'], food: 100, dirt: 0, fish: []}, eel = {id: FISH.findIndex(f => f.name === 'Anguille'), cm: 80, k: 0};
  console.assert(aqHappy(t) === 95 && aqFits(eel, t) && aqFits(eel, {water: 'mer'}) && !aqFits(eel, {water: 'abysses'}) && aqNeedSize(eel) === 1, 'aquarium needs');
}  // (non indenté : les textes sur plusieurs lignes restent exactement les tiens)
  // ---- fin ----
  ctx.onOpen(() => { (async () => { const d = await gf.read('games').catch(() => null); if (d) { for (const k of Object.keys(games)) delete games[k]; Object.assign(games, { best: {}, ...d }); } aqOpen(); })(); });
}
