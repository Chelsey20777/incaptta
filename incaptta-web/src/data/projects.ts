export const projects = [
  {
    id: 1,
    client: 'University of Zimbabwe',
    title: 'UZ Agro-Industrial Park Broiler Project',
    description: '60,000 broiler capacity initiative. Full fowlrun construction plus automated feeding, nipple drinking systems, and climate control.',
    tags: ['Fowlrun Construction', 'Automation', 'Large Scale'],
    location: 'Harare, Zimbabwe',
    year: '2021',
    image: null
  },
  {
    id: 2,
    client: 'SABLE Chickens',
    title: '40,000 Bird Contract Grower Site',
    description: 'Complete fowlrun construction and equipment installation for a 40,000 broiler site capacity at Rainham, Harare.',
    tags: ['Contract Grower', 'Fowlrun', 'Rainham Harare'],
    location: 'Rainham, Harare',
    year: '2022',
    image: null
  },
  {
    id: 3,
    client: 'Irvines Zimbabwe',
    title: 'Irvines Grower Programme',
    description: 'Electronic feeder systems, water systems, and PVC curtain installations at multiple Irvines contract grower sites.',
    tags: ['Feeders', 'Drinkers', 'PVC Curtains'],
    location: 'Zimbabwe',
    year: '2023',
    image: null
  },
  {
    id: 4,
    client: 'Zimbabwe Command Agriculture',
    title: 'Command Agriculture Scheme',
    description: 'Agri-structure construction and equipment supply as part of the national Command Agriculture programme.',
    tags: ['Government', 'Agri-Structures'],
    location: 'Zimbabwe',
    year: '2022',
    image: null
  }
]

export type Project = typeof projects[number]
