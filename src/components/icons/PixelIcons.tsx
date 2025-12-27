import { motion } from "framer-motion";

interface PixelIconProps {
  className?: string;
  size?: number;
  color?: "charcoal" | "blue" | "orange" | "yellow";
}

// 24x24 pixel grid icons rendered as SVG
const getColor = (color: "charcoal" | "blue" | "orange" | "yellow" = "charcoal") => {
  switch (color) {
    case "blue": return "#5A72A0";
    case "orange": return "#D4854A";
    case "yellow": return "#C9B463";
    default: return "#1C1C1E";
  }
};

export const PixelSun = ({ className, size = 24, color = "charcoal" }: PixelIconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className} style={{ imageRendering: "pixelated" }}>
    <rect x="11" y="2" width="2" height="3" fill={getColor(color)} />
    <rect x="11" y="19" width="2" height="3" fill={getColor(color)} />
    <rect x="2" y="11" width="3" height="2" fill={getColor(color)} />
    <rect x="19" y="11" width="3" height="2" fill={getColor(color)} />
    <rect x="4" y="4" width="2" height="2" fill={getColor(color)} />
    <rect x="18" y="4" width="2" height="2" fill={getColor(color)} />
    <rect x="4" y="18" width="2" height="2" fill={getColor(color)} />
    <rect x="18" y="18" width="2" height="2" fill={getColor(color)} />
    <rect x="9" y="7" width="6" height="2" fill={getColor(color)} />
    <rect x="7" y="9" width="2" height="6" fill={getColor(color)} />
    <rect x="15" y="9" width="2" height="6" fill={getColor(color)} />
    <rect x="9" y="15" width="6" height="2" fill={getColor(color)} />
    <rect x="9" y="9" width="6" height="6" fill={getColor(color)} opacity="0.3" />
  </svg>
);

export const PixelMoon = ({ className, size = 24, color = "charcoal" }: PixelIconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className} style={{ imageRendering: "pixelated" }}>
    <rect x="10" y="3" width="6" height="2" fill={getColor(color)} />
    <rect x="8" y="5" width="2" height="2" fill={getColor(color)} />
    <rect x="6" y="7" width="2" height="4" fill={getColor(color)} />
    <rect x="6" y="13" width="2" height="4" fill={getColor(color)} />
    <rect x="8" y="17" width="2" height="2" fill={getColor(color)} />
    <rect x="10" y="19" width="6" height="2" fill={getColor(color)} />
    <rect x="16" y="5" width="2" height="2" fill={getColor(color)} />
    <rect x="16" y="17" width="2" height="2" fill={getColor(color)} />
    <rect x="14" y="7" width="2" height="2" fill={getColor(color)} />
    <rect x="12" y="9" width="2" height="2" fill={getColor(color)} />
    <rect x="12" y="13" width="2" height="2" fill={getColor(color)} />
    <rect x="14" y="15" width="2" height="2" fill={getColor(color)} />
  </svg>
);

export const PixelInstagram = ({ className, size = 24, color = "charcoal" }: PixelIconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className} style={{ imageRendering: "pixelated" }}>
    {/* Outer rounded square */}
    <rect x="4" y="4" width="16" height="16" fill={getColor(color)} />
    <rect x="6" y="6" width="12" height="12" fill="#F9F8F5" />
    {/* Inner circle (lens) */}
    <rect x="9" y="9" width="6" height="6" fill={getColor(color)} />
    <rect x="10" y="10" width="4" height="4" fill="#F9F8F5" />
    <rect x="11" y="11" width="2" height="2" fill={getColor(color)} />
    {/* Flash dot */}
    <rect x="16" y="6" width="2" height="2" fill={getColor(color)} />
  </svg>
);

export const PixelFloppy = ({ className, size = 24, color = "charcoal" }: PixelIconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className} style={{ imageRendering: "pixelated" }}>
    <rect x="4" y="3" width="16" height="18" fill={getColor(color)} />
    <rect x="6" y="3" width="10" height="6" fill="#F9F8F5" />
    <rect x="12" y="4" width="2" height="4" fill={getColor(color)} />
    <rect x="6" y="13" width="12" height="6" fill="#F9F8F5" />
    <rect x="8" y="15" width="8" height="1" fill={getColor(color)} opacity="0.3" />
    <rect x="8" y="17" width="6" height="1" fill={getColor(color)} opacity="0.3" />
  </svg>
);

