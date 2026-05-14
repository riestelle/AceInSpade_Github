//  DATA

const FARE_MATRIX = {
  traditional: { base: 14, baseKm: 4, perKm: 2.00 },
  modern:      { base: 17, baseKm: 4, perKm: 2.30 },
};

const ROUTES = [
  { id:"cubao-vito-cruz", code:"CUBAO — VITO CRUZ VIA MABINI", shortCode:"CUBAO-VITO CRUZ",
    stops:[
      { name:"CUBAO EXPO / GATEWAY",       note:"Transfer point for LRT-2 and MRT-3",         km:0  },
      { name:"EDSA COR AURORA BLVD",       note:"Main intersection for provincial buses",      km:3  },
      { name:"STA. MESA / SM CENTERPOINT", note:"V. Mapa and Polytechnic University access",   km:7  },
      { name:"QUIAPO CHURCH",              note:"Plaza Miranda and heavy pedestrian crossing",  km:10 },
      { name:"VITO CRUZ / DLSU",           note:"University area and LRT-1 terminal destination", km:15 },
    ]
  },
  { id:"fairview-quiapo", code:"FAIRVIEW — QUIAPO VIA COMMONWEALTH", shortCode:"FAIRVIEW-QUIAPO",
    stops:[
      { name:"SM FAIRVIEW",       note:"End/start terminal, QC North",             km:0  },
      { name:"COMMONWEALTH AVE",  note:"Main corridor, multiple transfer options", km:5  },
      { name:"PHILCOA / UP DILIMAN", note:"University access point",               km:12 },
      { name:"ESPANA BLVD",       note:"UST and University Belt area",             km:18 },
      { name:"QUIAPO CHURCH",     note:"Terminal and transfer hub",                km:22 },
    ]
  },
  { id:"pitx-baclaran", code:"PITX — BACLARAN", shortCode:"PITX-BACLARAN",
    stops:[
      { name:"PITX TERMINAL 1",         note:"Parañaque Integrated Terminal Exchange", km:0 },
      { name:"COASTAL ROAD / MALL OF ASIA", note:"SM Mall of Asia stop",             km:3 },
      { name:"EDSA COR LIBERTAD",       note:"Transfer to EDSA routes",              km:5 },
      { name:"BACLARAN CHURCH",         note:"End terminal, LRT-1 Baclaran station", km:7 },
    ]
  },
  { id:"divisoria-malabon", code:"DIVISORIA — MALABON", shortCode:"DIVISORIA-MALABON",
    stops:[
      { name:"DIVISORIA MARKET",        note:"Major market and start terminal",      km:0 },
      { name:"TONDO / SMOKEY MOUNTAIN", note:"Residential and industrial area",       km:3 },
      { name:"NAVOTAS FISH PORT",       note:"Fishport complex stop",                 km:6 },
      { name:"MALABON PALENGKE",        note:"End terminal near public market",       km:9 },
    ]
  },
  { id:"novaliches-quiapo", code:"NOVALICHES — QUIAPO VIA RECTO", shortCode:"NOVALICHES-QUIAPO",
    stops:[
      { name:"NOVALICHES TERMINAL",   note:"Start terminal, Novaliches town center", km:0  },
      { name:"CALOOCAN CITY HALL",    note:"Government center transfer point",        km:6  },
      { name:"AVENIDA / RECTO",       note:"Shopping and transfer corridor",           km:14 },
      { name:"QUIAPO CHURCH",         note:"End terminal, major hub",                 km:17 },
    ]
  },
  { id:"alabang-lawton", code:"ALABANG — LAWTON VIA SKYWAY", shortCode:"ALABANG-LAWTON",
    stops:[
      { name:"ALABANG TERMINAL",       note:"South terminal, Muntinlupa",            km:0  },
      { name:"FILINVEST / AYALA ALABANG", note:"Commercial and business district",   km:3  },
      { name:"SUCAT INTERCHANGE",      note:"SLEX and Skyway entry point",            km:8  },
      { name:"PACO MARKET",            note:"Market and residential stop",            km:20 },
      { name:"LAWTON / MANILA CITY HALL", note:"End terminal near Manila Bay",       km:24 },
    ]
  },
];

