import type { Product } from '@drinks/shared';
import { cn } from '@drinks/ui/lib/utils';
import { PackageIcon } from 'lucide-react';

import { productImageUrl } from '../list-params';

interface ProductThumbProps {
  product: Pick<Product, 'id' | 'name' | 'imageVersion'>;
  /** Square side in px. */
  size: number;
  className?: string;
}

/** Product photo (already ≤ 512 px on the server) or a placeholder icon. */
export function ProductThumb({ product, size, className }: ProductThumbProps) {
  const box = cn(
    'flex shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted',
    className,
  );
  if (!product.imageVersion) {
    return (
      <div className={box} style={{ width: size, height: size }} aria-hidden>
        <PackageIcon className="size-1/2 text-muted-foreground" />
      </div>
    );
  }
  return (
    <div className={box} style={{ width: size, height: size }}>
      {/* An authenticated, already-resized route: next/image optimization adds nothing here. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={productImageUrl(product.id, product.imageVersion)}
        alt={product.name}
        width={size}
        height={size}
        loading="lazy"
        className="size-full object-contain"
      />
    </div>
  );
}
