import type { AgricRates, TemplateItem, StructureSize } from '../types'

export const DEFAULT_RATES: AgricRates = {
  brickUnitCost: 0.10,
  cementUnitCost: 10.00,
  includeLabour: true,
  includeTransport: true,
}

export const INVENTORY_CATEGORIES = [
  'Structural Steel',
  'Roofing & Cladding',
  'Concrete & Masonry',
  'Hardware & Fasteners',
  'Labour & Services',
]

export const PRESET_SIZES: StructureSize[] = [
  { label: '126x14m', length: 126, width: 14 },
  { label: '126x12m', length: 126, width: 12 },
  { label: '100x12m', length: 100, width: 12 },
  { label: '100x10m', length: 100, width: 10 },
  { label: '80x10m',  length: 80,  width: 10 },
  { label: '60x10m',  length: 60,  width: 10 },
  { label: '50x10m',  length: 50,  width: 10 },
  { label: '40x10m',  length: 40,  width: 10 },
  { label: '30x10m',  length: 30,  width: 10 },
  { label: '25x10m',  length: 25,  width: 10 },
  { label: '20x10m',  length: 20,  width: 10 },
  { label: '10x10m',  length: 10,  width: 10 },
]

export const DEFAULT_TEMPLATE_ITEMS: TemplateItem[] = [
  { id: 'bricks', description: 'Common bricks (115mm thick wall)', unit: 'BRICKS', category: 'material', multiplier: 55, variable: 'wallArea' },
  { id: 'defbar', description: 'Deformed bar 14mm', unit: 'pc', category: 'material', multiplier: 7, variable: 'scale', baseUnitPrice: 6.00 },
  { id: 'rsand',  description: 'River sand / quarry dust', unit: 'm³', category: 'material', multiplier: 85, variable: 'scale', baseUnitPrice: 20.00 },
  { id: 'psand',  description: 'Pit sand', unit: 'm³', category: 'material', multiplier: 30, variable: 'scale', baseUnitPrice: 20.00 },
  { id: 'cement', description: 'Cement (Preferably Superset)', unit: 'BAGS', category: 'material', multiplier: 400, variable: 'scale' },
  { id: 'dpc230', description: 'Damp proof course 230mm wall', unit: 'ROLLS', category: 'material', multiplier: 2, variable: 'scale', baseUnitPrice: 2.50 },
  { id: 'qstones',description: 'Quarry stones', unit: 'm³', category: 'material', multiplier: 80, variable: 'scale', baseUnitPrice: 18.00 },
  { id: 'blackpp',description: 'Black polythene paper', unit: 'm²', category: 'material', multiplier: 1, variable: 'area', baseUnitPrice: 0.39 },
  { id: 'poison', description: 'Termite poison', unit: 'litres', category: 'material', multiplier: 80, variable: 'scale', baseUnitPrice: 0.50 },
  { id: 'bf230',  description: 'Brickforce 230x20', unit: 'units', category: 'material', multiplier: 11, variable: 'scale', baseUnitPrice: 2.50 },
  { id: 'dpc115', description: 'DPC 115x20', unit: 'rolls', category: 'material', multiplier: 14, variable: 'scale', baseUnitPrice: 2.50 },
  { id: 'gravel', description: 'Gravel (estimated on site)', unit: 'm³', category: 'material', multiplier: 18, variable: 'scale', baseUnitPrice: 18.00 },
  { id: 'bf115',  description: 'Brickforce 115x20', unit: 'BRFCE', category: 'material', multiplier: 16, variable: 'scale', baseUnitPrice: 2.50 },
  { id: 'labour', description: 'Labour — foundation, plastering, flooring', unit: 'LBR', category: 'labour', multiplier: 4000, variable: 'scale' },
  { id: 'transp', description: 'Transport / deliveries', unit: 'trips', category: 'transport', multiplier: 10, variable: 'scale', baseUnitPrice: 150.00 },
  { id: 'suptrans',description: 'Supervisor transport', unit: '-', category: 'transport', multiplier: 400, variable: 'scale' },
  { id: 'stl_channel', description: 'Channel (100x50x6m)', unit: 'm', category: 'material', multiplier: 24, variable: 'scale', baseUnitPrice: 65 },
  { id: 'stl_lip_channel', description: 'Lipped Channel (100x50x20x2mmx12m)', unit: 'psc', category: 'material', multiplier: 76, variable: 'scale', baseUnitPrice: 55 },
  { id: 'stl_flat_150', description: 'Flat Bar (150x8mm)', unit: 'lengths', category: 'material', multiplier: 4, variable: 'scale', baseUnitPrice: 100 },
  { id: 'stl_flat_100', description: 'Flat Bar (100x5mmx6m)', unit: 'lengths', category: 'material', multiplier: 5, variable: 'scale', baseUnitPrice: 60 },
  { id: 'stl_angle_60', description: 'Angle Irons (60x60x5mmx6m)', unit: 'lengths', category: 'material', multiplier: 64, variable: 'scale', baseUnitPrice: 34 },
  { id: 'stl_angle_50', description: 'Angle Irons (50x50x5mmx6m)', unit: 'lengths', category: 'material', multiplier: 120, variable: 'scale', baseUnitPrice: 25 },
  { id: 'stl_bolt_16', description: 'Bolt & Nuts (M16x50)', unit: 'psc', category: 'material', multiplier: 400, variable: 'scale', baseUnitPrice: 0.5 },
  { id: 'stl_bolt_12', description: 'Bolt & Nuts (M12x50)', unit: 'psc', category: 'material', multiplier: 544, variable: 'scale', baseUnitPrice: 0.3 },
  { id: 'stl_washers', description: 'Washers (M16)', unit: 'psc', category: 'material', multiplier: 400, variable: 'scale', baseUnitPrice: 0.1 },
  { id: 'stl_roofing', description: 'Roofing Sheets (I.B.R. 0.4mm)', unit: 'lengths', category: 'material', multiplier: 240, variable: 'scale', baseUnitPrice: 35 },
  { id: 'stl_ridge', description: 'Roll top ridge (2.4m)', unit: 'psc', category: 'material', multiplier: 40, variable: 'scale', baseUnitPrice: 10 },
  { id: 'stl_tek_screw', description: 'Tek Screw (65 - 75)', unit: 'psc', category: 'material', multiplier: 3200, variable: 'scale', baseUnitPrice: 0.15 },
  { id: 'stl_welding', description: 'Welding Rods (1.5mm)', unit: 'kg', category: 'material', multiplier: 48, variable: 'scale', baseUnitPrice: 3 },
  { id: 'stl_cutting_disc', description: 'Cutting Disc (9")', unit: 'psc', category: 'material', multiplier: 52, variable: 'scale', baseUnitPrice: 2 },
  { id: 'stl_studding', description: 'Studding (M16x1m)', unit: 'psc', category: 'material', multiplier: 12, variable: 'scale', baseUnitPrice: 3 },
  { id: 'stl_broach_18', description: 'Broach Cutters (18mm)', unit: 'psc', category: 'material', multiplier: 4, variable: 'scale', baseUnitPrice: 28 },
  { id: 'stl_broach_14', description: 'Broach Cutters (14mm)', unit: 'psc', category: 'material', multiplier: 4, variable: 'scale', baseUnitPrice: 27 },
  { id: 'stl_red_oxide', description: 'Red Oxide Paint', unit: 'litres', category: 'material', multiplier: 80, variable: 'scale', baseUnitPrice: 5 },
  { id: 'stl_thinners', description: 'Thinners', unit: 'litres', category: 'material', multiplier: 80, variable: 'scale', baseUnitPrice: 3 },
  { id: 'stl_alu_bubble', description: 'Alu Bubble', unit: 'rolls', category: 'material', multiplier: 16, variable: 'scale', baseUnitPrice: 100 },
  { id: 'stl_coated_wire', description: 'Coated Wire (1.6mmx25kgs)', unit: 'rolls', category: 'material', multiplier: 1, variable: 'scale', baseUnitPrice: 47 },
  { id: 'stl_tape', description: 'Double Sided Tape (50mm)', unit: 'rolls', category: 'material', multiplier: 4, variable: 'scale', baseUnitPrice: 1 },
  { id: 'stl_labor', description: 'Steel fabrication & erection labor', unit: 'LBR', category: 'labour', multiplier: 11600, variable: 'scale', baseUnitPrice: 1 }
]