-- =============================================================================
-- Seed SBFP Cooperatives (2026-10-01)
-- Inserts 54 cooperatives from the SBFP supplier list.
-- Skips any whose name already exists in the table.
-- Safe to run multiple times.
-- =============================================================================

-- Ensure a unique index on name exists so ON CONFLICT works
-- (creates it only if it does not already exist).
CREATE UNIQUE INDEX IF NOT EXISTS cooperatives_name_unique_idx
  ON public.cooperatives (name);

INSERT INTO public.cooperatives (name, short_name, is_active)
VALUES
  ('Nueva Segovia Consortium of Cooperatives',                              'NSCC',              TRUE),
  ('Bantog Samahang Nayon Multi-Purpose Cooperative',                       'BSNMPC',            TRUE),
  ('Elyu Farmers Multipurpose Cooperative',                                 'Elyu Farmers',      TRUE),
  ('Alaminos City Carabao Raiser Agriculture Cooperative',                  'ACCRACO',           TRUE),
  ('San Agustin Dairy Cooperative',                                         'SADACO',            TRUE),
  ('St. Vincent Parish Multipurpose Cooperative',                           'St. Vincent',       TRUE),
  ('Catalanacan Multi-purpose Cooperative',                                 'Catalanacan',       TRUE),
  ('Eastern Primary Multi-Purpose Cooperative',                             'EPMPC',             TRUE),
  ('Licaong Agriculture Cooperative',                                       'LAC',               TRUE),
  ('Pulong Buli Primary Multi-Purpose Cooperative',                         'PBPMPC',            TRUE),
  ('Simula ng Panibagong Bukas Multi-Purpose Cooperative',                  'SIPBU',             TRUE),
  ('Bataan Farmers Agri-Coop',                                              'BFAC',              TRUE),
  ('Cornerstone Training and Learning Center, Corp.',                       'Cornerstone',       TRUE),
  ('Lubao Farmers and Fisherfolks Agriculture Cooperative',                 'Lubao Farmers',     TRUE),
  ('Makabagong Agricultura ng Dinalupihan Marketing Cooperative',           'MADMC',             TRUE),
  ('Tapulao Multi-Purpose Cooperative',                                     'TMPC',              TRUE),
  ('Aces Philproducers Corporation',                                        'Aces Philprod',     TRUE),
  ('General Trias Dairy Raisers Multi-Purpose Cooperative',                 'GTDRMPC',           TRUE),
  ('Llano Farmers Multi-Purpose Cooperative',                               'LFMPC',             TRUE),
  ('The Rosario Livestock and Agriculture Farming Cooperative',             'TRLAFCo',           TRUE),
  ('Mindoro Dairy Cooperative',                                             'MIDACO',            TRUE),
  ('Provincial Government of Albay - Albay Dairy Plant',                   'Albay Dairy',       TRUE),
  ('Camsur Multipurpose Cooperative',                                       'Camsur MPC',        TRUE),
  ('Gubat St. Anthony Cooperative - Triple 2 Agri-Industrial Corporation', 'Gubat St. Anthony', TRUE),
  ('Barotac Nuevo Development Cooperative',                                 'BNDC',              TRUE),
  ('Calinog Farmers Multipurpose Cooperative',                              'Calinog',           TRUE),
  ('Guimaras Employees Multipurpose Cooperative',                           'Guimaras EMPC',     TRUE),
  ('Hamtic Multipurpose Cooperative',                                       'HMPC',              TRUE),
  ('Pandan Multipurpose Cooperative',                                       'PMPC',              TRUE),
  ('AGCARA Agrarian Reform Cooperative',                                    'AGCARA',            TRUE),
  ('San Julio Agrarian Reform Beneficiaries Cooperative',                   'SJARBC',            TRUE),
  ('Quenscup Agrarian Reform Beneficiaries & Marginal Farmers Cooperative', 'Quenscup',         TRUE),
  ('Compostela Market Vendors Multi-Purpose Cooperative',                   'COMAVEMCO',         TRUE),
  ('Bohol Dairy Cooperative',                                               'BODACO',            TRUE),
  ('Lamac Multi-Purpose Cooperative',                                       'Lamac MPC',         TRUE),
  ('Baybay Dairy Cooperative',                                              'Baybay Dairy',      TRUE),
  ('Antipolo Primary Multi-Purpose Agricultural Cooperative',               'APMPAC',            TRUE),
  ('Baclay Multi-Purpose Cooperative',                                      'BMPC',              TRUE),
  ('Ipil Community Multi-Purpose Cooperative',                              'ICMC',              TRUE),
  ('Siari Valley Agrarian Reform Beneficiaries Multipurpose Cooperative',   'SVARBEMCO',         TRUE),
  ('Don Carlos Dairy Buffalo Cooperative',                                  'MUSBUDA',           TRUE),
  ('La Elena Corporation',                                                  'La Elena',          TRUE),
  ('Oro Integrated Cooperative',                                            'OIC',               TRUE),
  ('Paglaum Multi-Cooperative',                                             'Paglaum',           TRUE),
  ('Don Enrique Lopez Kalaparan Agriculture Cooperative',                   'DELKACO',           TRUE),
  ('Inyam Pintuan Asbang Multi-Purpose Cooperative',                        'IPAMCO',            TRUE),
  ('Linoan Farmers Integrated Cooperative',                                 'LIFICO',            TRUE),
  ('United CARP Beneficiaries Association, Inc. Multipurpose Cooperative',  'UNICARBAI',         TRUE),
  ('D&L Dairy Farm',                                                        'D&L Dairy',         TRUE),
  ('Highland Agricultural Credit Cooperative',                              'HACC',              TRUE),
  ('Lamluma Diversified Farmers Agriculture Cooperative',                   'LADIFA',            TRUE),
  ('Pangi Multipurpose Cooperative',                                        'PAMULCO',           TRUE),
  ('Sta. Catalina Multi-Purpose Cooperative',                               'Sta. Catalina',     TRUE),
  ('Tupi Integrated Agricultural Cooperative',                              'TIAC',              TRUE)
ON CONFLICT (name) DO NOTHING;

