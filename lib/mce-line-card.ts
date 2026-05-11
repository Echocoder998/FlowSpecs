export const mceLineCardLibrary = [
  {
    group: "Automation",
    categories: [
      "Motion & Control",
      "Positioning & Power Transmission",
      "Robotics",
      "Feedback",
      "Sensing",
      "Vision",
      "Safety",
      "Connectivity"
    ],
    lineCards: [
      "Air Automation Engineering",
      "Industrial Control",
      "RSA",
      "RSA Vendor Managed Inventory",
      "Ultimation"
    ]
  },
  {
    group: "Rotating Equipment",
    categories: [
      "Air Compressors",
      "Air Treatment",
      "Blower",
      "Chillers",
      "Electric AC Motors",
      "Electric DC Motors",
      "Engineered Solutions",
      "Modular Piping Systems",
      "Nitrogen Generators",
      "Pumps",
      "Starters",
      "System Control Remote Monitoring",
      "Transformers & Gear Reducers",
      "Vacuum"
    ],
    lineCards: [
      "Diversified Air Systems",
      "Kaishan Compressed Air Solutions",
      "General Machinery",
      "Power and Pumps",
      "All Prime Pumps",
      "Romanoff",
      "MCE Motors"
    ]
  },
  {
    group: "Flow Control",
    categories: [
      "Valves",
      "Actuators",
      "Automation Accessories",
      "Regulators & Tank Venting",
      "Instrumentation",
      "Steam & Condensate",
      "Renewable Fuels Processing"
    ],
    lineCards: [
      "Bio Fuels",
      "Daughtridge Sales",
      "Filter Resources",
      "Ives Analytical Instruments",
      "Ives Process Equipment",
      "Ives Process Instrument and Controls",
      "Ives Sanitary and High Purity Process",
      "Ives Water and Wastewater Controls",
      "Ives Water and Wastewater Treatment Equipment",
      "Ives Naval Line Card",
      "Precision Pump and Valve",
      "SwansonFlo Illinois",
      "SwansonFlo Indiana",
      "SwansonFlo Mid Continent Region",
      "SwansonFlo West Region",
      "SwansonFlo Wisconsin",
      "SwansonFlo High Purity Line Card",
      "Nightwine",
      "NETS Industrial Line Card",
      "Ives-NETS WV-VA Line Card"
    ]
  },
  {
    group: "Fluid Power",
    categories: [
      "Fluid Connectors & Hose",
      "Hydraulics",
      "Pneumatics",
      "Instrumentation",
      "Filtration",
      "Lubrication",
      "Industrial",
      "Work Holding"
    ],
    lineCards: [
      "Fluid Power Line Card",
      "Crimper Placement",
      "Instrument Associates Filtration",
      "Instrument Associates JIC Hydraulic Power Unit",
      "Instrument Associates Parker Instrumentation",
      "Instrument Associates Vendor Managed Inventory",
      "Instrument Associates Carwash Solutions for MROs",
      "Instrument Associates Carwash Solutions for OEMs",
      "Quest Engineering Filtration",
      "Quest Engineering Food and Beverage",
      "Quest Engineering JIC Hydraulic Power Unit",
      "Quest Engineering Parker Instrumentation",
      "Quest Engineering Power Gen Solutions",
      "Quest Engineering Vendor Managed Inventory",
      "RitterTech Filtration",
      "RitterTech Power Gen Solutions",
      "RitterTech Vendor Managed Inventory"
    ]
  },
  {
    group: "Filtration",
    categories: ["Filter Cartridges", "Filter Vessels", "Engineered Equipment"],
    lineCards: ["Filter Resources", "Instrument Associates Filtration", "Quest Engineering Filtration", "RitterTech Filtration"]
  },
  {
    group: "Service and Repair",
    categories: ["Inventory Management", "Service & Repair"],
    lineCards: ["MCE Service & Repair Solutions", "Hydraulic Repair", "Piedmont Manufacturing Solutions"]
  },
  {
    group: "Industry Solutions",
    categories: ["Oil & Gas", "Renewable Fuels"],
    lineCards: ["Solutions for Oil & Gas", "Solutions for Renewable Fuels"]
  }
];

export const mceLineCardLibrarySource = "https://mceautomation.com/line-card-library";

export function formatMceLineCardLibrary() {
  return mceLineCardLibrary
    .map((entry) =>
      [
        `Group: ${entry.group}`,
        `Categories: ${entry.categories.join(", ")}`,
        `Line cards: ${entry.lineCards.join(", ")}`
      ].join("\n")
    )
    .join("\n\n");
}
