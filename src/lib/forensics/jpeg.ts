/**
 * Structural JPEG segment parser.
 *
 * Walks every marker segment directly (not via a decoder) so the report can
 * talk about what the file actually contains: quantization tables, sampling,
 * adaptive/mitigation markers, profile and metadata blocks, restart
 * intervals, and bytes appended after the end-of-image marker.
 */

export interface JpegSegment {
  marker: string;
  offset: number;
  length: number;
}

export interface JpegComponent {
  id: number;
  h: number;
  v: number;
  quantTable: number;
}

export interface JpegInfo {
  segments: JpegSegment[];
  segmentsByMarker: Record<string, number>;
  width: number;
  height: number;
  precision: number;
  components: JpegComponent[];
  samplingFactors: string[];
  progressive: boolean;
  restartInterval: number | null;
  quantizationTables: Record<number, number[]>;
  estimatedQuality: number | null;
  qualityMeanAbsDeviation: number | null;
  hasJfif: boolean;
  hasExif: boolean;
  hasIccProfile: boolean;
  hasXmp: boolean;
  appMarkerNames: string[];
  adobeInfo: { transform: number } | null;
  photoshopIrb: boolean;
  comments: string[];
  /** Textual hints of software that wrote the file (metadata, not proof). */
  softwareHints: string[];
  trailingBytesAfterEoi: number;
  error: string | null;
}

const STD_LUMA = [
  16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16,
  24, 40, 57, 69, 56, 14, 17, 22, 29, 51, 87, 80, 62, 18, 22, 37, 56, 68, 109,
  103, 77, 24, 35, 55, 64, 81, 104, 113, 92, 49, 64, 78, 87, 103, 121, 120,
  101, 72, 92, 95, 98, 112, 100, 103, 99,
];
const STD_CHROMA = [
  17, 18, 24, 47, 99, 99, 99, 99, 18, 21, 26, 66, 99, 99, 99, 99, 24, 26, 56,
  99, 99, 99, 99, 99, 47, 66, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99,
  99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99,
  99, 99, 99, 99, 99, 99, 99, 99,
];

const SOFTWARE_TOKENS = [
  "Adobe Photoshop",
  "Adobe Lightroom",
  "Adobe Camera Raw",
  "Adobe",
  "GIMP",
  "Affinity Photo",
  "Capture One",
  "Canva",
  "Snapseed",
  "Paint.NET",
  "WhatsApp",
  "Instagram",
  "Telegram",
  "Signal",
  "Twitter",
  "Facebook",
  "Microsoft Office",
  "Preview",
  "Screen",
  "screenshot",
  "Xiaomi",
  "iPhone",
  "Samsung",
  "Huawei",
  "ONEPLUS",
  "Google Pixel",
  "SONY",
  "Canon",
  "NIKON",
  "FUJIFILM",
  "Apple",
];

export function markerName(marker: number): string {
  const names: Record<number, string> = {
    0xd8: "SOI",
    0xd9: "EOI",
    0xda: "SOS",
    0xdb: "DQT",
    0xc0: "SOF0",
    0xc1: "SOF1",
    0xc2: "SOF2",
    0xc3: "SOF3",
    0xc9: "SOF9",
    0xca: "SOF10",
    0xc4: "DHT",
    0xdd: "DRI",
    0xfe: "COM",
    0xe0: "APP0",
    0xe1: "APP1",
    0xe2: "APP2",
    0xed: "APP13",
    0xee: "APP14",
  };
  if (names[marker]) return names[marker];
  if (marker >= 0xe0 && marker <= 0xef) return `APP${marker - 0xe0}`;
  if (marker >= 0xc0 && marker <= 0xcf) return `SOF${marker - 0xc0}`;
  if (marker >= 0xd0 && marker <= 0xd7) return `RST${marker - 0xd0}`;
  return `0x${marker.toString(16).toUpperCase().padStart(2, "0")}`;
}

function ascii(bytes: Uint8Array, from: number, length: number): string {
  let out = "";
  for (let i = 0; i < length && from + i < bytes.length; i++) {
    out += String.fromCharCode(bytes[from + i]);
  }
  return out;
}

function scanSoftwareHints(chunk: string): string[] {
  const found: string[] = [];
  for (const token of SOFTWARE_TOKENS) {
    if (chunk.includes(token) && !found.includes(token)) found.push(token);
  }
  return found;
}

/**
 * Estimate encoder quality by fitting the parsed table against the standard
 * luminance/chrominance tables scaled the way reference encoders do it.
 * This is an estimate derived from the file's own bytes, not a file name hint.
 */
function estimateForTable(table: number[]): {
  quality: number;
  meanAbsDeviation: number;
} | null {
  if (table.length !== 64) return null;
  const score = (std: number[], q: number): number => {
    const scale = q < 50 ? Math.floor(5000 / q) : 200 - 2 * q;
    let dev = 0;
    for (let i = 0; i < 64; i++) {
      const expected = Math.min(255, Math.max(1, Math.floor((std[i] * scale + 50) / 100)));
      dev += Math.abs(table[i] - expected);
    }
    return dev / 64;
  };
  let bestQ = -1;
  let bestDev = Infinity;
  for (let q = 5; q <= 100; q++) {
    const luma = score(STD_LUMA, q);
    const chroma = score(STD_CHROMA, q);
    const dev = Math.min(luma, chroma);
    if (dev < bestDev) {
      bestDev = dev;
      bestQ = q;
    }
  }
  if (bestQ < 0) return null;
  return { quality: bestQ, meanAbsDeviation: Math.round(bestDev * 10) / 10 };
}

