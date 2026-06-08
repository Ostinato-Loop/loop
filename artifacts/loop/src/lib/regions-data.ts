/**
 * Loop — Static Region Data
 * Embedded region lookup so onboarding works without the rald_regions DB table.
 * When migration 009 is applied, the /api/regions/search endpoint takes over.
 * LILCKY STUDIO LIMITED
 */

export interface Country {
  code: string;
  name: string;
  flag: string;
  hasStates: boolean;
}

export interface Region {
  id:    string;  // slug, e.g. "lagos", "ikeja"
  name:  string;  // display name
  type:  "state" | "lga" | "lcda";
  stateId?: string;
  displayLabel: string;
}

// ── African countries (Loop-relevant markets first) ──────────────────
export const COUNTRIES: Country[] = [
  { code: "NG", name: "Nigeria",           flag: "🇳🇬", hasStates: true  },
  { code: "GH", name: "Ghana",             flag: "🇬🇭", hasStates: true  },
  { code: "KE", name: "Kenya",             flag: "🇰🇪", hasStates: true  },
  { code: "ZA", name: "South Africa",      flag: "🇿🇦", hasStates: true  },
  { code: "ET", name: "Ethiopia",          flag: "🇪🇹", hasStates: false },
  { code: "TZ", name: "Tanzania",          flag: "🇹🇿", hasStates: false },
  { code: "EG", name: "Egypt",             flag: "🇪🇬", hasStates: false },
  { code: "DZ", name: "Algeria",           flag: "🇩🇿", hasStates: false },
  { code: "MA", name: "Morocco",           flag: "🇲🇦", hasStates: false },
  { code: "AO", name: "Angola",            flag: "🇦🇴", hasStates: false },
  { code: "CM", name: "Cameroon",          flag: "🇨🇲", hasStates: false },
  { code: "CI", name: "Côte d'Ivoire",     flag: "🇨🇮", hasStates: false },
  { code: "SN", name: "Senegal",           flag: "🇸🇳", hasStates: false },
  { code: "UG", name: "Uganda",            flag: "🇺🇬", hasStates: false },
  { code: "ZM", name: "Zambia",            flag: "🇿🇲", hasStates: false },
  { code: "ZW", name: "Zimbabwe",          flag: "🇿🇼", hasStates: false },
  { code: "RW", name: "Rwanda",            flag: "🇷🇼", hasStates: false },
  { code: "SD", name: "Sudan",             flag: "🇸🇩", hasStates: false },
  { code: "MZ", name: "Mozambique",        flag: "🇲🇿", hasStates: false },
  { code: "MG", name: "Madagascar",        flag: "🇲🇬", hasStates: false },
];

// ── Nigerian states (36 + FCT) ────────────────────────────────────────
const NG_STATES: Region[] = [
  { id: "abia",           name: "Abia",           type: "state", displayLabel: "Abia" },
  { id: "adamawa",        name: "Adamawa",        type: "state", displayLabel: "Adamawa" },
  { id: "akwa-ibom",     name: "Akwa Ibom",      type: "state", displayLabel: "Akwa Ibom" },
  { id: "anambra",        name: "Anambra",        type: "state", displayLabel: "Anambra" },
  { id: "bauchi",         name: "Bauchi",         type: "state", displayLabel: "Bauchi" },
  { id: "bayelsa",        name: "Bayelsa",        type: "state", displayLabel: "Bayelsa" },
  { id: "benue",          name: "Benue",          type: "state", displayLabel: "Benue" },
  { id: "borno",          name: "Borno",          type: "state", displayLabel: "Borno" },
  { id: "cross-river",    name: "Cross River",    type: "state", displayLabel: "Cross River" },
  { id: "delta",          name: "Delta",          type: "state", displayLabel: "Delta" },
  { id: "ebonyi",         name: "Ebonyi",         type: "state", displayLabel: "Ebonyi" },
  { id: "edo",            name: "Edo",            type: "state", displayLabel: "Edo" },
  { id: "ekiti",          name: "Ekiti",          type: "state", displayLabel: "Ekiti" },
  { id: "enugu",          name: "Enugu",          type: "state", displayLabel: "Enugu" },
  { id: "abuja-fct",     name: "Abuja (FCT)",    type: "state", displayLabel: "Abuja (FCT)" },
  { id: "gombe",          name: "Gombe",          type: "state", displayLabel: "Gombe" },
  { id: "imo",            name: "Imo",            type: "state", displayLabel: "Imo" },
  { id: "jigawa",         name: "Jigawa",         type: "state", displayLabel: "Jigawa" },
  { id: "kaduna",         name: "Kaduna",         type: "state", displayLabel: "Kaduna" },
  { id: "kano",           name: "Kano",           type: "state", displayLabel: "Kano" },
  { id: "katsina",        name: "Katsina",        type: "state", displayLabel: "Katsina" },
  { id: "kebbi",          name: "Kebbi",          type: "state", displayLabel: "Kebbi" },
  { id: "kogi",           name: "Kogi",           type: "state", displayLabel: "Kogi" },
  { id: "kwara",          name: "Kwara",          type: "state", displayLabel: "Kwara" },
  { id: "lagos",          name: "Lagos",          type: "state", displayLabel: "Lagos" },
  { id: "nasarawa",       name: "Nasarawa",       type: "state", displayLabel: "Nasarawa" },
  { id: "niger",          name: "Niger",          type: "state", displayLabel: "Niger" },
  { id: "ogun",           name: "Ogun",           type: "state", displayLabel: "Ogun" },
  { id: "ondo",           name: "Ondo",           type: "state", displayLabel: "Ondo" },
  { id: "osun",           name: "Osun",           type: "state", displayLabel: "Osun" },
  { id: "oyo",            name: "Oyo",            type: "state", displayLabel: "Oyo" },
  { id: "plateau",        name: "Plateau",        type: "state", displayLabel: "Plateau" },
  { id: "rivers",         name: "Rivers",         type: "state", displayLabel: "Rivers" },
  { id: "sokoto",         name: "Sokoto",         type: "state", displayLabel: "Sokoto" },
  { id: "taraba",         name: "Taraba",         type: "state", displayLabel: "Taraba" },
  { id: "yobe",           name: "Yobe",           type: "state", displayLabel: "Yobe" },
  { id: "zamfara",        name: "Zamfara",        type: "state", displayLabel: "Zamfara" },
];

