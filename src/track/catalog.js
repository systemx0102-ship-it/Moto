// Track catalog. Each layout is a closed polygon of corners [x, z, radius];
// corners are rounded with tangent arcs. The race starts mid-way along `startEdge`.

export const TRACKS = [
  {
    id: 'gp', name: 'AUTÓDROMO MÍTICO', place: 'Circuito internacional', theme: 'gp', time: 'day', weather: 'clear',
    blurb: 'Circuito de Gran Premio con recta de 650 m, horquilla y chicane final. Grip máximo.',
    width: 14, runoff: 13, runoffMat: 'grass', bank: 0.25, laps: 3,
    corners: [[0, 700, 45], [150, 760, 60], [380, 620, 120], [420, 450, 30], [250, 420, 50], [330, 250, 80], [600, 180, 25], [560, 40, 150], [300, -60, 40], [240, 60, 35], [160, -20, 35], [40, -120, 70]],
    startEdge: 11,
    elevation: [[0, 0], [0.15, 4], [0.3, 12], [0.45, 8], [0.6, 2], [0.75, 6], [0.9, 1]],
  },
  {
    id: 'coast', name: 'COSTA DORADA', place: 'Carretera costera', theme: 'coast', time: 'sunset', weather: 'clear',
    blurb: 'Curvas rápidas junto al acantilado con el sol cayendo sobre el mar.',
    width: 12, runoff: 6, runoffMat: 'sand', bank: 0.5, laps: 3,
    corners: [[0, 0, 120], [-150, 400, 200], [0, 800, 90], [300, 900, 150], [550, 700, 70], [450, 500, 100], [650, 300, 160], [600, -100, 110], [300, -200, 140]],
    startEdge: 8,
    elevation: [[0, 6], [0.12, 14], [0.25, 22], [0.38, 18], [0.5, 9], [0.62, 4], [0.75, 12], [0.88, 8]],
  },
  {
    id: 'city', name: 'NEO TOKIO', place: 'Circuito urbano nocturno', theme: 'city', time: 'night', weather: 'wet',
    blurb: 'Muros a centímetros, neones y asfalto mojado. Precisión o muro.',
    width: 13, runoff: 2.5, runoffMat: 'concrete', bank: 0.1, laps: 3,
    corners: [[0, 0, 25], [0, 600, 25], [300, 600, 25], [300, 400, 22], [500, 400, 25], [500, 750, 30], [800, 750, 25], [800, 150, 25], [550, 150, 20], [550, -150, 25], [250, -150, 25], [250, 0, 20]],
    startEdge: 0,
    elevation: [[0, 0], [0.25, 2], [0.5, 6], [0.75, 2]],
  },
  {
    id: 'desert', name: 'CAÑÓN ROJO', place: 'Desierto de las Mesetas', theme: 'desert', time: 'day', weather: 'clear',
    blurb: 'Rectas eternas, crestas que te hacen volar y curvas de alta velocidad.',
    width: 14, runoff: 16, runoffMat: 'sand', bank: 0.35, laps: 3,
    corners: [[0, 0, 200], [0, 1000, 150], [400, 1250, 300], [900, 1000, 120], [700, 650, 90], [1000, 400, 200], [800, -100, 250], [300, -250, 180]],
    startEdge: 0,
    elevation: [[0, 0], [0.08, 14], [0.12, 6], [0.2, 20], [0.3, 4], [0.42, 26], [0.5, 12], [0.58, 30], [0.7, 10], [0.8, 18], [0.9, 4]],
    bumps: [[140, 2.6, 52], [300, 3.2, 62], [-420, 3, 58], [-230, 2.2, 44]],
  },
  {
    id: 'alpine', name: 'ALPES NEVADOS', place: 'Puerto de montaña', theme: 'alpine', time: 'day', weather: 'snow',
    blurb: 'Paso de montaña con horquillas, desnivel brutal y nieve cayendo.',
    width: 11, runoff: 3.5, runoffMat: 'snow', bank: 0.3, laps: 2,
    corners: [[0, 0, 80], [400, 100, 32], [60, 200, 32], [420, 300, 32], [80, 400, 32], [300, 600, 100], [700, 550, 140], [900, 200, 120], [700, -150, 160], [250, -200, 120]],
    startEdge: 0,
    elevation: [[0, 0], [0.1, 18], [0.2, 38], [0.3, 58], [0.4, 70], [0.5, 64], [0.62, 48], [0.75, 30], [0.88, 12]],
  },
  {
    id: 'forest', name: 'BOSQUE TORMENTA', place: 'Selva negra', theme: 'forest', time: 'dusk', weather: 'storm',
    blurb: 'Tormenta eléctrica al anochecer, bosque cerrado y lluvia torrencial.',
    width: 12, runoff: 5, runoffMat: 'grass', bank: 0.4, laps: 3,
    corners: [[0, 0, 60], [-50, 350, 45], [150, 450, 70], [100, 650, 40], [350, 700, 90], [500, 500, 50], [350, 350, 60], [500, 150, 80], [350, -100, 70], [100, -150, 60]],
    startEdge: 0,
    elevation: [[0, 0], [0.15, 8], [0.3, 3], [0.45, 14], [0.6, 20], [0.75, 9], [0.9, 4]],
    bumps: [[120, 2.5, 40], [-150, 3, 45]],
  },
];

export const TRACK_BY_ID = Object.fromEntries(TRACKS.map((t) => [t.id, t]));
