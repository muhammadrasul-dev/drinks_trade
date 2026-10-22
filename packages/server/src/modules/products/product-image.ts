// Product image processing (architecture §9): the upload is checked by its
// bytes (not the browser's MIME type), auto-rotated, shrunk to fit 512×512 and
// stored as WebP — one small format the list and the form both show.
import { DomainError, ErrorCode } from '@drinks/shared';
import { PRODUCT_IMAGE_MAX_BYTES, PRODUCT_IMAGE_MAX_SIDE } from '@drinks/shared/schemas';
import sharp from 'sharp';

export const PRODUCT_IMAGE_CONTENT_TYPE = 'image/webp';
export const PRODUCT_IMAGE_EXTENSION = 'webp';

const ACCEPTED_FORMATS = new Set(['jpeg', 'png', 'webp']);

/** VALIDATION_FAILED on the `image` field; the message is a key the UI translates. */
export function imageError(reason: 'tooBig' | 'invalidType'): DomainError {
  return new DomainError(ErrorCode.VALIDATION_FAILED, undefined, { image: [reason] });
}

/** Upload → stored bytes. Throws VALIDATION_FAILED for > 2 MB or a non jpg/png/webp image. */
export async function processProductImage(data: Uint8Array): Promise<Uint8Array> {
  if (data.byteLength === 0) throw imageError('invalidType');
  if (data.byteLength > PRODUCT_IMAGE_MAX_BYTES) throw imageError('tooBig');

  let format: string | undefined;
  try {
    ({ format } = await sharp(data).metadata());
  } catch {
    throw imageError('invalidType');
  }
  if (!format || !ACCEPTED_FORMATS.has(format)) throw imageError('invalidType');

  try {
    const output = await sharp(data)
      .rotate() // apply EXIF orientation before the metadata is dropped
      .resize({
        width: PRODUCT_IMAGE_MAX_SIDE,
        height: PRODUCT_IMAGE_MAX_SIDE,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 85 })
      .toBuffer();
    return new Uint8Array(output);
  } catch {
    // Valid header, broken body (truncated upload and the like).
    throw imageError('invalidType');
  }
}