export const PixelEye = ({ className, size = 24, color = "charcoal" }: PixelIconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className} style={{ imageRendering: "pixelated" }}>
    <rect x="6" y="8" width="12" height="2" fill={getColor(color)} />
    <rect x="4" y="10" width="2" height="4" fill={getColor(color)} />
    <rect x="18" y="10" width="2" height="4" fill={getColor(color)} />
    <rect x="6" y="14" width="12" height="2" fill={getColor(color)} />
    <rect x="6" y="10" width="12" height="4" fill={getColor(color)} opacity="0.2" />
    <rect x="10" y="10" width="4" height="4" fill={getColor(color)} />
    <rect x="11" y="11" width="2" height="2" fill="#F9F8F5" />
  </svg>
);

export const PixelHourglass = ({ className, size = 24, color = "charcoal" }: PixelIconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className} style={{ imageRendering: "pixelated" }}>
    <rect x="6" y="3" width="12" height="2" fill={getColor(color)} />
    <rect x="6" y="19" width="12" height="2" fill={getColor(color)} />
    <rect x="8" y="5" width="8" height="2" fill={getColor(color)} />
    <rect x="10" y="7" width="4" height="2" fill={getColor(color)} />
    <rect x="11" y="9" width="2" height="2" fill={getColor(color)} />
    <rect x="11" y="13" width="2" height="2" fill={getColor(color)} />
    <rect x="10" y="15" width="4" height="2" fill={getColor(color)} />
    <rect x="8" y="17" width="8" height="2" fill={getColor(color)} />
    {/* Sand */}
    <rect x="10" y="5" width="4" height="1" fill={getColor(color)} opacity="0.4" />
    <rect x="10" y="17" width="4" height="1" fill={getColor(color)} opacity="0.4" />
  </svg>
);

export const PixelArrow = ({ className, size = 24, color = "charcoal" }: PixelIconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className} style={{ imageRendering: "pixelated" }}>
    <rect x="4" y="11" width="12" height="2" fill={getColor(color)} />
    <rect x="14" y="9" width="2" height="2" fill={getColor(color)} />
    <rect x="16" y="7" width="2" height="2" fill={getColor(color)} />
    <rect x="14" y="13" width="2" height="2" fill={getColor(color)} />
    <rect x="16" y="15" width="2" height="2" fill={getColor(color)} />
    <rect x="18" y="11" width="2" height="2" fill={getColor(color)} />
  </svg>
);

export const PixelCheck = ({ className, size = 24, color = "charcoal" }: PixelIconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className} style={{ imageRendering: "pixelated" }}>
    <rect x="6" y="12" width="2" height="2" fill={getColor(color)} />
    <rect x="8" y="14" width="2" height="2" fill={getColor(color)} />
    <rect x="10" y="16" width="2" height="2" fill={getColor(color)} />
    <rect x="12" y="14" width="2" height="2" fill={getColor(color)} />
    <rect x="14" y="12" width="2" height="2" fill={getColor(color)} />
    <rect x="16" y="10" width="2" height="2" fill={getColor(color)} />
    <rect x="18" y="8" width="2" height="2" fill={getColor(color)} />
  </svg>
);

export const PixelPin = ({ className, size = 24, color = "charcoal" }: PixelIconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className} style={{ imageRendering: "pixelated" }}>
    <rect x="10" y="4" width="4" height="2" fill={getColor(color)} />
    <rect x="8" y="6" width="8" height="2" fill={getColor(color)} />
    <rect x="8" y="8" width="8" height="4" fill={getColor(color)} />
    <rect x="10" y="12" width="4" height="2" fill={getColor(color)} />
    <rect x="11" y="14" width="2" height="6" fill={getColor(color)} />
    <rect x="9" y="7" width="2" height="2" fill="#F9F8F5" opacity="0.5" />
  </svg>
);

export const PixelClose = ({ className, size = 24, color = "charcoal" }: PixelIconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className} style={{ imageRendering: "pixelated" }}>
    <rect x="6" y="6" width="2" height="2" fill={getColor(color)} />
    <rect x="8" y="8" width="2" height="2" fill={getColor(color)} />
    <rect x="10" y="10" width="4" height="4" fill={getColor(color)} />
    <rect x="14" y="8" width="2" height="2" fill={getColor(color)} />
    <rect x="16" y="6" width="2" height="2" fill={getColor(color)} />
    <rect x="6" y="16" width="2" height="2" fill={getColor(color)} />
    <rect x="8" y="14" width="2" height="2" fill={getColor(color)} />
    <rect x="14" y="14" width="2" height="2" fill={getColor(color)} />
    <rect x="16" y="16" width="2" height="2" fill={getColor(color)} />
  </svg>
);

