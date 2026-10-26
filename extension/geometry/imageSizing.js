// Bound image texture memory independently from the source photo dimensions.
// Width/height are logical pixels; scale is GNOME's monitor paint scale.
export const MAX_DECODED_IMAGE_PIXELS = 1_500_000;

export function boundedImageDecodeSize(width,height,scale=1,
    maxPixels=MAX_DECODED_IMAGE_PIXELS) {
    const w=Number.isFinite(width)&&width>0?width:1;
    const h=Number.isFinite(height)&&height>0?height:1;
    const s=Number.isFinite(scale)&&scale>0?scale:1;
    const limit=Number.isFinite(maxPixels)&&maxPixels>0
        ? maxPixels : MAX_DECODED_IMAGE_PIXELS;
    const factor=Math.min(1,Math.sqrt(limit/(w*h*s*s)));
    return {
        width:Math.max(1,Math.floor(w*factor)),
        height:Math.max(1,Math.floor(h*factor)),
    };
}