const STOPS_DB = [
  { id:"cubao-gateway",    name:"CUBAO EXPO / GATEWAY",       routeId:"cubao-vito-cruz",    lat:14.6197, lon:121.0532 },
  { id:"edsa-aurora",      name:"EDSA COR AURORA BLVD",       routeId:"cubao-vito-cruz",    lat:14.6086, lon:121.0218 },
  { id:"sta-mesa-sm",      name:"STA. MESA / SM CENTERPOINT", routeId:"cubao-vito-cruz",    lat:14.6017, lon:121.0082 },
  { id:"quiapo-church-1",  name:"QUIAPO CHURCH",              routeId:"cubao-vito-cruz",    lat:14.5993, lon:120.9836 },
  { id:"vito-cruz-dlsu",   name:"VITO CRUZ / DLSU",           routeId:"cubao-vito-cruz",    lat:14.5648, lon:120.9932 },
  { id:"sm-fairview",      name:"SM FAIRVIEW",                routeId:"fairview-quiapo",    lat:14.7417, lon:121.0560 },
  { id:"commonwealth-ave", name:"COMMONWEALTH AVE",           routeId:"fairview-quiapo",    lat:14.7100, lon:121.0530 },
  { id:"philcoa-up",       name:"PHILCOA / UP DILIMAN",       routeId:"fairview-quiapo",    lat:14.6532, lon:121.0437 },
  { id:"espana-blvd",      name:"ESPANA BLVD",                routeId:"fairview-quiapo",    lat:14.6098, lon:120.9939 },
  { id:"quiapo-church-2",  name:"QUIAPO CHURCH",              routeId:"fairview-quiapo",    lat:14.5993, lon:120.9836 },
  { id:"pitx-terminal",    name:"PITX TERMINAL 1",            routeId:"pitx-baclaran",      lat:14.4868, lon:120.9820 },
  { id:"coastal-moa",      name:"COASTAL ROAD / MALL OF ASIA",routeId:"pitx-baclaran",      lat:14.5354, lon:120.9822 },
  { id:"edsa-libertad",    name:"EDSA COR LIBERTAD",          routeId:"pitx-baclaran",      lat:14.5469, lon:121.0003 },
  { id:"baclaran-church",  name:"BACLARAN CHURCH",            routeId:"pitx-baclaran",      lat:14.5284, lon:120.9982 },
  { id:"divisoria-market", name:"DIVISORIA MARKET",           routeId:"divisoria-malabon",  lat:14.5983, lon:120.9666 },
  { id:"tondo-smokey",     name:"TONDO / SMOKEY MOUNTAIN",    routeId:"divisoria-malabon",  lat:14.6175, lon:120.9637 },
  { id:"navotas-fishport", name:"NAVOTAS FISH PORT",          routeId:"divisoria-malabon",  lat:14.6580, lon:120.9440 },
  { id:"malabon-palengke", name:"MALABON PALENGKE",           routeId:"divisoria-malabon",  lat:14.6682, lon:120.9576 },
  { id:"novaliches-terminal", name:"NOVALICHES TERMINAL",     routeId:"novaliches-quiapo",  lat:14.7571, lon:121.0388 },
  { id:"caloocan-cityhall",name:"CALOOCAN CITY HALL",         routeId:"novaliches-quiapo",  lat:14.6530, lon:120.9672 },
  { id:"avenida-recto",    name:"AVENIDA / RECTO",            routeId:"novaliches-quiapo",  lat:14.6026, lon:120.9826 },
  { id:"quiapo-church-3",  name:"QUIAPO CHURCH",              routeId:"novaliches-quiapo",  lat:14.5993, lon:120.9836 },
  { id:"alabang-terminal", name:"ALABANG TERMINAL",           routeId:"alabang-lawton",     lat:14.4249, lon:121.0399 },
  { id:"filinvest-ayala",  name:"FILINVEST / AYALA ALABANG",  routeId:"alabang-lawton",     lat:14.4200, lon:121.0261 },
  { id:"sucat-interchange",name:"SUCAT INTERCHANGE",          routeId:"alabang-lawton",     lat:14.4591, lon:121.0320 },
  { id:"paco-market",      name:"PACO MARKET",                routeId:"alabang-lawton",     lat:14.5674, lon:120.9896 },
  { id:"lawton-cityhall",  name:"LAWTON / MANILA CITY HALL",  routeId:"alabang-lawton",     lat:14.5901, lon:120.9790 },
];

