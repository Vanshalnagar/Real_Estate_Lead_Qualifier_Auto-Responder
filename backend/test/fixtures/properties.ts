/**
 * TEST FIXTURES ONLY — sample listings used by the matching unit tests. They are never written
 * to MongoDB or shown on the website; live listings come from Apify (src/services/apify.ts).
 */
export interface SeedProperty {
  slug: string;
  title: string;
  listingType: 'sale' | 'rent';
  investment: boolean;
  type: 'apartment' | 'villa' | 'plot' | 'commercial' | 'other';
  price: number;
  priceLabel: string;
  city: string;
  locality: string;
  bedrooms: number | null;
  bathrooms: number | null;
  areaSqft: number;
  furnishing: string | null;
  amenities: string[];
  expectedYield: number | null;
  description: string;
  images: string[];
  imageAlt: string;
  listedAt: string;
}

const img = (n: string) => [`/images/properties/${n}-a.jpg`, `/images/properties/${n}-b.jpg`];

export const SEED_PROPERTIES: SeedProperty[] = [
  {
    slug: 'skyline-residences-3bhk-baner',
    title: 'Skyline Residences 3BHK',
    listingType: 'sale', investment: false, type: 'apartment',
    price: 14500000, priceLabel: '₹1.45 Cr', city: 'Pune', locality: 'Baner',
    bedrooms: 3, bathrooms: 3, areaSqft: 1480, furnishing: 'semi-furnished',
    amenities: ['Clubhouse', 'Swimming pool', 'Covered parking', 'Gym'], expectedYield: null,
    description: 'A bright corner 3BHK on the 14th floor with hill views, a large deck and two covered parking slots, five minutes from the Baner–Balewadi high street.',
    images: img('p01'), imageAlt: 'Modern apartment tower at dusk', listedAt: '2026-09-02',
  },
  {
    slug: 'palm-grove-villa-whitefield',
    title: 'Palm Grove Villa',
    listingType: 'sale', investment: false, type: 'villa',
    price: 32000000, priceLabel: '₹3.2 Cr', city: 'Bengaluru', locality: 'Whitefield',
    bedrooms: 4, bathrooms: 5, areaSqft: 3400, furnishing: 'unfurnished',
    amenities: ['Private garden', 'Gated community', 'Solar', 'EV charging'], expectedYield: null,
    description: 'A 4-bedroom independent villa in a gated community of 60 homes, with a private garden, double-height living room and EV charging.',
    images: img('p02'), imageAlt: 'Contemporary villa with pool', listedAt: '2026-08-21',
  },
  {
    slug: 'harbour-view-2bhk-rent-powai',
    title: 'Harbour View 2BHK',
    listingType: 'rent', investment: false, type: 'apartment',
    price: 68000, priceLabel: '₹68,000 / month', city: 'Mumbai', locality: 'Powai',
    bedrooms: 2, bathrooms: 2, areaSqft: 950, furnishing: 'fully furnished',
    amenities: ['Lake view', 'Power backup', 'Gym', '24x7 security'], expectedYield: null,
    description: 'Fully furnished 2BHK overlooking Powai lake, walking distance to Hiranandani Gardens. Deposit of three months, available from next week.',
    images: img('p03'), imageAlt: 'Furnished living room with city view', listedAt: '2026-09-10',
  },
  {
    slug: 'greenwood-1bhk-rent-hinjewadi',
    title: 'Greenwood 1BHK',
    listingType: 'rent', investment: false, type: 'apartment',
    price: 18000, priceLabel: '₹18,000 / month', city: 'Pune', locality: 'Hinjewadi',
    bedrooms: 1, bathrooms: 1, areaSqft: 620, furnishing: 'semi-furnished',
    amenities: ['Near IT park', 'Covered parking', 'Power backup'], expectedYield: null,
    description: 'A compact semi-furnished 1BHK two minutes from Hinjewadi Phase 1 — ideal for IT professionals relocating to Pune.',
    images: img('p04'), imageAlt: 'Compact modern apartment interior', listedAt: '2026-09-15',
  },
  {
    slug: 'cyber-hub-office-suite-gurugram',
    title: 'Cyber Hub Office Suite',
    listingType: 'sale', investment: true, type: 'commercial',
    price: 42000000, priceLabel: '₹4.2 Cr', city: 'Gurugram', locality: 'DLF Cyber City',
    bedrooms: null, bathrooms: 2, areaSqft: 2600, furnishing: 'fitted office',
    amenities: ['Pre-leased', 'Metro access', 'Grade A building'], expectedYield: 7.8,
    description: 'A pre-leased Grade A office suite with a 9-year lease to a multinational tenant. Current rental yield of about 7.8% per year.',
    images: img('p05'), imageAlt: 'Glass office building', listedAt: '2026-07-30',
  },
  {
    slug: 'sea-breeze-3bhk-rent-bandra',
    title: 'Sea Breeze 3BHK',
    listingType: 'rent', investment: false, type: 'apartment',
    price: 185000, priceLabel: '₹1,85,000 / month', city: 'Mumbai', locality: 'Bandra West',
    bedrooms: 3, bathrooms: 3, areaSqft: 1650, furnishing: 'fully furnished',
    amenities: ['Sea view', 'Concierge', 'Two parking slots'], expectedYield: null,
    description: 'A sea-facing 3BHK on Carter Road with designer interiors, a concierge service and two parking slots.',
    images: img('p06'), imageAlt: 'Luxury living room with large windows', listedAt: '2026-09-05',
  },
  {
    slug: 'lakeside-plot-shamshabad',
    title: 'Lakeside Residential Plot',
    listingType: 'sale', investment: true, type: 'plot',
    price: 6500000, priceLabel: '₹65 L', city: 'Hyderabad', locality: 'Shamshabad',
    bedrooms: null, bathrooms: null, areaSqft: 2400, furnishing: null,
    amenities: ['HMDA approved', 'Gated layout', 'Near airport'], expectedYield: null,
    description: 'An HMDA-approved 267 sq. yd plot in a gated layout near the airport growth corridor, with clear title and road access.',
    images: img('p07'), imageAlt: 'Open land plot with trees', listedAt: '2026-08-12',
  },
  {
    slug: 'cedar-heights-2bhk-gachibowli',
    title: 'Cedar Heights 2BHK',
    listingType: 'sale', investment: true, type: 'apartment',
    price: 9200000, priceLabel: '₹92 L', city: 'Hyderabad', locality: 'Gachibowli',
    bedrooms: 2, bathrooms: 2, areaSqft: 1210, furnishing: 'semi-furnished',
    amenities: ['Rental demand', 'Clubhouse', 'Near Financial District'], expectedYield: 3.9,
    description: 'A 2BHK next to the Financial District with strong rental demand from IT tenants; similar units rent for about ₹30,000 a month.',
    images: img('p08'), imageAlt: 'Residential towers with landscaping', listedAt: '2026-09-18',
  },
  {
    slug: 'the-courtyard-4bhk-villa-golf-course-road',
    title: 'The Courtyard 4BHK Villa',
    listingType: 'sale', investment: false, type: 'villa',
    price: 78000000, priceLabel: '₹7.8 Cr', city: 'Gurugram', locality: 'Golf Course Road',
    bedrooms: 4, bathrooms: 5, areaSqft: 5200, furnishing: 'semi-furnished',
    amenities: ['Private pool', 'Home automation', 'Staff quarters'], expectedYield: null,
    description: 'A courtyard villa with a private pool, home automation and staff quarters on Golf Course Road.',
    images: img('p09'), imageAlt: 'Luxury villa with pool at night', listedAt: '2026-06-28',
  },
  {
    slug: 'metro-retail-shop-koramangala',
    title: 'Metro Retail Shop',
    listingType: 'rent', investment: false, type: 'commercial',
    price: 145000, priceLabel: '₹1,45,000 / month', city: 'Bengaluru', locality: 'Koramangala',
    bedrooms: null, bathrooms: 1, areaSqft: 1100, furnishing: 'bare shell',
    amenities: ['High street frontage', 'Parking', 'Signage rights'], expectedYield: null,
    description: 'Ground-floor high-street retail with 28 ft of frontage on 80 Feet Road, suitable for a café, showroom or clinic.',
    images: img('p10'), imageAlt: 'Modern retail storefront', listedAt: '2026-09-01',
  },
  {
    slug: 'orchid-studio-rent-electronic-city',
    title: 'Orchid Studio Apartment',
    listingType: 'rent', investment: false, type: 'apartment',
    price: 14000, priceLabel: '₹14,000 / month', city: 'Bengaluru', locality: 'Electronic City',
    bedrooms: 1, bathrooms: 1, areaSqft: 480, furnishing: 'fully furnished',
    amenities: ['Wi-Fi', 'Housekeeping', 'Near metro'], expectedYield: null,
    description: 'A fully furnished studio with Wi-Fi and housekeeping included, near the Electronic City metro station.',
    images: img('p11'), imageAlt: 'Cosy studio apartment', listedAt: '2026-09-20',
  },
  {
    slug: 'riverfront-3bhk-kharadi',
    title: 'Riverfront 3BHK',
    listingType: 'sale', investment: true, type: 'apartment',
    price: 11800000, priceLabel: '₹1.18 Cr', city: 'Pune', locality: 'Kharadi',
    bedrooms: 3, bathrooms: 3, areaSqft: 1390, furnishing: 'unfurnished',
    amenities: ['Near EON IT park', 'River view', 'Clubhouse'], expectedYield: 3.6,
    description: 'A new-launch 3BHK near EON IT Park with river views, handed over in 2027, with good resale and rental prospects.',
    images: img('p12'), imageAlt: 'New residential building with balconies', listedAt: '2026-08-05',
  },
  {
    slug: 'marina-2bhk-omr-chennai',
    title: 'Marina Heights 2BHK',
    listingType: 'sale', investment: false, type: 'apartment',
    price: 7800000, priceLabel: '₹78 L', city: 'Chennai', locality: 'OMR, Sholinganallur',
    bedrooms: 2, bathrooms: 2, areaSqft: 1080, furnishing: 'semi-furnished',
    amenities: ['Swimming pool', 'Kids play area', 'Near IT corridor'], expectedYield: null,
    description: 'A ready-to-move 2BHK on the OMR IT corridor with a pool, children’s play area and quick access to the ECR.',
    images: img('p13'), imageAlt: 'Apartment complex with pool', listedAt: '2026-07-19',
  },
  {
    slug: 'warehouse-bhiwandi-logistics',
    title: 'Bhiwandi Logistics Warehouse',
    listingType: 'sale', investment: true, type: 'commercial',
    price: 95000000, priceLabel: '₹9.5 Cr', city: 'Mumbai', locality: 'Bhiwandi',
    bedrooms: null, bathrooms: 2, areaSqft: 24000, furnishing: null,
    amenities: ['Pre-leased', 'Truck docks', '12 m clear height'], expectedYield: 8.4,
    description: 'A pre-leased Grade A logistics warehouse with 12 m clear height and 6 truck docks, leased to a national 3PL operator.',
    images: img('p14'), imageAlt: 'Large warehouse exterior', listedAt: '2026-06-10',
  },
  {
    slug: 'banyan-4bhk-rent-jubilee-hills',
    title: 'Banyan House 4BHK',
    listingType: 'rent', investment: false, type: 'villa',
    price: 225000, priceLabel: '₹2,25,000 / month', city: 'Hyderabad', locality: 'Jubilee Hills',
    bedrooms: 4, bathrooms: 4, areaSqft: 4200, furnishing: 'semi-furnished',
    amenities: ['Private garden', 'Staff room', 'Three parking slots'], expectedYield: null,
    description: 'An independent 4BHK house with a mature garden, a staff room and three parking slots in quiet Jubilee Hills.',
    images: img('p15'), imageAlt: 'Independent house with garden', listedAt: '2026-09-12',
  },
  {
    slug: 'sunrise-plots-sarjapur',
    title: 'Sunrise Villa Plots',
    listingType: 'sale', investment: true, type: 'plot',
    price: 8800000, priceLabel: '₹88 L', city: 'Bengaluru', locality: 'Sarjapur Road',
    bedrooms: null, bathrooms: null, areaSqft: 1500, furnishing: null,
    amenities: ['BMRDA approved', 'Clubhouse', 'Gated layout'], expectedYield: null,
    description: 'BMRDA-approved villa plots in a gated layout with a clubhouse, in Sarjapur’s fast-appreciating growth corridor.',
    images: img('p16'), imageAlt: 'Landscaped plotted development', listedAt: '2026-08-28',
  },
];

