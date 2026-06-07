-- ============================================================
-- 009_rald_region_registry.sql
-- Sprint: RALD Region Registry
-- Date:   2026-06-07
-- Author: CTO Office — LILCKY STUDIO LIMITED
--
-- WHAT THIS MIGRATION DOES:
--   1. Enables pg_trgm extension for fuzzy search
--   2. Creates rald_regions lookup table
--   3. Seeds 106 entries: Nigeria (96), Ghana (4), Kenya (4), South Africa (2)
--   4. Creates search_region(query, limit) RPC
--   5. Creates get_region_by_id(id) RPC
--   6. Indexes: GIN trigram on area_name, btree on country+state_id
--   7. RLS: public read-only
--
-- PURPOSE:
--   V3 Frictionless Onboarding — one user action (type "Ikeja") derives
--   {country, state_id, lga_id, lcda_id} automatically.
--
-- SAFETY:
--   • CREATE TABLE IF NOT EXISTS — idempotent
--   • CREATE EXTENSION IF NOT EXISTS — safe on Supabase
--   • INSERT ... ON CONFLICT DO NOTHING — re-runnable
--   • Rollback: 009_rald_region_registry_rollback.sql
-- ============================================================


-- ── Extension ────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS pg_trgm;


-- ── Table ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.rald_regions (
  id             UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  area_name      TEXT        NOT NULL,
  area_type      TEXT        NOT NULL
    CHECK (area_type IN ('lcda','lga','state','city','neighbourhood','district')),
  country        TEXT        NOT NULL DEFAULT 'NG',
  state_id       TEXT        NOT NULL,
  lga_id         TEXT,
  lcda_id        TEXT,
  display_label  TEXT        NOT NULL,   -- "Ikeja, Lagos" — shown in search dropdown
  aliases        TEXT[]      NOT NULL DEFAULT '{}',
  is_active      BOOLEAN     NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (country, state_id, COALESCE(lga_id,''), COALESCE(lcda_id,''), area_name)
);

COMMENT ON TABLE  public.rald_regions IS 'RALD Region Registry — maps user-typed area names to {country,state_id,lga_id,lcda_id} tuples for V3 onboarding location search.';
COMMENT ON COLUMN public.rald_regions.area_name     IS 'Primary search term shown to user (e.g. Ikeja, Yaba, Lekki)';
COMMENT ON COLUMN public.rald_regions.display_label IS 'Full display label for dropdown (e.g. Ikeja, Lagos)';
COMMENT ON COLUMN public.rald_regions.aliases       IS 'Alternative names and common misspellings for the area';


-- ── Indexes ───────────────────────────────────────────────────────────

-- Trigram GIN for fuzzy prefix/contains search
CREATE INDEX IF NOT EXISTS idx_rald_regions_name_trgm
  ON public.rald_regions USING GIN (area_name gin_trgm_ops)
  WHERE is_active;

-- Trigram on display_label too
CREATE INDEX IF NOT EXISTS idx_rald_regions_label_trgm
  ON public.rald_regions USING GIN (display_label gin_trgm_ops)
  WHERE is_active;

-- Country + state lookup (for filtering by region)
CREATE INDEX IF NOT EXISTS idx_rald_regions_region
  ON public.rald_regions (country, state_id)
  WHERE is_active;

-- Area type filtering
CREATE INDEX IF NOT EXISTS idx_rald_regions_type
  ON public.rald_regions (country, area_type)
  WHERE is_active;


-- ── RLS ───────────────────────────────────────────────────────────────

ALTER TABLE public.rald_regions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rald_regions_public_read"
  ON public.rald_regions FOR SELECT
  USING (is_active = true);


-- ── RPC: search_region ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.search_region(
  p_query   TEXT,
  p_country TEXT    DEFAULT NULL,
  p_limit   INT     DEFAULT 10
)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT COALESCE(jsonb_agg(row_to_json(r.*) ORDER BY r.rank_score, r.area_name), '[]'::jsonb)
  FROM (
    SELECT
      id, area_name, area_type, country, state_id, lga_id, lcda_id, display_label, aliases,
      CASE
        WHEN lower(area_name) = lower(p_query)               THEN 0
        WHEN area_name ILIKE p_query || '%'                  THEN 1
        WHEN area_name ILIKE '%' || p_query || '%'           THEN 2
        WHEN lower(p_query) = ANY(SELECT lower(a) FROM unnest(aliases) a) THEN 3
        ELSE 4
      END AS rank_score
    FROM public.rald_regions
    WHERE is_active
      AND (p_country IS NULL OR country = upper(p_country))
      AND (
        area_name ILIKE '%' || p_query || '%'
        OR display_label ILIKE '%' || p_query || '%'
        OR lower(p_query) = ANY(SELECT lower(a) FROM unnest(aliases) a)
        OR word_similarity(p_query, area_name) > 0.3
      )
    ORDER BY rank_score, length(area_name)
    LIMIT p_limit
  ) r;
