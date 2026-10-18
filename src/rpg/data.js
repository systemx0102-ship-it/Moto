// MODO LEYENDA — static RPG data: stats, rarities, parts, perks, talents, the region
// map with its events and bosses, contract templates and the level curve. The
// machines are the heroes: no characters anywhere, only bikes, parts and rivals.

// ------------------------------------------------------------------ stats
// Every stat is a percentage bonus. The first six are the core attributes shown as
// bars; the rest are secondary (nitro economy, slipstream, drift, toughness, rewards).
export const STATS = {
  pot: { name: 'Potencia', short: 'POT', desc: 'Par y potencia del motor: aceleración y recuperación.' },
  vel: { name: 'Velocidad punta', short: 'VEL', desc: 'Velocidad máxima y desarrollo final.' },
  agr: { name: 'Agarre', short: 'AGR', desc: 'Adherencia en curva y en frenada.' },
  fre: { name: 'Frenada', short: 'FRE', desc: 'Potencia de frenado.' },
  man: { name: 'Manejo', short: 'MAN', desc: 'Rapidez al inclinar y cambiar de lado.' },
  nit: { name: 'Nitro', short: 'NIT', desc: 'Empuje del nitro y duración de la botella.' },
  rec: { name: 'Recarga de nitro', short: 'REC', desc: 'Velocidad de recarga del nitro.' },
  reb: { name: 'Rebufo', short: 'REB', desc: 'Eficacia del rebufo detrás de un rival.' },
  der: { name: 'Derrape', short: 'DER', desc: 'Nitro ganado al derrapar.' },
  res: { name: 'Resistencia', short: 'RES', desc: 'Aguante ante golpes contra muros y rivales.' },
  xp: { name: 'Experiencia', short: 'EXP', desc: 'Experiencia ganada en cada prueba.' },
  cre: { name: 'Créditos', short: 'CRE', desc: 'Créditos ganados en cada prueba.' },
  suerte: { name: 'Fortuna', short: 'FOR', desc: 'Probabilidad de piezas de mayor rareza.' },
};
export const CORE_STATS = ['pot', 'vel', 'agr', 'fre', 'man', 'nit'];
export const STAT_KEYS = Object.keys(STATS);
// hard caps on the summed bonus (keeps late-game physics sane)
export const STAT_CAP = { pot: 60, vel: 30, agr: 40, fre: 50, man: 50, nit: 80, rec: 120, reb: 120, der: 150, res: 100, xp: 150, cre: 150, suerte: 150 };

// ------------------------------------------------------------------ rarities
export const RARITY = [
  { id: 'comun', name: 'Común', color: '#a7adb5', mult: 1, affixes: 0, frags: 2, weight: 60 },
  { id: 'raro', name: 'Raro', color: '#3f8cff', mult: 1.25, affixes: 1, frags: 5, weight: 28 },
  { id: 'epico', name: 'Épico', color: '#a35bff', mult: 1.55, affixes: 2, frags: 12, weight: 9 },
  { id: 'legendario', name: 'Legendario', color: '#ffb020', mult: 1.9, affixes: 3, frags: 30, weight: 2.6 },
  { id: 'mitico', name: 'Mítico', color: '#ff3a3a', mult: 2.4, affixes: 4, frags: 80, weight: 0.4 },
];

// ------------------------------------------------------------------ parts
// base: the slot's intrinsic stats as [stat, K]; value = K * (1 + ilvl*0.06) * rarity.mult
// names: one model name per rarity tier.
export const SLOTS = {
  motor: { name: 'Motor', base: [['pot', 1.0]], names: ['Motor de serie', 'Kit de culata', 'Pistones forjados', 'Bloque de competición', 'Corazón de dragón'] },
  escape: { name: 'Escape', base: [['pot', 0.6], ['vel', 0.4]], names: ['Silencioso de serie', 'Escape deportivo', 'Línea completa de titanio', 'Escape de carreras', 'Aliento de volcán'] },
  centralita: { name: 'Centralita', base: [['vel', 0.7], ['rec', 2.0]], names: ['Centralita de serie', 'Mapa deportivo', 'Centralita programable', 'Electrónica de fábrica', 'Cerebro cuántico'] },
  neumaticos: { name: 'Neumáticos', base: [['agr', 1.0]], names: ['Neumáticos de calle', 'Neumáticos sport', 'Compuesto blando', 'Slicks de competición', 'Garras de grafeno'] },
  frenos: { name: 'Frenos', base: [['fre', 1.6]], names: ['Frenos de serie', 'Pastillas sinterizadas', 'Pinzas monobloque', 'Discos de carbono', 'Ancla del abismo'] },
  suspension: { name: 'Suspensión', base: [['man', 1.2], ['agr', 0.4]], names: ['Suspensión de serie', 'Muelles progresivos', 'Horquilla de cartucho', 'Suspensión de fábrica', 'Columna de mercurio'] },
  chasis: { name: 'Chasis', base: [['man', 0.8], ['res', 3.0]], names: ['Chasis de serie', 'Subchasis aligerado', 'Basculante de aluminio', 'Chasis de magnesio', 'Esqueleto de titanio'] },
  nitro: { name: 'Nitro', base: [['nit', 2.5], ['rec', 2.0]], names: ['Botella de nitro', 'Inyector doble', 'Nitro seco', 'Nitro de competición', 'Reactor de plasma'] },
};
export const SLOT_KEYS = Object.keys(SLOTS);