// ── Ghana regions ─────────────────────────────────────────────────────
const GH_STATES: Region[] = [
  { id: "greater-accra", name: "Greater Accra", type: "state", displayLabel: "Greater Accra" },
  { id: "ashanti",       name: "Ashanti",       type: "state", displayLabel: "Ashanti" },
  { id: "western",       name: "Western",       type: "state", displayLabel: "Western" },
  { id: "northern",      name: "Northern",      type: "state", displayLabel: "Northern" },
  { id: "eastern",       name: "Eastern",       type: "state", displayLabel: "Eastern" },
  { id: "volta",         name: "Volta",         type: "state", displayLabel: "Volta" },
  { id: "brong-ahafo",   name: "Brong-Ahafo",   type: "state", displayLabel: "Brong-Ahafo" },
  { id: "central",       name: "Central",       type: "state", displayLabel: "Central" },
  { id: "upper-east",    name: "Upper East",    type: "state", displayLabel: "Upper East" },
  { id: "upper-west",    name: "Upper West",    type: "state", displayLabel: "Upper West" },
];

// ── Kenya counties ────────────────────────────────────────────────────
const KE_STATES: Region[] = [
  { id: "nairobi",       name: "Nairobi",       type: "state", displayLabel: "Nairobi" },
  { id: "mombasa",       name: "Mombasa",       type: "state", displayLabel: "Mombasa" },
  { id: "kisumu",        name: "Kisumu",        type: "state", displayLabel: "Kisumu" },
  { id: "nakuru",        name: "Nakuru",        type: "state", displayLabel: "Nakuru" },
  { id: "eldoret",       name: "Eldoret",       type: "state", displayLabel: "Eldoret" },
];

// ── South Africa provinces ─────────────────────────────────────────────
const ZA_STATES: Region[] = [
  { id: "gauteng",         name: "Gauteng",         type: "state", displayLabel: "Gauteng" },
  { id: "western-cape",    name: "Western Cape",    type: "state", displayLabel: "Western Cape" },
  { id: "kwazulu-natal",   name: "KwaZulu-Natal",   type: "state", displayLabel: "KwaZulu-Natal" },
  { id: "eastern-cape",    name: "Eastern Cape",    type: "state", displayLabel: "Eastern Cape" },
  { id: "limpopo",         name: "Limpopo",         type: "state", displayLabel: "Limpopo" },
  { id: "mpumalanga",      name: "Mpumalanga",      type: "state", displayLabel: "Mpumalanga" },
  { id: "north-west",      name: "North West",      type: "state", displayLabel: "North West" },
  { id: "free-state",      name: "Free State",      type: "state", displayLabel: "Free State" },
  { id: "northern-cape",   name: "Northern Cape",   type: "state", displayLabel: "Northern Cape" },
];

