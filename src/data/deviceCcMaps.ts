// CC parameter definitions for known MIDI devices

export interface CcParameter {
  cc: number;
  name: string;
  category?: string;
}

export interface DeviceCcMap {
  name: string;
  // Patterns to match port names (case-insensitive)
  portPatterns: string[];
  parameters: CcParameter[];
}

export const deviceCcMaps: DeviceCcMap[] = [
  {
    name: "Elektron Digitone II",
    portPatterns: ["digitone ii", "digitone-ii"],
    parameters: [
      // Standard MIDI CCs
      { cc: 1, name: "Mod Wheel", category: "Standard" },
      { cc: 2, name: "Breath Controller", category: "Standard" },
      { cc: 7, name: "Volume", category: "Standard" },
      { cc: 10, name: "Pan", category: "Standard" },
      { cc: 11, name: "Expression", category: "Standard" },

      // Synth Page 1 (SYN1)
      { cc: 40, name: "Algo", category: "SYN1" },
      { cc: 41, name: "Ratio A", category: "SYN1" },
      { cc: 42, name: "Ratio B", category: "SYN1" },
      { cc: 43, name: "Ratio C", category: "SYN1" },
      { cc: 44, name: "Harmonics A", category: "SYN1" },
      { cc: 45, name: "Harmonics B", category: "SYN1" },
      { cc: 46, name: "Harmonics C", category: "SYN1" },
      { cc: 47, name: "Detune", category: "SYN1" },

      // Synth Page 2 (SYN2)
      { cc: 48, name: "Mix A", category: "SYN2" },
      { cc: 49, name: "Mix B", category: "SYN2" },
      { cc: 50, name: "Mix C", category: "SYN2" },
      { cc: 51, name: "Feedback", category: "SYN2" },
      { cc: 52, name: "A Level", category: "SYN2" },
      { cc: 53, name: "B Level", category: "SYN2" },
      { cc: 54, name: "C Level", category: "SYN2" },
      { cc: 55, name: "Bend Depth", category: "SYN2" },

      // Synth Page 3 (A ENV)
      { cc: 56, name: "A Env Attack", category: "A ENV" },
      { cc: 57, name: "A Env Decay", category: "A ENV" },
      { cc: 58, name: "A Env End", category: "A ENV" },
      { cc: 59, name: "A Env Level", category: "A ENV" },
      { cc: 60, name: "B Env Attack", category: "B ENV" },
      { cc: 61, name: "B Env Decay", category: "B ENV" },
      { cc: 62, name: "B Env End", category: "B ENV" },
      { cc: 63, name: "B Env Level", category: "B ENV" },

      // Synth Page 4
      { cc: 70, name: "Phase Reset", category: "SYN4" },
      { cc: 71, name: "C-B Phase", category: "SYN4" },
      { cc: 72, name: "C-A Phase", category: "SYN4" },
      { cc: 73, name: "B-A Phase", category: "SYN4" },
      { cc: 74, name: "Key Pitch", category: "SYN4" },
      { cc: 75, name: "Drift", category: "SYN4" },
      { cc: 76, name: "Detune Amt", category: "SYN4" },
      { cc: 77, name: "Unison Cnt", category: "SYN4" },

      // Filter
      { cc: 16, name: "Filter Freq", category: "Filter" },
      { cc: 17, name: "Filter Reso", category: "Filter" },
      { cc: 18, name: "Filter Type", category: "Filter" },
      { cc: 19, name: "Filter Env Dly", category: "Filter" },
      { cc: 20, name: "Filter Env Atk", category: "Filter" },
      { cc: 21, name: "Filter Env Dec", category: "Filter" },
      { cc: 22, name: "Filter Env Sus", category: "Filter" },
      { cc: 23, name: "Filter Env Rel", category: "Filter" },
      { cc: 24, name: "Filter Env Depth", category: "Filter" },
      { cc: 25, name: "Filter Env Reset", category: "Filter" },
      { cc: 26, name: "Filter Key Track", category: "Filter" },
      { cc: 27, name: "Filter Base", category: "Filter" },
      { cc: 28, name: "Filter Width", category: "Filter" },

      // Amp
      { cc: 84, name: "Amp Attack", category: "Amp" },
      { cc: 85, name: "Amp Hold", category: "Amp" },
      { cc: 86, name: "Amp Decay", category: "Amp" },
      { cc: 88, name: "Amp Release", category: "Amp" },
      { cc: 89, name: "Pan", category: "Amp" },
      { cc: 90, name: "Volume", category: "Amp" },
      { cc: 91, name: "Amp Mode", category: "Amp" },
      { cc: 92, name: "Amp Env Reset", category: "Amp" },

      // Effects
      { cc: 29, name: "Chorus Send", category: "FX" },
      { cc: 30, name: "Delay Send", category: "FX" },
      { cc: 31, name: "Reverb Send", category: "FX" },
      { cc: 78, name: "Bit Reduction", category: "FX" },
      { cc: 79, name: "Sample Rate Redux", category: "FX" },
      { cc: 80, name: "SRR Routing", category: "FX" },
      { cc: 81, name: "Overdrive", category: "FX" },
      { cc: 82, name: "OD Routing", category: "FX" },

      // Trig
      { cc: 3, name: "Note", category: "Trig" },
      { cc: 4, name: "Velocity", category: "Trig" },
      { cc: 5, name: "Length", category: "Trig" },
      { cc: 9, name: "Portamento Time", category: "Trig" },
      { cc: 13, name: "Filter Trig", category: "Trig" },
      { cc: 14, name: "LFO Trig", category: "Trig" },
      { cc: 65, name: "Portamento On", category: "Trig" },

      // Track
      { cc: 94, name: "Mute", category: "Track" },
      { cc: 95, name: "Track Level", category: "Track" },

      // LFO 1
      { cc: 102, name: "LFO1 Speed", category: "LFO1" },
      { cc: 103, name: "LFO1 Multiplier", category: "LFO1" },
      { cc: 104, name: "LFO1 Fade", category: "LFO1" },
      { cc: 105, name: "LFO1 Destination", category: "LFO1" },
      { cc: 106, name: "LFO1 Waveform", category: "LFO1" },
      { cc: 107, name: "LFO1 Start Phase", category: "LFO1" },
      { cc: 108, name: "LFO1 Trig Mode", category: "LFO1" },
      { cc: 109, name: "LFO1 Depth", category: "LFO1" },

      // LFO 2
      { cc: 112, name: "LFO2 Speed", category: "LFO2" },
      { cc: 113, name: "LFO2 Multiplier", category: "LFO2" },
      { cc: 114, name: "LFO2 Fade", category: "LFO2" },
      { cc: 115, name: "LFO2 Destination", category: "LFO2" },
      { cc: 116, name: "LFO2 Waveform", category: "LFO2" },
      { cc: 117, name: "LFO2 Start Phase", category: "LFO2" },
      { cc: 118, name: "LFO2 Trig Mode", category: "LFO2" },
      { cc: 119, name: "LFO2 Depth", category: "LFO2" },
    ],
  },
];

// Find device CC map by port name
export function findDeviceCcMap(portName: string): DeviceCcMap | undefined {
  const lowerName = portName.toLowerCase();
  return deviceCcMaps.find((device) =>
    device.portPatterns.some((pattern) => lowerName.includes(pattern))
  );
}

// Get parameter name for a CC number
export function getCcParameterName(
  deviceMap: DeviceCcMap | undefined,
  cc: number
): string {
  if (!deviceMap) return `CC ${cc}`;
  const param = deviceMap.parameters.find((p) => p.cc === cc);
  return param ? param.name : `CC ${cc}`;
}

// Get parameters grouped by category
export function getParametersByCategory(
  deviceMap: DeviceCcMap
): Map<string, CcParameter[]> {
  const grouped = new Map<string, CcParameter[]>();
  for (const param of deviceMap.parameters) {
    const category = param.category || "Other";
    if (!grouped.has(category)) {
      grouped.set(category, []);
    }
    grouped.get(category)!.push(param);
  }
  return grouped;
}
