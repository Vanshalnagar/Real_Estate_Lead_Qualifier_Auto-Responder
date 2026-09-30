/** The agency's brokers (seeded into MongoDB by `npm run seed`). Used for lead auto-assignment. */
export const SEED_BROKERS = [
  { name: 'Aarav Mehta', email: 'aarav.mehta@nestr.example', phone: '+919800000001', areas: ['Mumbai', 'Powai', 'Bandra', 'Bhiwandi'], specialties: ['buyer', 'renter'] },
  { name: 'Diya Kulkarni', email: 'diya.kulkarni@nestr.example', phone: '+919800000002', areas: ['Pune', 'Baner', 'Hinjewadi', 'Kharadi'], specialties: ['buyer', 'renter', 'investor'] },
  { name: 'Rohan Iyer', email: 'rohan.iyer@nestr.example', phone: '+919800000003', areas: ['Bengaluru', 'Bangalore', 'Whitefield', 'Koramangala', 'Sarjapur', 'Chennai'], specialties: ['buyer', 'investor'] },
  { name: 'Sana Qureshi', email: 'sana.qureshi@nestr.example', phone: '+919800000004', areas: ['Hyderabad', 'Gachibowli', 'Jubilee Hills', 'Shamshabad'], specialties: ['renter', 'investor'] },
  { name: 'Kabir Malhotra', email: 'kabir.malhotra@nestr.example', phone: '+919800000005', areas: ['Gurugram', 'Gurgaon', 'Delhi', 'Noida', 'NCR'], specialties: ['investor', 'buyer'] },
] as const;
