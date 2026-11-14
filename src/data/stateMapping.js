// GeoJSON name → Model name mapping and Zone assignment
// Resolves differences between in.json feature.properties.name and the ML model's state names

export const GEO_TO_MODEL_NAME = {
  'Andaman and Nicobar':                       'Andaman And Nicobar Islands',
  'Andhra Pradesh':                             'Andhra Pradesh',
  'Arunachal Pradesh':                          'Arunachal Pradesh',
  'Assam':                                      'Assam',
  'Bihar':                                      'Bihar',
  'Chandigarh':                                 'Chandigarh',
  'Chhattisgarh':                               'Chhattisgarh',
  'Dādra and Nagar Haveli and Damān and Diu':   null, // not in model
  'Delhi':                                      'Delhi',
  'Goa':                                        'Goa',
  'Gujarat':                                    'Gujarat',
  'Haryana':                                    'Haryana',
  'Himachal Pradesh':                           'Himachal Pradesh',
  'Jammu and Kashmir':                          'Jammu And Kashmir',
  'Jharkhand':                                  'Jharkhand',
  'Karnataka':                                  'Karnataka',
  'Kerala':                                     'Kerala',
  'Ladakh':                                     null, // not in model
  'Lakshadweep':                                'Lakshadweep',
  'Madhya Pradesh':                             'Madhya Pradesh',
  'Maharashtra':                                'Maharashtra',
  'Manipur':                                    'Manipur',
  'Meghalaya':                                  'Meghalaya',
  'Mizoram':                                    'Mizoram',
  'Nagaland':                                   'Nagaland',
  'Orissa':                                     'Odisha',
  'Puducherry':                                 'Puducherry',
  'Punjab':                                     'Punjab',
  'Rajasthan':                                  'Rajasthan',
  'Sikkim':                                     'Sikkim',
  'Tamil Nadu':                                 'Tamil Nadu',
  'Telangana':                                  'Telangana',
  'Tripura':                                    'Tripura',
  'Uttar Pradesh':                              'Uttar Pradesh',
  'Uttaranchal':                                'Uttarakhand',
  'West Bengal':                                'West Bengal',
};

export const STATE_TO_ZONE = {
  'Andaman And Nicobar Islands': 'South',
  'Andhra Pradesh': 'South',
  'Arunachal Pradesh': 'North-East',
  'Assam': 'North-East',
  'Bihar': 'East',
  'Chandigarh': 'North',
  'Chhattisgarh': 'Central',
  'Delhi': 'North',
  'Goa': 'West',
  'Gujarat': 'West',
  'Haryana': 'North',
  'Himachal Pradesh': 'North',
  'Jammu And Kashmir': 'North',
  'Jharkhand': 'East',
  'Karnataka': 'South',
  'Kerala': 'South',
  'Lakshadweep': 'South',
  'Madhya Pradesh': 'Central',
  'Maharashtra': 'West',
  'Manipur': 'North-East',
  'Meghalaya': 'North-East',
  'Mizoram': 'North-East',
  'Nagaland': 'North-East',
  'Odisha': 'East',
  'Puducherry': 'South',
  'Punjab': 'North',
  'Rajasthan': 'West',
  'Sikkim': 'North-East',
  'Tamil Nadu': 'South',
  'Telangana': 'South',
  'Tripura': 'North-East',
  'Uttar Pradesh': 'North',
  'Uttarakhand': 'North',
  'West Bengal': 'East',
};

export const ZONE_COLORS = {
  'South':      { fill: '#10B981', border: '#059669', label: 'South Zone' },
  'North':      { fill: '#3B82F6', border: '#2563EB', label: 'North Zone' },
  'West':       { fill: '#F59E0B', border: '#D97706', label: 'West Zone' },
  'East':       { fill: '#EF4444', border: '#DC2626', label: 'East Zone' },
  'Central':    { fill: '#8B5CF6', border: '#7C3AED', label: 'Central Zone' },
  'North-East': { fill: '#EC4899', border: '#DB2777', label: 'North-East Zone' },
};