// random affixes: [stat, K]; value = K * (1 + ilvl*0.06) * sqrt(rarity.mult) * roll(0.7..1.3)
export const AFFIXES = [['pot', 0.5], ['vel', 0.3], ['agr', 0.5], ['fre', 0.8], ['man', 0.6], ['nit', 1.2], ['rec', 1.5], ['reb', 2.0], ['der', 2.0], ['res', 2.0], ['xp', 1.0], ['cre', 1.2], ['suerte', 0.8]];
// epithet from the item's strongest affix (raro and above): «Furia», «Ráfaga»…
export const EPITHET = { pot: 'Furia', vel: 'Ráfaga', agr: 'Garra', fre: 'Ancla', man: 'Filo', nit: 'Trueno', rec: 'Aliento', reb: 'Estela', der: 'Deriva', res: 'Coraza', xp: 'Saber', cre: 'Oro', suerte: 'Fortuna' };

export const ILVL_K = 0.06;       // per item level
export const PLUS_K = 0.06;       // per forge level (+1..+10)
export const PLUS_MAX = 10;
export const INV_MAX = 80;

// ------------------------------------------------------------------ perks
// Unique powers on legendary (35 %) and mythic (always) parts, and on a few talents.
export const PERKS = {
  sed: { name: 'Sed de sangre', desc: 'Cada adelantamiento recarga un 10 % de nitro.' },
  deriva: { name: 'Deriva infinita', desc: 'Al cerrar un derrape de más de 1 s, +8 % de potencia durante 3 s.' },
  fenix: { name: 'Fénix', desc: 'La primera caída de cada prueba te devuelve a pista al instante.' },
  estela: { name: 'Cazador de estelas', desc: 'El rebufo es el doble de eficaz.' },
  relampago: { name: 'Relámpago', desc: 'Sales con el nitro lleno y +10 % de potencia los primeros 4 s.' },
  instinto: { name: 'Instinto final', desc: '+6 % de potencia en la última vuelta.' },
  alas: { name: 'Alas', desc: 'Los saltos recargan el triple de nitro.' },
  tormenta: { name: 'Rey de la tormenta', desc: 'La lluvia y la nieve apenas te quitan agarre.' },
  reactor: { name: 'Reactor', desc: 'El nitro se recarga un 60 % más rápido.' },
  blindaje: { name: 'Blindaje', desc: 'Los golpes contra muros y rivales casi nunca te tiran.' },
};
export const PERK_KEYS = Object.keys(PERKS);

// ------------------------------------------------------------------ progression
export const LEVEL_MAX = 50;
export const xpToNext = (L) => Math.round(100 * L ** 1.1 + 100);
export const MASTERY_MAX = 20;
export const masteryToNext = (m) => 300 + 250 * m;
export const MASTERY_STATS = ['pot', 'agr', 'fre', 'man', 'nit'];
export const MASTERY_PER_POINT = 0.8;   // % per allocated point
export const MASTERY_POINTS_PER_LEVEL = 2;
export const MASTERY_STAT_MAX = 15;     // points per stat
export const RANKS = [
  { from: 1, name: 'Bronce', color: '#c08457' },
  { from: 10, name: 'Plata', color: '#c9d1da' },
  { from: 20, name: 'Oro', color: '#f0c050' },
  { from: 30, name: 'Platino', color: '#8fe3e0' },
  { from: 40, name: 'Diamante', color: '#9cc8ff' },
  { from: 50, name: 'Mítico', color: '#ff3a3a' },
];
export const START_CREDITS = 600;
export const STARTERS = ['spectra', 'viper', 'cafe'];

