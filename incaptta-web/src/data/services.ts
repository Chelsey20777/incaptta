export const services = [
  {
    id: 1,
    icon: 'warehouse',
    title: 'Agri-Structures & Fowlruns',
    description: 'Custom-designed fowlruns built for automated poultry hardware, optimized for maximum bird comfort and operational efficiency.',
    tag: 'Core Service'
  },
  {
    id: 2,
    icon: 'droplets',
    title: 'Nipple Drinker Systems',
    description: 'High-end nipple drinking system installations for broiler and layer operations. Installed for UZ, World Vision, SOS, and Irvines Zimbabwe.',
    tag: 'Installation'
  },
  {
    id: 3,
    icon: 'zap',
    title: 'Pan Feeder Systems (Electric)',
    description: 'Automated pan feeding systems that reduce labour costs and ensure consistent feed distribution across all bird sizes.',
    tag: 'Installation'
  },
  {
    id: 4,
    icon: 'wind',
    title: 'PVC Climate Control Curtains',
    description: "Precision PVC curtains for temperature regulation inside fowlruns — critical for bird performance in Zimbabwe's climate.",
    tag: 'Climate'
  },
  {
    id: 5,
    icon: 'layers',
    title: 'Layer Cage Systems',
    description: 'Turnkey layer cage installation for commercial egg production operations. Designed for maximum density and easy egg collection.',
    tag: 'Equipment'
  },
  {
    id: 6,
    icon: 'wrench',
    title: 'Fumigation & Maintenance',
    description: 'Post-cycle fowlrun fumigation services and ongoing maintenance to keep your operation biosecure and productive.',
    tag: 'Maintenance'
  }
]

export type Service = typeof services[number]