export const ZONE_TO_STATES = {
  'South':      ['Andaman And Nicobar Islands','Andhra Pradesh','Karnataka','Kerala','Lakshadweep','Puducherry','Tamil Nadu','Telangana'],
  'North':      ['Chandigarh','Delhi','Haryana','Himachal Pradesh','Jammu And Kashmir','Punjab','Uttar Pradesh','Uttarakhand'],
  'West':       ['Goa','Gujarat','Maharashtra','Rajasthan'],
  'East':       ['Bihar','Jharkhand','Odisha','West Bengal'],
  'Central':    ['Chhattisgarh','Madhya Pradesh'],
  'North-East': ['Arunachal Pradesh','Assam','Manipur','Meghalaya','Mizoram','Nagaland','Sikkim','Tripura'],
};

// Default baseline stats (2024) for auto-projection
export const STATE_DEFAULTS = {
  'Andaman And Nicobar Islands': { pop: 396696, gsdp: 8200 },
  'Andhra Pradesh': { pop: 53000000, gsdp: 1400000 },
  'Arunachal Pradesh': { pop: 1700000, gsdp: 35000 },
  'Assam': { pop: 36000000, gsdp: 450000 },
  'Bihar': { pop: 130000000, gsdp: 750000 },
  'Chandigarh': { pop: 1200000, gsdp: 45000 },
  'Chhattisgarh': { pop: 30000000, gsdp: 420000 },
  'Delhi': { pop: 21000000, gsdp: 1000000 },
  'Goa': { pop: 1600000, gsdp: 95000 },
  'Gujarat': { pop: 72000000, gsdp: 2200000 },
  'Haryana': { pop: 30000000, gsdp: 1050000 },
  'Himachal Pradesh': { pop: 7500000, gsdp: 210000 },
  'Jammu And Kashmir': { pop: 14000000, gsdp: 230000 },
  'Jharkhand': { pop: 40000000, gsdp: 400000 },
  'Karnataka': { pop: 70000000, gsdp: 2400000 },
  'Kerala': { pop: 36000000, gsdp: 1100000 },
  'Lakshadweep': { pop: 68000, gsdp: 2500 },
  'Madhya Pradesh': { pop: 87000000, gsdp: 1200000 },
  'Maharashtra': { pop: 130000000, gsdp: 3800000 },
  'Manipur': { pop: 3200000, gsdp: 38000 },
  'Meghalaya': { pop: 3800000, gsdp: 45000 },
  'Mizoram': { pop: 1300000, gsdp: 28000 },
  'Nagaland': { pop: 2300000, gsdp: 35000 },
  'Odisha': { pop: 47000000, gsdp: 650000 },
  'Puducherry': { pop: 1700000, gsdp: 42000 },
  'Punjab': { pop: 31000000, gsdp: 700000 },
  'Rajasthan': { pop: 82000000, gsdp: 1400000 },
  'Sikkim': { pop: 700000, gsdp: 40000 },
  'Tamil Nadu': { pop: 78000000, gsdp: 2600000 },
  'Telangana': { pop: 40000000, gsdp: 1450000 },
  'Tripura': { pop: 4200000, gsdp: 65000 },
  'Uttar Pradesh': { pop: 240000000, gsdp: 2400000 },
  'Uttarakhand': { pop: 12000000, gsdp: 310000 },
  'West Bengal': { pop: 100000000, gsdp: 1600000 },
};

export function getAutoProjection(zone, state, year) {
  const deltaYears = Math.max(0, year - 2024);
  const popGR = 0.0102;
  const gsdpGR = 0.095;
  let bp = 0, bg = 0;

  if (state && STATE_DEFAULTS[state]) {
    bp = STATE_DEFAULTS[state].pop;
    bg = STATE_DEFAULTS[state].gsdp;
  } else if (zone && ZONE_TO_STATES[zone]) {
    ZONE_TO_STATES[zone].forEach(st => {
      if (STATE_DEFAULTS[st]) { bp += STATE_DEFAULTS[st].pop; bg += STATE_DEFAULTS[st].gsdp; }
    });
  } else {
    bp = 68000000; bg = 1200000;
  }

  return {
    population: Math.round(bp * Math.pow(1 + popGR, deltaYears)),
    gsdp: Math.round(bg * Math.pow(1 + gsdpGR, deltaYears)),
  };
}