export const STATES_BY_COUNTRY: Record<string, Region[]> = {
  NG: NG_STATES,
  GH: GH_STATES,
  KE: KE_STATES,
  ZA: ZA_STATES,
};

// ── LGAs per state (Nigeria focus) ───────────────────────────────────
const LGAS_RAW: Region[] = [
  // Lagos
  { id:"ikeja",          name:"Ikeja",            type:"lga",  stateId:"lagos", displayLabel:"Ikeja, Lagos" },
  { id:"yaba",           name:"Yaba",             type:"lga",  stateId:"lagos", displayLabel:"Yaba, Lagos" },
  { id:"lekki",          name:"Lekki",            type:"lga",  stateId:"lagos", displayLabel:"Lekki, Lagos" },
  { id:"victoria-island",name:"Victoria Island",  type:"lga",  stateId:"lagos", displayLabel:"Victoria Island, Lagos" },
  { id:"surulere",       name:"Surulere",         type:"lga",  stateId:"lagos", displayLabel:"Surulere, Lagos" },
  { id:"mushin",         name:"Mushin",           type:"lga",  stateId:"lagos", displayLabel:"Mushin, Lagos" },
  { id:"agege",          name:"Agege",            type:"lga",  stateId:"lagos", displayLabel:"Agege, Lagos" },
  { id:"ikorodu",        name:"Ikorodu",          type:"lga",  stateId:"lagos", displayLabel:"Ikorodu, Lagos" },
  { id:"badagry",        name:"Badagry",          type:"lga",  stateId:"lagos", displayLabel:"Badagry, Lagos" },
  { id:"alimosho",       name:"Alimosho",         type:"lga",  stateId:"lagos", displayLabel:"Alimosho, Lagos" },
  { id:"gbagada",        name:"Gbagada",          type:"lga",  stateId:"lagos", displayLabel:"Gbagada, Lagos" },
  { id:"oshodi",         name:"Oshodi",           type:"lga",  stateId:"lagos", displayLabel:"Oshodi, Lagos" },
  { id:"apapa",          name:"Apapa",            type:"lga",  stateId:"lagos", displayLabel:"Apapa, Lagos" },
  { id:"isale-eko",      name:"Isale Eko",        type:"lga",  stateId:"lagos", displayLabel:"Isale Eko, Lagos" },
  { id:"epe",            name:"Epe",              type:"lga",  stateId:"lagos", displayLabel:"Epe, Lagos" },
  { id:"shomolu",        name:"Shomolu",          type:"lga",  stateId:"lagos", displayLabel:"Shomolu, Lagos" },
  // Abuja FCT
  { id:"abuja-central",  name:"Abuja Central",    type:"lga",  stateId:"abuja-fct", displayLabel:"Abuja Central, FCT" },
  { id:"garki",          name:"Garki",            type:"lga",  stateId:"abuja-fct", displayLabel:"Garki, FCT" },
  { id:"wuse",           name:"Wuse",             type:"lga",  stateId:"abuja-fct", displayLabel:"Wuse, FCT" },
  { id:"maitama",        name:"Maitama",          type:"lga",  stateId:"abuja-fct", displayLabel:"Maitama, FCT" },
  { id:"gwarinpa",       name:"Gwarinpa",         type:"lga",  stateId:"abuja-fct", displayLabel:"Gwarinpa, FCT" },
  { id:"gwagwalada",     name:"Gwagwalada",       type:"lga",  stateId:"abuja-fct", displayLabel:"Gwagwalada, FCT" },
  // Kano
  { id:"kano-municipal", name:"Kano Municipal",   type:"lga",  stateId:"kano", displayLabel:"Kano Municipal, Kano" },
  { id:"nassarawa-kano", name:"Nassarawa",        type:"lga",  stateId:"kano", displayLabel:"Nassarawa, Kano" },
  { id:"fagge",          name:"Fagge",            type:"lga",  stateId:"kano", displayLabel:"Fagge, Kano" },
  { id:"dala",           name:"Dala",             type:"lga",  stateId:"kano", displayLabel:"Dala, Kano" },
  // Rivers
  { id:"port-harcourt",  name:"Port Harcourt",    type:"lga",  stateId:"rivers", displayLabel:"Port Harcourt, Rivers" },
  { id:"obio-akpor",     name:"Obio/Akpor",       type:"lga",  stateId:"rivers", displayLabel:"Obio/Akpor, Rivers" },
  { id:"eleme",          name:"Eleme",            type:"lga",  stateId:"rivers", displayLabel:"Eleme, Rivers" },
  // Oyo
  { id:"ibadan-north",   name:"Ibadan North",     type:"lga",  stateId:"oyo", displayLabel:"Ibadan North, Oyo" },
  { id:"ibadan-south",   name:"Ibadan South-West",type:"lga",  stateId:"oyo", displayLabel:"Ibadan South-West, Oyo" },
  { id:"ogbomosho",      name:"Ogbomosho North",  type:"lga",  stateId:"oyo", displayLabel:"Ogbomosho, Oyo" },
  // Enugu
  { id:"enugu-north",    name:"Enugu North",      type:"lga",  stateId:"enugu", displayLabel:"Enugu North, Enugu" },
  { id:"enugu-south",    name:"Enugu South",      type:"lga",  stateId:"enugu", displayLabel:"Enugu South, Enugu" },
  // Kaduna
  { id:"kaduna-north",   name:"Kaduna North",     type:"lga",  stateId:"kaduna", displayLabel:"Kaduna North, Kaduna" },
  { id:"kaduna-south",   name:"Kaduna South",     type:"lga",  stateId:"kaduna", displayLabel:"Kaduna South, Kaduna" },
  // Ghana
  { id:"accra-central",  name:"Accra Central",    type:"lga",  stateId:"greater-accra", displayLabel:"Accra Central" },
  { id:"tema",           name:"Tema",             type:"lga",  stateId:"greater-accra", displayLabel:"Tema, Accra" },
  { id:"kumasi",         name:"Kumasi",           type:"lga",  stateId:"ashanti", displayLabel:"Kumasi, Ashanti" },
  // Kenya
  { id:"westlands",      name:"Westlands",        type:"lga",  stateId:"nairobi", displayLabel:"Westlands, Nairobi" },
  { id:"kibera",         name:"Kibera",           type:"lga",  stateId:"nairobi", displayLabel:"Kibera, Nairobi" },
  { id:"kasarani",       name:"Kasarani",         type:"lga",  stateId:"nairobi", displayLabel:"Kasarani, Nairobi" },
];

