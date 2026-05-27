/**
 * Loop brand mark — engraved infinity (∞) SVG
 * Loop is an independent African social audio platform.
 * Brand color: #3EDE72 (vivid spring green)
 * This file replaces the previous RALD logo — Loop is its own product.
 */

interface LoopIconProps {
  size?: number;
  color?: string;
  className?: string;
}

/** The Loop infinity mark — square, scales to any size */
export function LoopIcon({ size = 36, color = "#3EDE72", className = "" }: LoopIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      className={className}
      aria-label="Loop"
      role="img"
    >
      <path
        d="M50 50C42 25 8 25 8 50C8 75 42 75 50 50C58 25 92 25 92 50C92 75 58 75 50 50"
        stroke={color}
        strokeWidth="9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Loop wordmark — infinity mark + "Loop" label, 2.8:1 aspect ratio */
export function LoopLogo({ size = 36, color = "#3EDE72", className = "" }: LoopIconProps) {
  const w = Math.round(size * 2.8);
  return (
    <svg
      width={w}
      height={size}
      viewBox={`0 0 ${w} ${size}`}
      fill="none"
      className={className}
      aria-label="Loop"
      role="img"
    >
      <g transform={`scale(${size / 100})`}>
        <path
          d="M50 50C42 25 8 25 8 50C8 75 42 75 50 50C58 25 92 25 92 50C92 75 58 75 50 50"
          stroke={color}
          strokeWidth="9"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
      <text
        x={size + Math.round(size * 0.2)}
        y={Math.round(size * 0.75)}
        fontFamily="'Inter','Helvetica Neue',Arial,sans-serif"
        fontWeight="700"
        fontSize={Math.round(size * 0.72)}
        fill={color}
        letterSpacing="-0.02em"
      >
        Loop
      </text>
    </svg>
  );
}

/** @deprecated RALD logo was incorrectly placed in this product's codebase. Use LoopLogo or LoopIcon. */
export const RaldLogo = LoopLogo;