export const SEED_BROKERS = [
  { name: 'Aarav Mehta', email: 'aarav.mehta@nestr.example', phone: '+919800000001', areas: ['Mumbai', 'Powai', 'Bandra', 'Bhiwandi'], specialties: ['buyer', 'renter'] },
  { name: 'Diya Kulkarni', email: 'diya.kulkarni@nestr.example', phone: '+919800000002', areas: ['Pune', 'Baner', 'Hinjewadi', 'Kharadi'], specialties: ['buyer', 'renter', 'investor'] },
  { name: 'Rohan Iyer', email: 'rohan.iyer@nestr.example', phone: '+919800000003', areas: ['Bengaluru', 'Bangalore', 'Whitefield', 'Koramangala', 'Sarjapur', 'Chennai'], specialties: ['buyer', 'investor'] },
  { name: 'Sana Qureshi', email: 'sana.qureshi@nestr.example', phone: '+919800000004', areas: ['Hyderabad', 'Gachibowli', 'Jubilee Hills', 'Shamshabad'], specialties: ['renter', 'investor'] },
  { name: 'Kabir Malhotra', email: 'kabir.malhotra@nestr.example', phone: '+919800000005', areas: ['Gurugram', 'Gurgaon', 'Delhi', 'Noida', 'NCR'], specialties: ['investor', 'buyer'] },
] as const;