// Animated Eye component for Agent screen
export const AnimatedPixelEye = ({ className, size = 64 }: PixelIconProps) => (
  <motion.div
    animate={{ y: [0, -4, 0] }}
    transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
    className={className}
  >
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ imageRendering: "pixelated" }}>
      <rect x="4" y="8" width="16" height="2" fill="#1C1C1E" />
      <rect x="2" y="10" width="2" height="4" fill="#1C1C1E" />
      <rect x="20" y="10" width="2" height="4" fill="#1C1C1E" />
      <rect x="4" y="14" width="16" height="2" fill="#1C1C1E" />
      <rect x="4" y="10" width="16" height="4" fill="#1C1C1E" opacity="0.15" />
      {/* Pupil */}
      <motion.g
        animate={{ x: [-1, 1, -1] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      >
        <rect x="10" y="10" width="4" height="4" fill="#1C1C1E" />
        <rect x="11" y="11" width="2" height="2" fill="#F9F8F5" />
      </motion.g>
    </svg>
  </motion.div>
);

// Animated Penguin typing on computer
export const AnimatedPixelPenguin = ({ className, size = 160 }: { className?: string; size?: number }) => (
  <div className={className}>
    <svg width={size} height={size} viewBox="0 0 64 64" style={{ imageRendering: "pixelated" }}>
      {/* Computer/Monitor */}
      <rect x="8" y="38" width="28" height="20" fill="#1C1C1E" />
      <rect x="10" y="40" width="24" height="14" fill="#F9F8F5" />
      <rect x="18" y="58" width="8" height="2" fill="#1C1C1E" />
      <rect x="14" y="60" width="16" height="2" fill="#1C1C1E" />
      
      {/* Screen content - blinking cursor */}
      <motion.rect
        x="12" y="42" width="4" height="2"
        fill="#1C1C1E"
        animate={{ opacity: [1, 0, 1] }}
        transition={{ duration: 0.8, repeat: Infinity }}
      />
      <rect x="12" y="46" width="16" height="1" fill="#1C1C1E" opacity="0.3" />
      <rect x="12" y="49" width="12" height="1" fill="#1C1C1E" opacity="0.3" />
      
      {/* Keyboard */}
      <rect x="8" y="56" width="28" height="4" fill="#1C1C1E" />
      <rect x="10" y="57" width="2" height="2" fill="#F9F8F5" opacity="0.3" />
      <rect x="14" y="57" width="2" height="2" fill="#F9F8F5" opacity="0.3" />
      <rect x="18" y="57" width="2" height="2" fill="#F9F8F5" opacity="0.3" />
      <rect x="22" y="57" width="2" height="2" fill="#F9F8F5" opacity="0.3" />
      <rect x="26" y="57" width="2" height="2" fill="#F9F8F5" opacity="0.3" />
      <rect x="30" y="57" width="2" height="2" fill="#F9F8F5" opacity="0.3" />
      
      {/* Penguin Body */}
      <rect x="38" y="24" width="16" height="20" fill="#1C1C1E" />
      <rect x="40" y="28" width="12" height="12" fill="#F9F8F5" />
      
      {/* Penguin Head */}
      <rect x="40" y="12" width="12" height="12" fill="#1C1C1E" />
      
      {/* Eyes */}
      <rect x="42" y="16" width="2" height="2" fill="#F9F8F5" />
      <rect x="48" y="16" width="2" height="2" fill="#F9F8F5" />
      
      {/* Beak */}
      <rect x="45" y="20" width="4" height="2" fill="#E8A838" />
      <rect x="46" y="22" width="2" height="1" fill="#E8A838" />
      
      {/* Feet */}
      <rect x="40" y="44" width="4" height="2" fill="#E8A838" />
      <rect x="48" y="44" width="4" height="2" fill="#E8A838" />
      
      {/* Typing arm/flipper - animated */}
      <motion.g
        animate={{ y: [0, 2, 0] }}
        transition={{ duration: 0.3, repeat: Infinity, ease: "easeInOut" }}
      >
        <rect x="36" y="32" width="4" height="8" fill="#1C1C1E" />
        <rect x="32" y="38" width="6" height="4" fill="#1C1C1E" />
      </motion.g>
      
      {/* Static arm */}
      <rect x="52" y="30" width="4" height="10" fill="#1C1C1E" />
    </svg>
  </div>
);
