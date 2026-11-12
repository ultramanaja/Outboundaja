import React, { useMemo } from 'react';
import { encodeCode128B } from '../utils/barcode128';

interface Barcode128SvgProps {
  value: string;
  barHeight?: number;
  showLabel?: boolean;
  className?: string;
}

export const Barcode128Svg: React.FC<Barcode128SvgProps> = ({
  value,
  barHeight = 34,
  showLabel = true,
  className = '',
}) => {
  const encoded = useMemo(() => encodeCode128B(value), [value]);

  if (!encoded.value || encoded.totalModules === 0) {
    return null;
  }

  const labelSpace = showLabel ? 16 : 0;
  const paddingTop = 4;
  const paddingBottom = showLabel ? 4 : 4;
  const totalHeight = paddingTop + barHeight + labelSpace + paddingBottom;

  return (
    <svg
      viewBox={`0 0 ${encoded.totalModules} ${totalHeight}`}
      role="img"
      aria-label={`Barcode ${encoded.value}`}
      shapeRendering="crispEdges"
      className={`bg-white select-none block ${className}`}
    >
      <rect x="0" y="0" width={encoded.totalModules} height={totalHeight} fill="#FFFFFF" />
      {encoded.bars.map((bar, idx) => (
        <rect
          key={`${bar.x}-${idx}`}
          x={bar.x}
          y={paddingTop}
          width={bar.width}
          height={barHeight}
          fill="#0F172A"
        />
      ))}
      {showLabel && (
        <text
          x={encoded.totalModules / 2}
          y={paddingTop + barHeight + 12}
          textAnchor="middle"
          fill="#0F172A"
          fontSize="10"
          fontFamily="JetBrains Mono, monospace"
          fontWeight="600"
        >
          {encoded.value}
        </text>
      )}
    </svg>
  );
};
