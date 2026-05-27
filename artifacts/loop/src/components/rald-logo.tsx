import { useId } from "react";

interface RaldLogoProps {
  height?: number;
  theme?: "dark" | "light";
  accentColor?: string;
  className?: string;
}

export function RaldLogo({ height = 32, theme = "dark", accentColor, className = "" }: RaldLogoProps) {
  const uid = useId().replace(/:/g, "");
  const mainColor = theme === "dark" ? "#FFFFFF" : "#1C3557";
  const teal  = "#00C87A";
  const red   = "#D42B2B";
  const amber = "#E8A200";

  const fs  = height;
  const vbH = height;
  const vbW = Math.round(height * 3.15);
  const y   = Math.round(height * 0.82);
  const aX  = Math.round(height * 0.87);
  const aW  = Math.round(height * 0.73);
  const midY = Math.round(height * 0.48);

  const shadow = accentColor
    ? { filter: `drop-shadow(0 0 ${Math.round(height * 0.35)}px ${accentColor}55)` }
    : {};

  const font = "'Inter', 'Helvetica Neue', Arial, sans-serif";
  const fp = { fontSize: fs, fontWeight: 900 as const, fontFamily: font, letterSpacing: "-0.03em" };

  return (
    <svg width={vbW} height={vbH} viewBox={`0 0 ${vbW} ${vbH}`} className={className} style={shadow} aria-label="RALD" role="img">
      <defs>
        <clipPath id={`${uid}au`}><rect x={aX} y={0} width={aW} height={midY} /></clipPath>
        <clipPath id={`${uid}al`}><rect x={aX} y={midY} width={Math.round(aW * 0.5)} height={vbH - midY} /></clipPath>
        <clipPath id={`${uid}ar`}><rect x={aX + Math.round(aW * 0.5)} y={midY} width={Math.round(aW * 0.5)} height={vbH - midY} /></clipPath>
      </defs>
      <text x={0} y={y} {...fp} fill={mainColor}>R</text>
      <text x={aX} y={y} {...fp} fill={teal}  clipPath={`url(#${uid}au)`}>A</text>
      <text x={aX} y={y} {...fp} fill={red}   clipPath={`url(#${uid}al)`}>A</text>
      <text x={aX} y={y} {...fp} fill={amber} clipPath={`url(#${uid}ar)`}>A</text>
      <text x={aX + aW} y={y} {...fp} fill={mainColor}>LD</text>
    </svg>
  );
}
