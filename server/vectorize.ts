import potrace from "potrace";
import { Buffer } from "node:buffer";

interface VectorizeOptions {
  threshold?: number;
  turnPolicy?: string;
  turdSize?: number;
  optCurve?: boolean;
  optTolerance?: number;
}

export function vectorizeImage(
  imageBuffer: Buffer,
  options: VectorizeOptions = {}
): Promise<string> {
  return new Promise((resolve, reject) => {
    const params = {
      threshold: options.threshold ?? 128,
      turnPolicy: potrace.Potrace.TURNPOLICY_MINORITY,
      turdSize: options.turdSize ?? 2,
      optCurve: options.optCurve ?? true,
      optTolerance: options.optTolerance ?? 0.2,
    };

    potrace.trace(imageBuffer, params, (err: Error | null, svg: string) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(svg);
    });
  });
}

export function vectorizeImageFromBase64(
  base64Data: string,
  options: VectorizeOptions = {}
): Promise<string> {
  const cleanBase64 = base64Data.includes("base64,")
    ? base64Data.split("base64,")[1]
    : base64Data;

  const imageBuffer = Buffer.from(cleanBase64, "base64");
  return vectorizeImage(imageBuffer, options);
}