// ------------------------------------------------------------------ talents
// Three branches on a 3-column grid (row 0 at the top). Each rank grants `stats`;
// a node with `perk` grants it once learned. req: [nodeId, ranks] prerequisites.
export const BRANCHES = [
  { id: 'motor', name: 'Motor', color: '#e2231a', desc: 'Potencia, velocidad y nitro.' },
  { id: 'chasis', name: 'Chasis', color: '#3f8cff', desc: 'Agarre, frenada, manejo y derrape.' },
  { id: 'escuderia', name: 'Escudería', color: '#f0c050', desc: 'Experiencia, créditos, fortuna y rebufo.' },
];
export const TALENTS = [
  // motor
  { id: 'admision', branch: 'motor', row: 0, col: 1, name: 'Admisión libre', max: 5, stats: { pot: 1 } },
  { id: 'desarrollo', branch: 'motor', row: 1, col: 0, name: 'Desarrollo largo', max: 5, stats: { vel: 0.8 }, req: [['admision', 2]] },
  { id: 'botella', branch: 'motor', row: 1, col: 2, name: 'Botella grande', max: 3, stats: { nit: 4 }, req: [['admision', 2]] },
  { id: 'inyeccion', branch: 'motor', row: 2, col: 1, name: 'Doble inyección', max: 5, stats: { pot: 1.2 }, req: [['admision', 5]] },
  { id: 'purga', branch: 'motor', row: 2, col: 2, name: 'Purga rápida', max: 3, stats: { rec: 6 }, req: [['botella', 3]] },
  { id: 'salida', branch: 'motor', row: 3, col: 0, name: 'Salida relámpago', max: 1, perk: 'relampago', req: [['desarrollo', 3]] },
  { id: 'reactor', branch: 'motor', row: 3, col: 2, name: 'Reactor', max: 1, perk: 'reactor', req: [['purga', 3]] },
  { id: 'corazon', branch: 'motor', row: 4, col: 1, name: 'Corazón mítico', max: 1, stats: { pot: 4, vel: 2 }, req: [['inyeccion', 5]] },
  // chasis
  { id: 'compuesto', branch: 'chasis', row: 0, col: 1, name: 'Compuesto blando', max: 5, stats: { agr: 0.8 } },
  { id: 'pinzas', branch: 'chasis', row: 1, col: 0, name: 'Pinzas radiales', max: 5, stats: { fre: 1.5 }, req: [['compuesto', 2]] },
  { id: 'geometria', branch: 'chasis', row: 1, col: 2, name: 'Geometría agresiva', max: 5, stats: { man: 1.2 }, req: [['compuesto', 2]] },
  { id: 'contravolante', branch: 'chasis', row: 2, col: 1, name: 'Contravolante', max: 5, stats: { der: 6 }, req: [['compuesto', 5]] },
  { id: 'jaula', branch: 'chasis', row: 2, col: 0, name: 'Jaula de protección', max: 3, stats: { res: 8 }, req: [['pinzas', 3]] },
  { id: 'blindaje', branch: 'chasis', row: 3, col: 0, name: 'Blindaje', max: 1, perk: 'blindaje', req: [['jaula', 3]] },
  { id: 'tormenta', branch: 'chasis', row: 3, col: 2, name: 'Rey de la tormenta', max: 1, perk: 'tormenta', req: [['geometria', 4]] },
  { id: 'instintocurva', branch: 'chasis', row: 4, col: 1, name: 'Instinto de curva', max: 1, stats: { agr: 3, man: 3 }, req: [['contravolante', 5]] },
  // escudería
  { id: 'telemetria', branch: 'escuderia', row: 0, col: 1, name: 'Telemetría', max: 5, stats: { xp: 4 } },
  { id: 'patrocinio', branch: 'escuderia', row: 1, col: 0, name: 'Patrocinadores', max: 5, stats: { cre: 5 }, req: [['telemetria', 2]] },
  { id: 'ojeador', branch: 'escuderia', row: 1, col: 2, name: 'Ojeador de piezas', max: 5, stats: { suerte: 4 }, req: [['telemetria', 2]] },
  { id: 'tunel', branch: 'escuderia', row: 2, col: 1, name: 'Túnel de viento', max: 5, stats: { reb: 8 }, req: [['telemetria', 5]] },
  { id: 'sed', branch: 'escuderia', row: 3, col: 0, name: 'Sed de sangre', max: 1, perk: 'sed', req: [['patrocinio', 3]] },
  { id: 'estela', branch: 'escuderia', row: 3, col: 2, name: 'Cazador de estelas', max: 1, perk: 'estela', req: [['tunel', 3]] },
  { id: 'leyenda', branch: 'escuderia', row: 4, col: 1, name: 'Leyenda viva', max: 1, stats: { xp: 10, suerte: 10 }, req: [['tunel', 5]] },
];
export const TALENT_BY_ID = Object.fromEntries(TALENTS.map((t) => [t.id, t]));
export const talentResetCost = (spent) => 100 + spent * 60;