export const LGAS_BY_STATE: Record<string, Region[]> = LGAS_RAW.reduce<Record<string, Region[]>>((acc, r) => {
  if (!r.stateId) return acc;
  if (!acc[r.stateId]) acc[r.stateId] = [];
  acc[r.stateId].push(r);
  return acc;
}, {});

// ── Helpers ───────────────────────────────────────────────────────────

export function getCountry(code: string): Country | undefined {
  return COUNTRIES.find(c => c.code === code);
}

export function getStates(countryCode: string): Region[] {
  return STATES_BY_COUNTRY[countryCode] ?? [];
}

export function getLgas(stateId: string): Region[] {
  return LGAS_BY_STATE[stateId] ?? [];
}

export function getStateName(stateId: string, countryCode?: string): string {
  if (!stateId) return "";
  const allStates = countryCode ? (STATES_BY_COUNTRY[countryCode] ?? []) : Object.values(STATES_BY_COUNTRY).flat();
  return allStates.find(s => s.id === stateId)?.name ?? toTitleCase(stateId);
}

export function getLgaName(lgaId: string): string {
  if (!lgaId) return "";
  return LGAS_RAW.find(l => l.id === lgaId)?.name ?? toTitleCase(lgaId);
}

export function toTitleCase(slug: string): string {
  return slug.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

export function formatLocation(profile: {
  country?: string | null;
  state_id?: string | null;
  lga_id?: string | null;
  lcda_id?: string | null;
}): string {
  const lga   = profile.lga_id   ? getLgaName(profile.lga_id)               : null;
  const state = profile.state_id ? getStateName(profile.state_id, profile.country ?? undefined) : null;
  if (lga && state)  return `${lga} • ${state}`;
  if (state)         return state;
  if (profile.country) return getCountry(profile.country)?.name ?? profile.country;
  return "";
}

export function searchRegions(query: string, countryCode?: string, stateId?: string): Region[] {
  const q = query.toLowerCase().trim();
  if (q.length < 2) return [];

  if (stateId) {
    return getLgas(stateId).filter(r =>
      r.name.toLowerCase().includes(q) || r.displayLabel.toLowerCase().includes(q)
    ).slice(0, 10);
  }

  if (countryCode) {
    return getStates(countryCode).filter(r =>
      r.name.toLowerCase().includes(q)
    ).slice(0, 10);
  }

  return COUNTRIES.filter(c =>
    c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q)
  ).map(c => ({
    id: c.code, name: c.name, type: "state" as const, displayLabel: `${c.flag} ${c.name}`
  })).slice(0, 10);
}