const DEFAULT_PHRASES = [
  { id:"bayad",     icon:"💰", fil:"Bayad po",                    en:"Pass the fare",          type:"normal"    },
  { id:"para",      icon:"✋", fil:"Para po — bababa na ako",     en:"Stop here — I'm getting off", type:"normal" },
  { id:"emergency", icon:"🚨", fil:"May emergency! Tumawag ng tulong!", en:"Emergency! Call for help!", type:"emergency" },
  { id:"tama",      icon:"🚌", fil:"Tama bang jeep ito papunta sa...", en:"Is this jeep going to...", type:"normal" },
  { id:"sukli",     icon:"💵", fil:"Sukli ko po",                 en:"My change, please",      type:"normal"    },
];

const BILL_DENOMINATIONS = [20, 50, 100, 200, 500, 1000];

const ALERT_PATTERNS = {
  soft:   { approach:[100,50,100],  near:[200,80,200],   signal:[300,100,300,100,500]  },
  medium: { approach:[200,80,200],  near:[400,100,400],  signal:[500,150,500,150,800]  },
  strong: { approach:[400,100,400], near:[600,150,600],  signal:[800,200,800,200,1000] },
};

function getAISystemPrompt(appLang = 'fil', context = null) {
  const languageRule = appLang === 'en'
    ? 'Answer in clear English by default, even if the user writes in Filipino or Taglish. If the user explicitly asks for Filipino, you may switch.'
    : 'Answer in Filipino or Taglish by default, but stay understandable and concise.';

  const interactionGuide = `Available app screens and main actions:
- Home: overview screen with online/offline status and fast navigation.
- I Am Deaf Card: a large visual card to show drivers that the user is deaf.
- Sabihin Mo: phrase cards with a speak button for communicating with the driver.
- Commute Dashboard: route and journey summary information.
- Hintuan Ko: search stops by name or landmark, set a destination stop, and receive GPS-based alerts.
- Bayad / Fare: calculate jeepney fare for the selected route and distance.
- Ruta / Routes: browse route lists and stop sequences.
- Vibration Settings: adjust vibration intensity/timing and manage Location/Notification permissions.

Why these are used:
- Use Hintuan Ko to find and select where to get off.
- Use Sabihin Mo to communicate with drivers using ready-made phrases.
- Use Vibration Settings to make alerts easier to feel and to restore permissions.
- Use the AI screen to ask about routes, stops, fare, permissions, or how to use the app.
If permissions are denied, tell the user to allow Location or Notifications in browser/site settings.`;

  const contextBlock = context
    ? `
Current commuter context (use this to give specific answers):
- Selected stop / babaan: ${context.stopName || 'hindi pa naka-set'}
- Route: ${context.routeCode || 'hindi pa naka-set'}
- Distance to stop: ${context.distanceText || 'unknown'}
If the user asks about fare, distance, or their stop, use this context to answer specifically.`
    : '';

  return `You are SenyasPo's AI route assistant for deaf and hard-of-hearing Philippine jeepney commuters.
${languageRule}
${interactionGuide}
Be brief — the user may be on a moving vehicle.
Focus on actionable guidance, not unrelated topics.
Keep responses short and practical. No markdown headers.${contextBlock}`;
}