// ------------------------------------------------------------------ bikes in the mode
// price in credits; boss bikes are won by beating their boss (and can then be bought).
export const BIKE_PRICE = {
  cafe: 2500, viper: 4500, spectra: 4500, bobber: 3500, ringo: 6000, hornet: 3000, fang: 4000,
  baron: 5500, atlas: 6500, drag: 8000, volt: 9000, raptor: 10000, apex: 16000,
};

// ------------------------------------------------------------------ bosses
// perf: extra multipliers on top of the event's AI scaling. livery index on the bike.
export const BOSSES = {
  halcon: { bike: 'raptor', livery: 0, name: 'EL HALCÓN', title: 'Jefe del Autódromo', perf: { power: 1.05, top: 1.02, grip: 1.02 } },
  baron: { bike: 'baron', livery: 2, name: 'EL BARÓN DE HIERRO', title: 'Jefe de la Costa', perf: { power: 1.06, top: 1.03, grip: 1.02 } },
  colmillo: { bike: 'fang', livery: 1, name: 'COLMILLO', title: 'Jefe del Bosque', perf: { power: 1.06, top: 1.03, grip: 1.03 } },
  avispa: { bike: 'hornet', livery: 0, name: 'LA AVISPA', title: 'Jefe del Cañón', perf: { power: 1.07, top: 1.04, grip: 1.03 } },
  fantasma: { bike: 'volt', livery: 1, name: 'EL FANTASMA', title: 'Jefe de Neo Tokio', perf: { power: 1.07, top: 1.04, grip: 1.04 } },
  titan: { bike: 'atlas', livery: 0, name: 'EL TITÁN', title: 'Jefe de las Cumbres', perf: { power: 1.08, top: 1.05, grip: 1.04 } },
  mitico: { bike: 'apex', livery: 2, name: 'MÍTICO', title: 'El último jefe', perf: { power: 1.1, top: 1.06, grip: 1.05 } },
};

// ------------------------------------------------------------------ objectives
// kind: pos (finish at or above `n`), win, boss (finish ahead of the boss), noCrash,
// survive (not eliminated), lap (best lap <= ref * k, ref = ideal lap of your bike),
// drift (total drift seconds >= s), margin (win by >= s seconds), overtakes (>= n).
export function objectiveText(o) {
  switch (o.kind) {
    case 'pos': return o.n === 1 ? 'Gana la prueba' : `Termina entre los ${o.n} primeros`;
    case 'win': return 'Gana la prueba';
    case 'boss': return 'Termina por delante del jefe';
    case 'noCrash': return 'Sin caídas';
    case 'survive': return 'No seas eliminado';
    case 'lap': return `Vuelta por debajo de la referencia ×${o.k.toFixed(2)}`;
    case 'drift': return `Derrapa ${o.s} s en total`;
    case 'margin': return `Gana con ${o.s} s de ventaja`;
    case 'overtakes': return `Adelanta ${o.n} veces`;
    default: return '';
  }
}

