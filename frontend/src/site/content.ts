/** All customer-site copy for the fictional NESTR. agency. */
export const BRAND = {
  name: 'NESTR',
  phone: '+91 80 4567 8900',
  whatsapp: '+91 98000 12345',
  email: 'hello@nestr.example',
  address: ['4th Floor, Prestige Meridian', 'MG Road, Bengaluru 560001'],
};

export const NAV_LINKS = [
  { label: 'Home', to: '/' },
  { label: 'Buy', to: '/buy' },
  { label: 'Rent', to: '/rent' },
  { label: 'Invest', to: '/invest' },
  { label: 'Properties', to: '/#projects', mega: true },
  { label: 'Locations', to: '/#areas-we-serve' },
  { label: 'Blog', to: '/#blogs' },
  { label: 'More', to: '/#faq', dropdown: true },
];

export const MEGA_ITEMS = [
  { title: 'Buy a Home', text: 'Verified apartments & villas', to: '/buy', icon: 'home' },
  { title: 'Rent a Home', text: 'Furnished & family rentals', to: '/rent', icon: 'key' },
  { title: 'Investment Properties', text: 'Pre-leased & high-yield picks', to: '/invest', icon: 'chart' },
  { title: 'New Projects', text: 'Launches from trusted builders', to: '/buy?type=apartment', icon: 'crane' },
  { title: 'Commercial Spaces', text: 'Offices, retail & warehouses', to: '/invest?type=commercial', icon: 'building' },
  { title: 'Talk to an Agent', text: 'Get an instant reply, 24×7', to: '#chat', icon: 'agent' },
] as const;

export const MORE_ITEMS = [
  { label: 'How it works', to: '/#process' },
  { label: 'Reviews', to: '/#reviews' },
  { label: 'FAQ', to: '/#faq' },
  { label: 'Contact', to: '/#cta' },
  { label: 'Admin login', to: '/admin' },
];

export const HERO = {
  title: ['Find the Right Property —', 'We’ll Match You in Minutes'],
  card: { title: 'Tell us what you need — get a reply instantly', cta: 'Start Chat' },
  benefits: ['Verified Listings', 'Instant AI Response', 'Expert Brokers'],
  rating: '4.9',
};

export const SERVICES = [
  { title: 'Buy Residential', text: 'Verified apartments, villas and independent homes, shortlisted to your budget and commute.', img: '/images/services/buy.jpg', to: '/buy', icon: 'home' },
  { title: 'Rent Apartments', text: 'Furnished and family rentals with transparent deposits and fast move-ins.', img: '/images/services/rent.jpg', to: '/rent', icon: 'key' },
  { title: 'Investment Properties', text: 'Pre-leased and high-yield assets with clear rental income and resale data.', img: '/images/services/invest.jpg', to: '/invest', icon: 'chart' },
  { title: 'Commercial Spaces', text: 'Offices, retail frontage and warehouses for growing businesses.', img: '/images/services/commercial.jpg', to: '/invest?type=commercial', icon: 'building' },
  { title: 'New Launch Projects', text: 'Early-bird inventory in RERA-registered launches from trusted developers.', img: '/images/services/new-launch.jpg', to: '/buy?type=apartment', icon: 'crane' },
  { title: 'Plots & Land', text: 'Approved residential plots in gated layouts along growth corridors.', img: '/images/services/plots.jpg', to: '/buy?type=plot', icon: 'land' },
] as const;

export const ABOUT = {
  text: 'At NESTR, we help families, professionals and investors find the right home, rental or investment across India’s fastest-growing cities. Every inquiry is answered instantly, every requirement is understood, and every lead is handed to the right broker — so you never wait for a callback.',
  cardTitle: ['Trusted Local', 'Property Experts'],
  cardText: 'Verified listings, honest advice and brokers who know every street of the cities we serve.',
};

export const WHY = {
  title: ['Why Home Seekers', 'Choose NESTR'],
  text: 'Instant AI replies, verified listings and experienced brokers make us the property partner you can truly rely on.',
  tallText: 'Trusted by families, tenants and investors across India',
  partners: ['Skyline Group', 'Prestige Arc', 'BlueRidge', 'Urbanest', 'Meridian', 'Lodhaa'],
  rating: { value: 4.9, label: 'Average Rating', count: '2.5K+' },
  callback: 'Without a single callback for',
  words: ['missed calls', 'slow replies', 'lost leads', 'waiting'],
  coverage: { title: 'Instant replies', text: 'Every website, WhatsApp and form inquiry gets a personalised answer in under two minutes — day or night.' },
  stat: { value: 1200, suffix: '+', label: 'Properties Listed', text: 'Across 6 cities — every listing verified by a NESTR broker before it goes live' },
};

export const PROCESS = {
  title: 'A Simple, Instant Property Process',
  text: 'Our four-step process takes you from first message to the right broker — with an instant, personalised reply at every step.',
  steps: [
    { title: 'Tell Us Your Requirement', text: 'Chat on our website, fill a quick form or message us on WhatsApp — tell us what you want to buy, rent or invest in.', img: '/images/process/1.jpg', icon: 'chat' },
    { title: 'Instant AI Qualification', text: 'Our assistant understands your budget, location, timeline and must-haves, and asks only what is still missing.', img: '/images/process/2.jpg', icon: 'spark' },
    { title: 'Personalized Reply & Matches', text: 'Within seconds you get a personalised reply with verified listings that match your requirement.', img: '/images/process/3.jpg', icon: 'clipboard' },
    { title: 'Broker Follow-up', text: 'A local expert broker picks up your brief and follows up — within 30 minutes if it is urgent.', img: '/images/process/4.jpg', icon: 'users' },
  ],
};