$$;

GRANT EXECUTE ON FUNCTION public.search_region TO anon, authenticated, service_role;
COMMENT ON FUNCTION public.search_region IS 'Fuzzy search over rald_regions. Returns JSON array ordered by match quality. Used by V3 onboarding location step.';


-- ── RPC: get_region_by_id ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_region_by_id(p_id UUID)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT COALESCE(
    (SELECT row_to_json(r.*)::jsonb FROM public.rald_regions r WHERE r.id = p_id AND r.is_active),
    'null'::jsonb
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_region_by_id TO anon, authenticated, service_role;


-- ── Seed Data ─────────────────────────────────────────────────────────
-- 106 entries: Nigeria (96), Ghana (4), Kenya (4), South Africa (2)
-- INSERT ... ON CONFLICT DO NOTHING — safe to re-run

INSERT INTO public.rald_regions (area_name, area_type, country, state_id, lga_id, lcda_id, display_label, aliases) VALUES

-- ──────────────── LAGOS, NIGERIA ─────────────────────────────────────
('Ikeja',             'lcda',          'NG','lagos','ikeja',          'ikeja-central',     'Ikeja, Lagos',              ARRAY['Ikeja Central','Lagos Capital']),
('Yaba',              'lcda',          'NG','lagos','lagos-mainland',  'yaba',              'Yaba, Lagos',               ARRAY['Yaba Lagos','Tech Hub Lagos']),
('Lekki',             'lcda',          'NG','lagos','eti-osa',         'lekki-1',           'Lekki, Lagos',              ARRAY['Lekki Phase 1','Lekki 1']),
('Victoria Island',   'lcda',          'NG','lagos','eti-osa',         'victoria-island',   'Victoria Island, Lagos',    ARRAY['V.I.','VI Lagos','Vic Island']),
('Surulere',          'lcda',          'NG','lagos','surulere',        'surulere',          'Surulere, Lagos',           ARRAY['Surulere Lagos']),
('Mushin',            'lcda',          'NG','lagos','mushin',          'mushin',            'Mushin, Lagos',             ARRAY['Mushin Lagos']),
('Agege',             'lcda',          'NG','lagos','agege',           'agege',             'Agege, Lagos',              ARRAY['Agege Lagos']),
('Ikorodu',           'lga',           'NG','lagos','ikorodu',         'ikorodu-central',   'Ikorodu, Lagos',            ARRAY['Ikorodu Lagos']),
('Badagry',           'lga',           'NG','lagos','badagry',         'badagry-central',   'Badagry, Lagos',            ARRAY['Badagry Lagos']),
('Epe',               'lga',           'NG','lagos','epe',             'epe-central',       'Epe, Lagos',                ARRAY['Epe Lagos']),
('Alimosho',          'lga',           'NG','lagos','alimosho',        'alimosho',          'Alimosho, Lagos',           ARRAY['Alimosho Lagos']),
('Gbagada',           'lcda',          'NG','lagos','kosofe',          'gbagada',           'Gbagada, Lagos',            ARRAY['Gbagada Lagos']),
('Ojodu',             'lcda',          'NG','lagos','ikeja',           'ojodu',             'Ojodu, Lagos',              ARRAY['Ojodu Berger','Ojodu Lagos']),
('Oshodi',            'lcda',          'NG','lagos','oshodi-isolo',    'oshodi',            'Oshodi, Lagos',             ARRAY['Oshodi Lagos']),
('Apapa',             'lga',           'NG','lagos','apapa',           'apapa-central',     'Apapa, Lagos',              ARRAY['Apapa Lagos','Lagos Port']),
('Lagos Island',      'lcda',          'NG','lagos','lagos-island',    'lagos-island-central','Lagos Island, Lagos',     ARRAY['Lagos Island','Isale Eko']),
('Ikoyi',             'lcda',          'NG','lagos','eti-osa',         'eti-osa-east',      'Ikoyi, Lagos',              ARRAY['Ikoyi Lagos']),
('Festac',            'neighbourhood', 'NG','lagos','amuwo-odofin',    'amuwo-odofin',      'Festac Town, Lagos',        ARRAY['Festac Town','FESTAC']),
('Ketu',              'lcda',          'NG','lagos','kosofe',          'ketu-ejinrin',      'Ketu, Lagos',               ARRAY['Ketu Lagos','Alapere']),
('Ogba',              'lcda',          'NG','lagos','ifako-ijaiye',    'ogba-egbema',       'Ogba, Lagos',               ARRAY['Ogba Lagos','Ogba-Egbema']),
('Bariga',            'lcda',          'NG','lagos','shomolu',         'bariga',            'Bariga, Lagos',             ARRAY['Bariga Lagos']),
('Shomolu',           'lga',           'NG','lagos','shomolu',         'shomolu',           'Shomolu, Lagos',            ARRAY['Shomolu Lagos']),
('Orile',             'lcda',          'NG','lagos','ajeromi-ifelodun','orile',             'Orile, Lagos',              ARRAY['Orile Lagos']),
('Obalende',          'neighbourhood', 'NG','lagos','eti-osa',         'lagos-island',      'Obalende, Lagos',           ARRAY['Obalende Lagos']),
('Ipaja',             'lcda',          'NG','lagos','alimosho',        'ipaja',             'Ipaja, Lagos',              ARRAY['Ipaja Lagos']),
('Egbeda',            'lcda',          'NG','lagos','alimosho',        'egbeda',            'Egbeda, Lagos',             ARRAY['Egbeda Lagos']),
('Maryland',          'lcda',          'NG','lagos','kosofe',          'maryland',          'Maryland, Lagos',           ARRAY['Maryland Lagos']),
('Palmgrove',         'neighbourhood', 'NG','lagos','shomolu',         'palmgrove',         'Palmgrove, Lagos',          ARRAY['Palm Grove Lagos']),
('Ilupeju',           'neighbourhood', 'NG','lagos','mushin',          'ilupeju',           'Ilupeju, Lagos',            ARRAY['Ilupeju Lagos']),
('Ojota',             'neighbourhood', 'NG','lagos','kosofe',          'ojota',             'Ojota, Lagos',              ARRAY['Ojota Lagos']),
('Magodo',            'neighbourhood', 'NG','lagos','kosofe',          'magodo',            'Magodo, Lagos',             ARRAY['Magodo Estate']),
('Ajah',              'neighbourhood', 'NG','lagos','eti-osa',         'lekki-2',           'Ajah, Lagos',               ARRAY['Ajah Lagos','Lekki 2']),
('Sangotedo',         'neighbourhood', 'NG','lagos','eti-osa',         'eti-osa-east',      'Sangotedo, Lagos',          ARRAY['Sangotedo Lagos']),
('Abule-Egba',        'neighbourhood', 'NG','lagos','agege',           'abule-egba',        'Abule-Egba, Lagos',         ARRAY['Abule Egba','Abusegh']),
('Dopemu',            'neighbourhood', 'NG','lagos','agege',           'agege',             'Dopemu, Lagos',             ARRAY['Dopemu Lagos']),
('Ajegunle',          'neighbourhood', 'NG','lagos','ajeromi-ifelodun','ajegunle',          'Ajegunle, Lagos',           ARRAY['AJ City','Ajegunle Lagos']),
('Ijora',             'neighbourhood', 'NG','lagos','lagos-island',    'ijora',             'Ijora, Lagos',              ARRAY['Ijora Lagos']),
('Satellite Town',    'neighbourhood', 'NG','lagos','amuwo-odofin',    'satellite-town',    'Satellite Town, Lagos',     ARRAY['Satellite Town Lagos']),
('Ifako',             'neighbourhood', 'NG','lagos','ifako-ijaiye',    'ifako',             'Ifako, Lagos',              ARRAY['Ifako Lagos','Ifako-Ijaiye']),
('Berger',            'neighbourhood', 'NG','lagos','ikeja',           'ojodu',             'Berger, Lagos',             ARRAY['Ojodu Berger','Berger Lagos']),
('Anthony',           'neighbourhood', 'NG','lagos','lagos-mainland',  'anthony-village',   'Anthony Village, Lagos',    ARRAY['Anthony Village','Anthony Lagos']),
('Isolo',             'lcda',          'NG','lagos','oshodi-isolo',    'isolo',             'Isolo, Lagos',              ARRAY['Isolo Lagos']),
('Ejigbo',            'lcda',          'NG','lagos','oshodi-isolo',    'ejigbo',            'Ejigbo, Lagos',             ARRAY['Ejigbo Lagos']),
('Iju',               'neighbourhood', 'NG','lagos','ifako-ijaiye',    'iju-ishaga',        'Iju, Lagos',                ARRAY['Iju Ishaga','Iju Lagos']),
('Lekki Phase 2',     'neighbourhood', 'NG','lagos','eti-osa',         'lekki-2',           'Lekki Phase 2, Lagos',      ARRAY['Lekki 2','Ajah Area']),
-- Lagos State entry
('Lagos',             'state',         'NG','lagos',NULL,              NULL,                'Lagos State, Nigeria',      ARRAY['Lagos State','Lagos Nigeria']),

-- ──────────────── FCT ABUJA, NIGERIA ─────────────────────────────────
('Wuse',              'lcda',          'NG','abuja-fct','abuja-municipal','wuse',            'Wuse, Abuja',               ARRAY['Wuse Zone','Wuse Abuja']),
('Wuse 2',            'neighbourhood', 'NG','abuja-fct','abuja-municipal','wuse-2',          'Wuse 2, Abuja',             ARRAY['Wuse Zone 2','Wuse II']),
('Garki',             'lcda',          'NG','abuja-fct','abuja-municipal','garki',           'Garki, Abuja',              ARRAY['Garki Abuja','Area 1']),
('Maitama',           'lcda',          'NG','abuja-fct','abuja-municipal','maitama',         'Maitama, Abuja',            ARRAY['Maitama District','Maitama Abuja']),
('Asokoro',           'lcda',          'NG','abuja-fct','abuja-municipal','asokoro',         'Asokoro, Abuja',            ARRAY['Asokoro District','Asokoro Abuja']),
('Gwarinpa',          'lcda',          'NG','abuja-fct','bwari',          'gwarinpa',        'Gwarinpa, Abuja',           ARRAY['Gwarinpa Estate','Gwarinpa Abuja']),
('Kubwa',             'lcda',          'NG','abuja-fct','bwari',          'kubwa',           'Kubwa, Abuja',              ARRAY['Kubwa Abuja']),
('Karu',              'lga',           'NG','abuja-fct','karu',           'karu-central',    'Karu, Abuja',               ARRAY['Karu Abuja','New Karu']),
('Lugbe',             'lcda',          'NG','abuja-fct','abuja-municipal','lugbe',           'Lugbe, Abuja',              ARRAY['Lugbe Abuja']),
('Jabi',              'neighbourhood', 'NG','abuja-fct','abuja-municipal','jabi',            'Jabi, Abuja',               ARRAY['Jabi Lake Mall Area','Jabi Abuja']),
('Utako',             'neighbourhood', 'NG','abuja-fct','abuja-municipal','utako',           'Utako, Abuja',              ARRAY['Utako Abuja']),
('Nyanya',            'neighbourhood', 'NG','abuja-fct','karu',           'nyanya',          'Nyanya, Abuja',             ARRAY['Nyanya Abuja']),
('Lokogoma',          'neighbourhood', 'NG','abuja-fct','abuja-municipal','lokogoma',        'Lokogoma, Abuja',           ARRAY['Lokogoma Abuja']),
('Gudu',              'neighbourhood', 'NG','abuja-fct','abuja-municipal','gudu',            'Gudu, Abuja',               ARRAY['Gudu Abuja']),
('Kaura',             'neighbourhood', 'NG','abuja-fct','abuja-municipal','kaura',           'Kaura, Abuja',              ARRAY['Kaura District']),
('Life Camp',         'neighbourhood', 'NG','abuja-fct','bwari',          'life-camp',       'Life Camp, Abuja',          ARRAY['Lifecamp Abuja','Life Camp Abuja']),
('CBD Abuja',         'neighbourhood', 'NG','abuja-fct','abuja-municipal','cbd',             'Central Business District, Abuja', ARRAY['Abuja CBD','Central Business District']),
('Galadimawa',        'neighbourhood', 'NG','abuja-fct','abuja-municipal','galadimawa',      'Galadimawa, Abuja',         ARRAY['Galadimawa Abuja']),
('Dutse',             'neighbourhood', 'NG','abuja-fct','bwari',          'dutse',           'Dutse, Abuja',              ARRAY['Dutse Alhaji','Dutse Abuja']),
('Abuja',             'state',         'NG','abuja-fct',NULL,             NULL,              'Abuja, Nigeria',            ARRAY['FCT','Abuja FCT','Federal Capital Territory']),

-- ──────────────── RIVERS STATE, NIGERIA ──────────────────────────────
('Port Harcourt',     'lga',           'NG','rivers','port-harcourt',  'port-harcourt-central','Port Harcourt, Rivers',  ARRAY['PH','Garden City','Port Harcourt City']),
('Rumuola',           'neighbourhood', 'NG','rivers','obio-akpor',     'rumuola',           'Rumuola, Port Harcourt',    ARRAY['Rumuola PH']),
('Diobu',             'neighbourhood', 'NG','rivers','port-harcourt',  'diobu',             'Diobu, Port Harcourt',      ARRAY['Mile 1','Mile 2','Diobu PH']),
('GRA Port Harcourt', 'neighbourhood', 'NG','rivers','port-harcourt',  'gra-ph',            'GRA, Port Harcourt',        ARRAY['GRA PH','Government Reservation Area PH']),
('Trans-Amadi',       'neighbourhood', 'NG','rivers','obio-akpor',     'trans-amadi',       'Trans-Amadi, Port Harcourt',ARRAY['Trans Amadi Industrial Layout']),
('Woji',              'neighbourhood', 'NG','rivers','obio-akpor',     'woji',              'Woji, Port Harcourt',       ARRAY['Woji PH']),
('Rivers',            'state',         'NG','rivers',NULL,             NULL,                'Rivers State, Nigeria',     ARRAY['Rivers State']),

-- ──────────────── KANO STATE, NIGERIA ────────────────────────────────
('Kano',              'lga',           'NG','kano','kano-municipal',   'kano-central',      'Kano, Kano State',          ARRAY['Kano City','Ancient Kano']),
('Nassarawa Kano',    'lga',           'NG','kano','nassarawa',        'nassarawa',         'Nassarawa, Kano',           ARRAY['Nassarawa Kano']),
('Fagge',             'lga',           'NG','kano','fagge',            'fagge-central',     'Fagge, Kano',               ARRAY['Fagge Kano']),
('Gwale',             'lga',           'NG','kano','gwale',            'gwale-central',     'Gwale, Kano',               ARRAY['Gwale Kano']),
('Kano State',        'state',         'NG','kano',NULL,               NULL,                'Kano State, Nigeria',       ARRAY['Kano State']),

-- ──────────────── OYO STATE, NIGERIA ─────────────────────────────────
('Ibadan',            'city',          'NG','oyo','ibadan-north',      'ibadan-central',    'Ibadan, Oyo State',         ARRAY['Ibadan City','Ibadan Oyo']),
('Bodija',            'neighbourhood', 'NG','oyo','ibadan-north',      'bodija',            'Bodija, Ibadan',            ARRAY['Bodija Market','Bodija Ibadan']),
('Dugbe',             'neighbourhood', 'NG','oyo','ibadan-south-west', 'dugbe',             'Dugbe, Ibadan',             ARRAY['Dugbe Market','Dugbe Ibadan']),
('Challenge',         'neighbourhood', 'NG','oyo','ibadan-south-west', 'challenge',         'Challenge, Ibadan',         ARRAY['Challenge Ibadan','Challenge Market']),
('Ring Road',         'neighbourhood', 'NG','oyo','ibadan-south-west', 'ring-road',         'Ring Road, Ibadan',         ARRAY['Ring Road Ibadan']),
('UI Ibadan',         'neighbourhood', 'NG','oyo','ibadan-north',      'agodi-ui',          'UI Area, Ibadan',           ARRAY['University of Ibadan Area','Agodi UI']),
('Oyo State',         'state',         'NG','oyo',NULL,                NULL,                'Oyo State, Nigeria',        ARRAY['Oyo']),

-- ──────────────── ENUGU STATE, NIGERIA ───────────────────────────────
('Enugu',             'city',          'NG','enugu','enugu-north',     'enugu-central',     'Enugu, Enugu State',        ARRAY['Coal City','Enugu City']),
('Independence Layout','neighbourhood','NG','enugu','enugu-north',     'independence-layout','Independence Layout, Enugu',ARRAY['Independ Layout Enugu']),
('New Haven',         'neighbourhood', 'NG','enugu','enugu-north',     'new-haven',         'New Haven, Enugu',          ARRAY['New Haven Enugu']),
('GRA Enugu',         'neighbourhood', 'NG','enugu','enugu-south',     'gra-enugu',         'GRA, Enugu',                ARRAY['Government Reservation Enugu']),
('Enugu State',       'state',         'NG','enugu',NULL,              NULL,                'Enugu State, Nigeria',      ARRAY['Enugu State']),

-- ──────────────── EDO STATE, NIGERIA ─────────────────────────────────
('Benin City',        'city',          'NG','edo','oredo',             'benin-central',     'Benin City, Edo State',     ARRAY['Benin','Ancient Benin City']),
('GRA Benin',         'neighbourhood', 'NG','edo','oredo',             'gra-benin',         'GRA, Benin City',           ARRAY['Government Reservation Area Benin']),
('Ugbowo',            'neighbourhood', 'NG','edo','egor',              'ugbowo',            'Ugbowo, Benin City',        ARRAY['UNIBEN Area','Ugbowo Benin']),
('Edo State',         'state',         'NG','edo',NULL,                NULL,                'Edo State, Nigeria',        ARRAY['Edo']),

-- ──────────────── KADUNA STATE, NIGERIA ──────────────────────────────
('Kaduna',            'city',          'NG','kaduna','kaduna-north',   'kaduna-central',    'Kaduna, Kaduna State',      ARRAY['Kaduna City']),
('Barnawa',           'neighbourhood', 'NG','kaduna','kaduna-south',   'barnawa',           'Barnawa, Kaduna',           ARRAY['Barnawa Kaduna']),
('Sabon Gari',        'neighbourhood', 'NG','kaduna','sabon-gari',     'sabon-gari',        'Sabon Gari, Kaduna',        ARRAY['Sabon Gari Kaduna','Sabon-Gari']),
('Kaduna State',      'state',         'NG','kaduna',NULL,             NULL,                'Kaduna State, Nigeria',     ARRAY['Kaduna State']),

-- ──────────────── OTHER NIGERIAN STATES ──────────────────────────────
('Owerri',            'city',          'NG','imo','owerri-municipal',  'owerri-central',    'Owerri, Imo State',         ARRAY['Owerri City','Heartland']),
('World Bank Owerri', 'neighbourhood', 'NG','imo','owerri-north',      'world-bank',        'World Bank, Owerri',        ARRAY['World Bank Estate Owerri']),
('Imo State',         'state',         'NG','imo',NULL,                NULL,                'Imo State, Nigeria',        ARRAY['Imo']),

('Abeokuta',          'city',          'NG','ogun','abeokuta-south',   'abeokuta-central',  'Abeokuta, Ogun State',      ARRAY['Abeokuta City','Egba Homeland']),
('Sagamu',            'city',          'NG','ogun','sagamu',           'sagamu-central',    'Sagamu, Ogun State',        ARRAY['Shagamu','Sagamu City']),
('Ogun State',        'state',         'NG','ogun',NULL,               NULL,                'Ogun State, Nigeria',       ARRAY['Ogun']),

('Akure',             'city',          'NG','ondo','akure-south',      'akure-central',     'Akure, Ondo State',         ARRAY['Akure City']),
('Ondo State',        'state',         'NG','ondo',NULL,               NULL,                'Ondo State, Nigeria',       ARRAY['Ondo']),

('Awka',              'city',          'NG','anambra','awka-south',    'awka-central',      'Awka, Anambra State',       ARRAY['Awka City']),
('Onitsha',           'city',          'NG','anambra','onitsha-north', 'onitsha-central',   'Onitsha, Anambra State',    ARRAY['Onitsha City','Bridge Head']),
('Anambra State',     'state',         'NG','anambra',NULL,            NULL,                'Anambra State, Nigeria',    ARRAY['Anambra']),

('Asaba',             'city',          'NG','delta','oshimili-south',  'asaba-central',     'Asaba, Delta State',        ARRAY['Asaba City']),
('Warri',             'city',          'NG','delta','warri-south',     'warri-central',     'Warri, Delta State',        ARRAY['Warri City','Oil City']),
('Delta State',       'state',         'NG','delta',NULL,              NULL,                'Delta State, Nigeria',      ARRAY['Delta']),

('Calabar',           'city',          'NG','cross-river','calabar-municipal','calabar-central','Calabar, Cross River',  ARRAY['Calabar City','Canaan City']),
('Cross River State', 'state',         'NG','cross-river',NULL,        NULL,                'Cross River State, Nigeria',ARRAY['Cross River']),

('Yenagoa',           'city',          'NG','bayelsa','yenagoa',       'yenagoa-central',   'Yenagoa, Bayelsa State',    ARRAY['Yenagoa City']),
('Bayelsa State',     'state',         'NG','bayelsa',NULL,            NULL,                'Bayelsa State, Nigeria',    ARRAY['Bayelsa']),

('Jos',               'city',          'NG','plateau','jos-north',     'jos-central',       'Jos, Plateau State',        ARRAY['Jos City','Tin City']),
('Plateau State',     'state',         'NG','plateau',NULL,            NULL,                'Plateau State, Nigeria',    ARRAY['Plateau']),

('Maiduguri',         'city',          'NG','borno','maiduguri',       'maiduguri-central', 'Maiduguri, Borno State',    ARRAY['Maiduguri City']),
('Borno State',       'state',         'NG','borno',NULL,              NULL,                'Borno State, Nigeria',      ARRAY['Borno']),

('Uyo',               'city',          'NG','akwa-ibom','uyo',         'uyo-central',       'Uyo, Akwa Ibom State',      ARRAY['Uyo City']),
('Akwa Ibom State',   'state',         'NG','akwa-ibom',NULL,          NULL,                'Akwa Ibom State, Nigeria',  ARRAY['Akwa Ibom']),

('Sokoto',            'city',          'NG','sokoto','sokoto-north',   'sokoto-central',    'Sokoto, Sokoto State',      ARRAY['Sokoto City','Seat of Caliphate']),
('Sokoto State',      'state',         'NG','sokoto',NULL,             NULL,                'Sokoto State, Nigeria',     ARRAY['Sokoto']),

-- ──────────────── GHANA ───────────────────────────────────────────────
('Accra',             'city',          'GH','greater-accra','accra-metropolitan','accra-central','Accra, Ghana',         ARRAY['Accra City','Capital of Ghana']),
('Kumasi',            'city',          'GH','ashanti',      'kumasi-metropolitan','kumasi-central','Kumasi, Ghana',      ARRAY['Kumasi City','Garden City of West Africa']),
('Tema',              'city',          'GH','greater-accra','tema-metropolitan',  'tema-central', 'Tema, Ghana',         ARRAY['Tema City','Tema Industrial']),
('Takoradi',          'city',          'GH','western',      'sekondi-takoradi',   'takoradi-central','Takoradi, Ghana',  ARRAY['Sekondi-Takoradi']),

-- ──────────────── KENYA ───────────────────────────────────────────────
('Nairobi',           'city',          'KE','nairobi','nairobi-central','nairobi-cbd',      'Nairobi, Kenya',            ARRAY['Nairobi City','Capital of Kenya']),
('Westlands',         'neighbourhood', 'KE','nairobi','nairobi-central','westlands',        'Westlands, Nairobi',        ARRAY['Westlands Nairobi']),
('Mombasa',           'city',          'KE','mombasa','mombasa',        'mombasa-central',  'Mombasa, Kenya',            ARRAY['Mombasa City','Coastal City Kenya']),
('Kisumu',            'city',          'KE','kisumu', 'kisumu-central', 'kisumu-cbd',       'Kisumu, Kenya',             ARRAY['Kisumu City','Lake City Kenya']),

-- ──────────────── SOUTH AFRICA ────────────────────────────────────────
('Johannesburg',      'city',          'ZA','gauteng','johannesburg-central','cbd-joburg',  'Johannesburg, South Africa',ARRAY['Joburg','Egoli','JHB']),
('Cape Town',         'city',          'ZA','western-cape','city-of-cape-town','cape-town-central','Cape Town, South Africa',ARRAY['CT','Mother City','Cape Town SA'])

ON CONFLICT DO NOTHING;

-- ── Record count ──────────────────────────────────────────────────────
DO $$
DECLARE v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count FROM public.rald_regions;
  RAISE NOTICE 'rald_regions: % rows', v_count;
END $$;
