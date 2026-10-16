export const testimonials = [
  {
    id: 1,
    quote: 'Working with Incaptta has been a fantastic experience. They are extremely knowledgeable and professional, and they have helped us achieve great success through the construction of our fowlruns.',
    author: 'Contract Grower — SABLE Chickens',
    location: 'Rainham, Harare',
    capacity: '40,000 Bird Site'
  },
  {
    id: 2,
    quote: 'Incaptta has installed electronic feeders, water systems and PVC curtains at our farm. Their knowledge of the industry and their products is top-notch, and their customer service is excellent.',
    author: 'Farm Manager',
    location: 'UZ Agro-Industrial Park',
    capacity: '60,000 Broiler Capacity'
  },
  {
    id: 3,
    quote: 'I have been very pleased with my experience working with the Incaptta team. They have provided quality equipment efficiently that has helped us improve our poultry operations.',
    author: 'Contract Grower — Surrey Chickens',
    location: 'Zimbabwe',
    capacity: '12,000 Bird Site'
  }
]

export type Testimonial = typeof testimonials[number]