export const FEATURED = {
  title: ['Featured Properties', 'Our Clients Love'],
  slugs: ['palm-grove-villa-whitefield', 'skyline-residences-3bhk-baner', 'harbour-view-2bhk-rent-powai', 'the-courtyard-4bhk-villa-golf-course-road'],
};

export const REVIEWS = [
  { text: '“Told the chatbot I was relocating to Pune in three weeks. Had three matching flats in my inbox in a minute and a broker call the same evening.”', name: 'Ananya Rao', place: 'Rented in Hinjewadi, Pune', img: '/images/people/r1.jpg' },
  { text: '“We were first-time buyers and scared of the process. NESTR shortlisted villas in our budget and our broker handled every document.”', name: 'Rohit & Meera Nair', place: 'Bought in Whitefield, Bengaluru', img: '/images/people/r3.jpg' },
  { text: '“Clear rental yield numbers and a pre-leased office that actually matched the brief. The fastest investment I have closed.”', name: 'Kunal Bhatia', place: 'Invested in Gurugram', img: '/images/people/r5.jpg' },
  { text: '“I messaged on WhatsApp at midnight and got a real answer, not a template. The broker called the next morning with two options.”', name: 'Fatima Sheikh', place: 'Rented in Powai, Mumbai', img: '/images/people/r2.jpg' },
  { text: '“Honest advice on locality, resale and maintenance costs. They talked me out of one flat and into a much better one.”', name: 'Vikram Desai', place: 'Bought in Baner, Pune', img: '/images/people/r4.jpg' },
  { text: '“We needed retail frontage for our café within 45 days. NESTR found the space, negotiated the lease and we opened on time.”', name: 'Priya Menon', place: 'Leased in Koramangala', img: '/images/people/r6.jpg' },
];

export const AREAS = {
  title: 'Cities We Proudly Serve',
  text: 'Verified homes, rentals and investment properties across India’s fastest-growing cities — with brokers who live and work in every one of them.',
  // Real coordinates, projected in Areas.tsx; `place` = which side of the pin the label sits on.
  cities: [
    { name: 'Gurugram', lon: 77.03, lat: 28.46, place: 'top' },
    { name: 'Mumbai', lon: 72.88, lat: 19.08, place: 'left' },
    { name: 'Pune', lon: 73.86, lat: 18.52, place: 'bottom' },
    { name: 'Hyderabad', lon: 78.49, lat: 17.39, place: 'right' },
    { name: 'Bengaluru', lon: 77.59, lat: 12.97, place: 'left' },
    { name: 'Chennai', lon: 80.27, lat: 13.08, place: 'right' },
  ],
};

export const BLOG = {
  title: 'Your Property Knowledge Hub',
  text: 'Practical guides on buying, renting and investing to help you make confident property decisions.',
  posts: [
    { cat: 'Guide', title: 'First-Time Home Buyer’s Guide for 2026', img: '/images/blog/buying-guide.jpg', author: 'Sneha Kapoor', avatar: '/images/people/author1.jpg', date: 'Sep 12, 2026' },
    { cat: 'Checklist', title: 'The Renter’s Checklist Before You Sign a Lease', img: '/images/blog/renting-checklist.jpg', author: 'Arjun Mehra', avatar: '/images/people/author2.jpg', date: 'Aug 28, 2026' },
    { cat: 'Investing', title: 'Rental Yield vs Appreciation: Calculating Real ROI', img: '/images/blog/investment-roi.jpg', author: 'Sneha Kapoor', avatar: '/images/people/author1.jpg', date: 'Aug 09, 2026' },
  ],
};

export const FAQ = {
  title: ['Answers To Common', 'Property Questions'],
  items: [
    { q: 'How does the instant reply work?', a: 'When you message us on the website, WhatsApp or our form, our AI assistant reads your requirement, understands your budget, location and timeline, and replies within seconds with matching verified listings. It only asks for details that are still missing.' },
    { q: 'Will a real person follow up?', a: 'Yes. Every inquiry is handed to a local broker with a short brief of what you need. Urgent requirements — like a relocation this month — get a call within 30 minutes during working hours.' },
    { q: 'Do you charge buyers or tenants a fee?', a: 'Searching, shortlisting and site visits are free. Brokerage, if any, is agreed in writing before you commit to a property — there are no hidden charges.' },
    { q: 'Are the listings verified?', a: 'Every listing is checked by a NESTR broker for ownership documents, approvals and current availability before it goes live.' },
    { q: 'Which cities do you cover?', a: 'We currently serve Mumbai, Pune, Bengaluru, Hyderabad, Gurugram and Chennai, including their major suburbs and growth corridors.' },
    { q: 'Is my information kept private?', a: 'Your details are used only to answer your inquiry and are shared only with the broker assigned to you. We never sell your data.' },
  ],
};

export const CTA = {
  eyebrow: 'Get started',
  title: ['Your Next Home Starts', 'With One Message'],
  text: 'Tell us what you are looking for and get a personalised reply with matching properties in seconds — plus a call from an expert broker.',
};

export const FOOTER = {
  quick: [
    { label: 'Home', to: '/' },
    { label: 'Buy', to: '/buy' },
    { label: 'Rent', to: '/rent' },
    { label: 'Invest', to: '/invest' },
  ],
  services: [
    { label: 'Residential Homes', to: '/buy?type=apartment' },
    { label: 'Rental Apartments', to: '/rent' },
    { label: 'Investment Properties', to: '/invest' },
    { label: 'Commercial Spaces', to: '/invest?type=commercial' },
  ],
};