// ------------------------------------------------------------------ events
// type: carrera | duelo | eliminacion | contrarreloj | derrape | jefe
// level: event level (AI scaling, item level of the loot, rewards)
// obj: three objectives, one star each; the first one is the pass condition
// rival: the duel opponent's bike id; boss: key into BOSSES
// time / weather: overrides for the track's defaults
const E = (id, type, name, level, o) => ({ id, type, name, level, laps: 2, rivals: 5, ...o });
export const REGIONS = [
  {
    id: 'autodromo', track: 'gp', name: 'Autódromo Mítico', sub: 'La licencia', levels: [1, 8], boss: 'halcon',
    events: [
      E('au1', 'carrera', 'Bautismo de fuego', 1, { rivals: 5, obj: [{ kind: 'pos', n: 3 }, { kind: 'win' }, { kind: 'noCrash' }] }),
      E('au2', 'contrarreloj', 'Vuelta de calificación', 2, { rivals: 0, obj: [{ kind: 'lap', k: 1.14 }, { kind: 'lap', k: 1.08 }, { kind: 'lap', k: 1.04 }] }),
      E('au3', 'duelo', 'Duelo en la recta', 3, { rivals: 1, rival: 'cafe', obj: [{ kind: 'win' }, { kind: 'margin', s: 2 }, { kind: 'noCrash' }] }),
      E('au4', 'eliminacion', 'Eliminación', 4, { rivals: 5, laps: 3, obj: [{ kind: 'survive' }, { kind: 'pos', n: 2 }, { kind: 'win' }] }),
      E('au5', 'jefe', 'El Halcón', 6, { rivals: 5, laps: 3, boss: 'halcon', obj: [{ kind: 'boss' }, { kind: 'win' }, { kind: 'noCrash' }] }),
    ],
  },
  {
    id: 'costa', track: 'coast', name: 'Costa Dorada', sub: 'Asfalto y salitre', levels: [6, 14], boss: 'baron',
    events: [
      E('co1', 'carrera', 'Atardecer en la costa', 7, { rivals: 7, obj: [{ kind: 'pos', n: 3 }, { kind: 'win' }, { kind: 'overtakes', n: 6 }] }),
      E('co2', 'derrape', 'Deriva salada', 8, { rivals: 0, obj: [{ kind: 'drift', s: 8 }, { kind: 'drift', s: 14 }, { kind: 'drift', s: 20 }] }),
      E('co3', 'duelo', 'Duelo fantasma', 9, { rivals: 1, rival: 'bobber', obj: [{ kind: 'win' }, { kind: 'margin', s: 2 }, { kind: 'noCrash' }] }),
      E('co4', 'carrera', 'Costa de noche', 10, { rivals: 7, laps: 3, time: 'night', obj: [{ kind: 'pos', n: 3 }, { kind: 'win' }, { kind: 'noCrash' }] }),
      E('co5', 'jefe', 'El Barón de Hierro', 12, { rivals: 5, laps: 3, boss: 'baron', obj: [{ kind: 'boss' }, { kind: 'win' }, { kind: 'noCrash' }] }),
    ],
  },
  {
    id: 'bosque', track: 'forest', name: 'Bosque Tormenta', sub: 'Barro, raíces y relámpagos', levels: [12, 20], boss: 'colmillo',
    events: [
      E('bo1', 'carrera', 'Bajo la tormenta', 13, { rivals: 7, obj: [{ kind: 'pos', n: 3 }, { kind: 'win' }, { kind: 'noCrash' }] }),
      E('bo2', 'contrarreloj', 'Raíces y barro', 14, { rivals: 0, obj: [{ kind: 'lap', k: 1.12 }, { kind: 'lap', k: 1.07 }, { kind: 'lap', k: 1.03 }] }),
      E('bo3', 'eliminacion', 'Eliminación salvaje', 15, { rivals: 7, laps: 3, obj: [{ kind: 'survive' }, { kind: 'pos', n: 2 }, { kind: 'win' }] }),
      E('bo4', 'derrape', 'Hojas mojadas', 16, { rivals: 0, obj: [{ kind: 'drift', s: 10 }, { kind: 'drift', s: 16 }, { kind: 'drift', s: 24 }] }),
      E('bo5', 'jefe', 'Colmillo', 18, { rivals: 5, laps: 3, boss: 'colmillo', obj: [{ kind: 'boss' }, { kind: 'win' }, { kind: 'noCrash' }] }),
    ],
  },
  {
    id: 'canon', track: 'desert', name: 'Cañón Rojo', sub: 'Polvo, calor y saltos', levels: [18, 28], boss: 'avispa',
    events: [
      E('ca1', 'carrera', 'Polvo rojo', 19, { rivals: 7, obj: [{ kind: 'pos', n: 3 }, { kind: 'win' }, { kind: 'overtakes', n: 8 }] }),
      E('ca2', 'duelo', 'Duelo del trueno', 21, { rivals: 1, rival: 'drag', obj: [{ kind: 'win' }, { kind: 'margin', s: 3 }, { kind: 'noCrash' }] }),
      E('ca3', 'contrarreloj', 'Espejismo', 22, { rivals: 0, time: 'sunset', obj: [{ kind: 'lap', k: 1.1 }, { kind: 'lap', k: 1.06 }, { kind: 'lap', k: 1.03 }] }),
      E('ca4', 'eliminacion', 'Eliminación en el cañón', 24, { rivals: 7, laps: 3, obj: [{ kind: 'survive' }, { kind: 'pos', n: 2 }, { kind: 'win' }] }),
      E('ca5', 'jefe', 'La Avispa', 26, { rivals: 7, laps: 3, boss: 'avispa', obj: [{ kind: 'boss' }, { kind: 'win' }, { kind: 'noCrash' }] }),
    ],
  },
  {
    id: 'neotokio', track: 'city', name: 'Neo Tokio', sub: 'Neón sobre asfalto mojado', levels: [26, 38], boss: 'fantasma',
    events: [
      E('ne1', 'carrera', 'Neón y asfalto', 27, { rivals: 7, obj: [{ kind: 'pos', n: 3 }, { kind: 'win' }, { kind: 'noCrash' }] }),
      E('ne2', 'derrape', 'Derrape urbano', 29, { rivals: 0, obj: [{ kind: 'drift', s: 10 }, { kind: 'drift', s: 18 }, { kind: 'drift', s: 26 }] }),
      E('ne3', 'duelo', 'Duelo de dos tiempos', 31, { rivals: 1, rival: 'ringo', obj: [{ kind: 'win' }, { kind: 'margin', s: 3 }, { kind: 'noCrash' }] }),
      E('ne4', 'eliminacion', 'Eliminación nocturna', 33, { rivals: 7, laps: 3, obj: [{ kind: 'survive' }, { kind: 'pos', n: 2 }, { kind: 'win' }] }),
      E('ne5', 'jefe', 'El Fantasma', 35, { rivals: 7, laps: 3, boss: 'fantasma', obj: [{ kind: 'boss' }, { kind: 'win' }, { kind: 'noCrash' }] }),
    ],
  },
  {
    id: 'cumbres', track: 'alpine', name: 'Alpes Nevados', sub: 'Hielo negro y puertos de montaña', levels: [35, 46], boss: 'titan',
    events: [
      E('cu1', 'carrera', 'Hielo negro', 36, { rivals: 7, obj: [{ kind: 'pos', n: 3 }, { kind: 'win' }, { kind: 'noCrash' }] }),
      E('cu2', 'contrarreloj', 'Paso de montaña', 38, { rivals: 0, obj: [{ kind: 'lap', k: 1.1 }, { kind: 'lap', k: 1.05 }, { kind: 'lap', k: 1.02 }] }),
      E('cu3', 'duelo', 'Duelo en la cumbre', 40, { rivals: 1, rival: 'viper', obj: [{ kind: 'win' }, { kind: 'margin', s: 3 }, { kind: 'noCrash' }] }),
      E('cu4', 'carrera', 'Ventisca', 42, { rivals: 7, laps: 3, time: 'dusk', weather: 'snow', obj: [{ kind: 'pos', n: 3 }, { kind: 'win' }, { kind: 'noCrash' }] }),
      E('cu5', 'jefe', 'El Titán', 44, { rivals: 7, laps: 3, boss: 'titan', obj: [{ kind: 'boss' }, { kind: 'win' }, { kind: 'noCrash' }] }),
    ],
  },
  {
    id: 'cumbre', track: 'gp', name: 'Cumbre Mítica', sub: 'Solo para leyendas', levels: [45, 50], boss: 'mitico', final: true,
    events: [
      E('mi1', 'eliminacion', 'Noche de eliminación', 46, { track: 'gp', rivals: 9, laps: 4, time: 'night', weather: 'storm', obj: [{ kind: 'survive' }, { kind: 'pos', n: 2 }, { kind: 'win' }] }),
      E('mi2', 'derrape', 'Deriva de neón', 47, { track: 'city', rivals: 0, obj: [{ kind: 'drift', s: 14 }, { kind: 'drift', s: 22 }, { kind: 'drift', s: 30 }] }),
      E('mi3', 'carrera', 'Tormenta en la costa', 48, { track: 'coast', rivals: 9, laps: 3, time: 'night', weather: 'storm', obj: [{ kind: 'pos', n: 3 }, { kind: 'win' }, { kind: 'noCrash' }] }),
      E('mi4', 'duelo', 'Duelo de superbikes', 49, { track: 'forest', rivals: 1, rival: 'raptor', obj: [{ kind: 'win' }, { kind: 'margin', s: 3 }, { kind: 'noCrash' }] }),
      E('mi5', 'jefe', 'MÍTICO', 50, { track: 'alpine', rivals: 9, laps: 3, time: 'night', weather: 'clear', boss: 'mitico', obj: [{ kind: 'boss' }, { kind: 'win' }, { kind: 'noCrash' }] }),
    ],
  },
];
export const EVENT_BY_ID = {};
REGIONS.forEach((r, ri) => r.events.forEach((e, ei) => { EVENT_BY_ID[e.id] = Object.assign(e, { region: r.id, regionIndex: ri, index: ei, track: e.track || r.track }); }));
export const REGION_BY_ID = Object.fromEntries(REGIONS.map((r) => [r.id, r]));
export const TYPE_NAME = { carrera: 'Carrera', duelo: 'Duelo', eliminacion: 'Eliminación', contrarreloj: 'Contrarreloj', derrape: 'Desafío de derrape', jefe: 'Jefe' };
export const TYPE_DESC = {
  carrera: 'Carrera contra la parrilla. Termina en el podio para superar la prueba.',
  duelo: 'Mano a mano contra un único rival. Solo vale ganar.',
  eliminacion: 'Al final de cada vuelta queda eliminado el último. Sobrevive hasta la bandera.',
  contrarreloj: 'Pista libre y crono en marcha. Bate la vuelta de referencia de tu moto.',
  derrape: 'Sin rivales: acumula segundos de derrape antes de la bandera.',
  jefe: 'El jefe de la región y su escolta. Termina por delante del jefe para ganarte su moto.',
};

