export const STRUCTURE_SIZES = [
  '126x14m', '126x12m', '100x12m', '100x10m', '80x10m',
  '60x10m', '50x10m', '40x10m', '25x10m', '20x10m', '10x10m'
] as const

export type StructureSize = typeof STRUCTURE_SIZES[number]
export type TemplateType = 'WATER_SYSTEM' | 'CURTAINS'

export interface BomRow {
  name: string
  quantities: string[] // parallel to STRUCTURE_SIZES
}

export const BOM_TEMPLATES: Record<TemplateType, BomRow[]> = {
  WATER_SYSTEM: [
    { name: 'U-Nails',                quantities: ['10', '8',  '5',  '4',  '4',  '3',  '3',  '2',  '2',  '2',  '2']  },
    { name: 'Verandah Bolts',          quantities: ['10', '8',  '5',  '4',  '4',  '3',  '3',  '2',  '2',  '2',  '2']  },
    { name: 'PVC Pipes 25mm',          quantities: ['120','95', '80', '60', '50', '40', '35', '25', '15', '15', '10'] },
    { name: 'Chord Adjustors',         quantities: ['440','345','280','210','170','130','110','230','60', '50', '25'] },
    { name: 'Sibling Pulleys',         quantities: ['440','345','280','210','170','130','110','230','60', '50', '25'] },
    { name: 'Crosby Clamps',           quantities: ['440','345','280','210','170','130','110','230','60', '50', '25'] },
    { name: 'Breathers',               quantities: ['20', '16', '16', '12', '12', '6',  '6',  '6',  '6',  '6',  '6']  },
    { name: 'Regulators',              quantities: ['10', '8',  '8',  '6',  '6',  '3',  '3',  '3',  '3',  '3',  '3']  },
    { name: 'Nylon Rope',              quantities: ['930','750','600','440','350','270','220','180','110','90', '45'] },
    { name: 'End Caps',                quantities: ['20', '16', '16', '12', '12', '6',  '6',  '6',  '6',  '6',  '6']  },
    { name: 'Nipples',                 quantities: ['2424','1940','1540','1154','924','693','577','462','290','232','115'] },
    { name: 'Pipe Clippers',           quantities: ['840','672','535','400','320','240','200','160','100','80', '40'] },
    { name: 'Wire Rope',               quantities: ['700','550','450','350','300','200','170','150','80', '70', '35'] },
    { name: 'Water Winches',           quantities: ['10', '8',  '8',  '6',  '6',  '3',  '3',  '3',  '3',  '3',  '3']  },
    { name: 'Anti-roost Wire',         quantities: ['650','510','400','300','240','180','150','120','75', '60', '30'] },
    { name: 'Anti-roost Springs',      quantities: ['20', '16', '16', '12', '12', '6',  '6',  '6',  '6',  '6',  '6']  },
    { name: 'Main Pulley',             quantities: ['10', '8',  '8',  '6',  '6',  '3',  '3',  '3',  '3',  '3',  '3']  },
    { name: 'End Pulleys',             quantities: ['10', '8',  '8',  '6',  '6',  '3',  '3',  '3',  '3',  '3',  '3']  },
    { name: 'Flex Pipe',               quantities: ['20', '16', '16', '12', '12', '6',  '6',  '6',  '6',  '6',  '6']  },
    { name: 'Coach Screws',            quantities: ['10', '8',  '5',  '4',  '4',  '3',  '3',  '2',  '2',  '2',  '2']  },
    { name: '25mm Round Bars',         quantities: ['105','84', '67', '50', '40', '30', '25', '20', '13', '10', '5']  },
    { name: 'R6 Suspenders',           quantities: ['25', '20', '15', '12', '12', '8',  '6',  '6',  '5',  '5',  '5']  },
    { name: '40x40 SHS',               quantities: ['6',  '6',  '3',  '3',  '3',  '2',  '2',  '2',  '2',  '2',  '2']  },
    { name: '40x40 Angle',             quantities: ['6',  '5',  '4',  '3',  '3',  '2',  '2',  '2',  '1',  '1',  '1']  },
    { name: '30x30 Angle',             quantities: ['6',  '5',  '4',  '4',  '4',  '2',  '2',  '2',  '1',  '1',  '1']  },
    { name: 'Water Meter',             quantities: ['1',  '1',  '1',  '1',  '1',  '1',  '1',  '1',  '1',  '1',  '1']  },
    { name: 'Dosatron',                quantities: ['1',  '1',  '1',  '1',  '1',  '1',  '1',  '1',  '1',  '1',  '1']  },
    { name: 'Welding Rods',            quantities: ['15', '15', '10', '10', '10', '5',  '5',  '2',  '2',  '2',  '2']  },
    { name: 'Cutting Discs',           quantities: ['5',  '5',  '5',  '4',  '4',  '3',  '2',  '2',  '2',  '2',  '2']  },
  ],
  CURTAINS: [
    { name: 'Welding Rods',            quantities: ['5',  '5',  '5',  '5',  '5',  '5',  '5',  '5',  '5',  '5',  '5']  },
    { name: 'Cutting Discs',           quantities: ['5',  '5',  '5',  '5',  '5',  '5',  '5',  '5',  '5',  '5',  '5']  },
    { name: 'Concrete Nails',          quantities: ['15', '15', '10', '10', '8',  '6',  '5',  '4',  '3',  '3',  '2']  },
    { name: 'Braided Polyester',       quantities: ['15', '15', '12', '12', '11', '10', '8',  '8',  '5',  '4',  '3']  },
    { name: 'Tek Screws',              quantities: ['15', '15', '10', '10', '8',  '6',  '5',  '4',  '3',  '3',  '2']  },
    { name: '20mm SHS',                quantities: ['42', '42', '34', '34', '27', '20', '17', '14', '9',  '7',  '4']  },
    { name: 'Curtain Winches',         quantities: ['2',  '2',  '2',  '2',  '2',  '2',  '2',  '2',  '2',  '2',  '2']  },
    { name: 'Main Pulley',             quantities: ['2',  '2',  '2',  '2',  '2',  '2',  '2',  '2',  '2',  '2',  '2']  },
    { name: 'Yellow Pulley',           quantities: ['90', '90', '70', '70', '60', '45', '40', '35', '25', '20', '15'] },
    { name: 'Wire Rope',               quantities: ['300','300','250','250','200','180','150','120','100','100','50'] },
    { name: 'Crosby Clamps',           quantities: ['90', '90', '70', '70', '60', '45', '40', '35', '25', '20', '15'] },
  ],
}