export function parseJpeg(bytes: Uint8Array): JpegInfo {
  const info: JpegInfo = {
    segments: [],
    segmentsByMarker: {},
    width: -1,
    height: -1,
    precision: -1,
    components: [],
    samplingFactors: [],
    progressive: false,
    restartInterval: null,
    quantizationTables: {},
    estimatedQuality: null,
    qualityMeanAbsDeviation: null,
    hasJfif: false,
    hasExif: false,
    hasIccProfile: false,
    hasXmp: false,
    appMarkerNames: [],
    adobeInfo: null,
    photoshopIrb: false,
    comments: [],
    softwareHints: [],
    trailingBytesAfterEoi: 0,
    error: null,
  };
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    info.error = "Missing JPEG start-of-image marker.";
    return info;
  }

  const appNames = new Set<string>();
  let offset = 2;
  let reachedSos = false;

  while (offset + 1 < bytes.length && !reachedSos) {
    if (bytes[offset] !== 0xff) {
      offset++;
      continue;
    }
    let marker = bytes[offset + 1];
    while (marker === 0xff && offset + 2 < bytes.length) {
      offset++;
      marker = bytes[offset + 1];
    }
    if (marker === 0x00) {
      offset++;
      continue;
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    if (marker === 0xd9) {
      break;
    }
    if (offset + 3 >= bytes.length) break;
    const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
    if (length < 2 || offset + 2 + length > bytes.length + 0) {
      // tolerate by clamping
      info.error = info.error ?? "A segment length runs past the end of the file.";
      break;
    }
    const payloadStart = offset + 4;
    const payloadLength = Math.max(0, length - 2);
    const name = markerName(marker);
    info.segments.push({ marker: name, offset, length });
    info.segmentsByMarker[name] = (info.segmentsByMarker[name] ?? 0) + 1;

    const payload = bytes.subarray(payloadStart, payloadStart + payloadLength);

    switch (true) {
      case marker >= 0xe0 && marker <= 0xef: {
        const head = ascii(payload, 0, Math.min(16, payloadLength));
        if (marker === 0xe0 && head.startsWith("JFIF")) info.hasJfif = true;
        if (marker === 0xe1 && head.startsWith("Exif")) {
          info.hasExif = true;
        }
        if (marker === 0xe1 && head.startsWith("http://ns.adobe.com/xap/1.0/")) {
          info.hasXmp = true;
        }
        if (marker !== 0xe2 && !head.startsWith("ICC_PROFILE")) {
          if (payloadLength > 0) appNames.add(name);
        }
        if (
          payloadLength >= 12 &&
          ascii(payload, 0, 5) === "Adobe"
        ) {
          info.adobeInfo = { transform: payload[payloadLength - 1] };
        }
        if (marker === 0xed && ascii(payload, 0, 14).includes("Photoshop 3.0")) {
          info.photoshopIrb = true;
        }
        const text = ascii(payload, 0, Math.min(payloadLength, 2048));
        info.softwareHints.push(...scanSoftwareHints(text));
        break;
      }
      case marker === 0xe2 || name === "APP2": {
        if (ascii(payload, 0, Math.min(12, payloadLength)).startsWith("ICC_PROFILE")) {
          info.hasIccProfile = true;
        }
        appNames.add(name);
        break;
      }
      case marker === 0xfe: {
        const text = ascii(payload, 0, payloadLength).replace(/\0+$/, "");
        info.comments.push(text);
        info.softwareHints.push(...scanSoftwareHints(text));
        break;
      }
      case marker === 0xdb: {
        let p = 0;
        while (p < payloadLength) {
          const pq = payload[p] >> 4;
          const tq = payload[p] & 0x0f;
          p++;
          const vals: number[] = [];
          for (let i = 0; i < 64 && p < payloadLength; i++) {
            if (pq === 0) {
              vals.push(payload[p]);
              p += 1;
            } else {
              vals.push((payload[p] << 8) | payload[p + 1]);
              p += 2;
            }
          }
          info.quantizationTables[tq] = vals;
        }
        break;
      }
      case marker === 0xdd: {
        if (payloadLength >= 2) {
          info.restartInterval = (payload[0] << 8) | payload[1];
        }
        break;
      }
      case marker >= 0xc0 && marker <= 0xcf &&
        marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc: {
        info.progressive = marker === 0xc2 || marker === 0xc6 || marker === 0xca || marker === 0xce;
        info.precision = payload[0];
        info.height = (payload[1] << 8) | payload[2];
        info.width = (payload[3] << 8) | payload[4];
        const nf = payload[5];
        for (let i = 0; i < nf && 6 + i * 3 < payloadLength; i++) {
          const id = payload[6 + i * 3];
          const hv = payload[7 + i * 3];
          const tq = payload[8 + i * 3];
          info.components.push({ id, h: hv >> 4, v: hv & 0x0f, quantTable: tq });
          info.samplingFactors.push(`${hv >> 4}h×${hv & 0x0f}v`);
        }
        break;
      }
      case marker === 0xda: {
        reachedSos = true;
        break;
      }
      default:
        break;
    }

    if (reachedSos) break;
    offset += 2 + length;
  }

  info.appMarkerNames = [...appNames];
  info.softwareHints = [...new Set(info.softwareHints)];

  const table0 = info.quantizationTables[0];
  if (table0) {
    const est = estimateForTable(table0);
    if (est) {
      info.estimatedQuality = est.quality;
      info.qualityMeanAbsDeviation = est.meanAbsDeviation;
    }
  }

  // Find the real end of the entropy-coded data to detect appended bytes.
  let lastEoi = -1;
  for (let i = bytes.length - 2; i >= 2; i--) {
    if (bytes[i] === 0xff && bytes[i + 1] === 0xd9) {
      lastEoi = i;
      break;
    }
  }
  if (lastEoi >= 0) {
    info.trailingBytesAfterEoi = bytes.length - (lastEoi + 2);
  }

  return info;
}