// AI scaling by event level (on top of the usual balancing against your machine)
export function aiScale(level) {
  const k = Math.max(0, level - 1);
  return { skill: 0.84 + 0.16 * Math.min(1, k / 45), power: 1 + 0.004 * k, top: 1 + 0.0018 * k, grip: 1 + 0.0015 * k };
}
// recommended "Poder" (gear score) for an event level
export const recommendedPower = (level) => Math.round(80 + level * 62);

// ------------------------------------------------------------------ rewards
export const rewardXp = (level) => 150 + 55 * level;
export const rewardCredits = (level) => 120 + 18 * level;
export const POS_FACTOR = [1, 0.8, 0.66, 0.55, 0.47, 0.41, 0.36, 0.32, 0.29, 0.26, 0.24, 0.22];
export const XP_BONUS = { overtake: 15, driftS: 10, clean: 100, star: 60, boss: 400, firstClear: 250, perLevel: 25 }; // first clear / boss / star bonuses also grow by perLevel × event level

// ------------------------------------------------------------------ contracts
export const CONTRACTS = [
  { id: 'overtakes', text: 'Adelanta a {n} rivales', stat: 'overtakes', n: [8, 25] },
  { id: 'drift', text: 'Derrapa un total de {n} s', stat: 'driftS', n: [15, 60] },
  { id: 'nitro', text: 'Usa el nitro durante {n} s', stat: 'nitroS', n: [20, 80] },
  { id: 'wins', text: 'Gana {n} pruebas', stat: 'wins', n: [1, 3] },
  { id: 'podiums', text: 'Consigue {n} podios', stat: 'podiums', n: [2, 5] },
  { id: 'clean', text: 'Termina {n} pruebas sin caerte', stat: 'clean', n: [2, 5] },
  { id: 'speed', text: 'Alcanza {n} km/h', stat: 'topKmh', max: true, n: [200, 290] },
  { id: 'air', text: 'Vuela {n} s en saltos', stat: 'airS', n: [3, 10] },
  { id: 'stars', text: 'Consigue {n} estrellas', stat: 'stars', n: [2, 6] },
  { id: 'km', text: 'Recorre {n} km', stat: 'km', n: [10, 40] },
];
export const CONTRACT_SLOTS = 3;
export const contractRerollCost = (level) => 60 + level * 8;
