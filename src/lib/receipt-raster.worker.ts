import { perspectiveWarp } from "./receipt-raster";
import type { Quad } from "./receipt-corners";

self.onmessage = (
  event: MessageEvent<{
    pixels: Uint8ClampedArray;
    width: number;
    height: number;
    corners: Quad;
    outWidth: number;
    outHeight: number;
  }>,
) => {
  const { pixels, width, height, corners, outWidth, outHeight } = event.data;
  const output = perspectiveWarp({ data: pixels, width, height }, corners, outWidth, outHeight);
  self.postMessage(output, { transfer: [output.buffer] });
};
