// Vectorization service using potrace to convert raster images to SVG
import potrace from 'potrace';
import { promisify } from 'util';

const trace = promisify(potrace.trace);

interface VectorizeOptions {
  turdSize?: number;    // Suppress speckles (default: 2)
  turnPolicy?: string;  // How to resolve ambiguities (default: 'minority')
  alphaMax?: number;    // Corner threshold (default: 1)
  optCurve?: boolean;   // Optimize curves (default: true)
  optTolerance?: number; // Curve optimization tolerance (default: 0.2)
  threshold?: number;   // Threshold for black/white conversion (0-255, default: 128)
  blackOnWhite?: boolean; // For coloring book line art (default: true)
}

// Convert a base64 PNG/JPEG image to SVG for crisp, scalable print output
export async function vectorizeImage(
  imageDataUrl: string, 
  options: VectorizeOptions = {}
): Promise<string> {
  console.log('[vectorizer] Starting image vectorization...');
  
  // Extract base64 data from data URL
  const base64Data = imageDataUrl.replace(/^data:image\/\w+;base64,/, '');
  const imageBuffer = Buffer.from(base64Data, 'base64');
  
  // Configure potrace for coloring book style (clean lines, high contrast)
  const traceOptions: any = {
    turdSize: options.turdSize ?? 2,
    turnPolicy: options.turnPolicy ?? 'minority',
    alphaMax: options.alphaMax ?? 1,
    optCurve: options.optCurve ?? true,
    optTolerance: options.optTolerance ?? 0.2,
    threshold: options.threshold ?? 128,
    blackOnWhite: options.blackOnWhite ?? true,
  };
  
  try {
    const svg = await trace(imageBuffer, traceOptions);
    console.log('[vectorizer] Vectorization complete');
    return svg;
  } catch (error) {
    console.error('[vectorizer] Vectorization failed:', error);
    throw error;
  }
}

// Vectorize with settings optimized for coloring book line art
export async function vectorizeColoringPage(imageDataUrl: string): Promise<string> {
  return vectorizeImage(imageDataUrl, {
    turdSize: 4,        // Remove small noise/artifacts
    threshold: 140,     // Adjust for line art visibility
    optCurve: true,     // Smooth curves
    optTolerance: 0.3,  // Balanced curve optimization
    blackOnWhite: true, // Our line art is black on white
  });
}

// Parse SVG to extract width, height, and viewBox for proper scaling
export function parseSvgDimensions(svg: string): { width: number; height: number } {
  // Try to get explicit width/height first
  const widthMatch = svg.match(/width="(\d+(?:\.\d+)?)"/);
  const heightMatch = svg.match(/height="(\d+(?:\.\d+)?)"/);
  
  if (widthMatch && heightMatch) {
    return {
      width: parseFloat(widthMatch[1]),
      height: parseFloat(heightMatch[1]),
    };
  }
  
  // Fall back to viewBox
  const viewBoxMatch = svg.match(/viewBox="([\d.\s-]+)"/);
  if (viewBoxMatch) {
    const parts = viewBoxMatch[1].trim().split(/\s+/);
    if (parts.length >= 4) {
      return {
        width: parseFloat(parts[2]),
        height: parseFloat(parts[3]),
      };
    }
  }
  
  // Default fallback (standard coloring page size)
  return { width: 1024, height: 1536 };
}
