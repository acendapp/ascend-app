import React from 'react';
import { useTheme } from '../lib/theme';

interface AscendBoltProps {
  size?: number;
}

const AscendBolt: React.FC<AscendBoltProps> = ({ size = 120 }) => {
  const { colors: c } = useTheme()
  return (
    <svg
      width={size}
      height={size * 1.4}
      viewBox="8.5 0 100 140"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block' }}
    >
      <polygon
        points="58,0 30,65 50,65 22,140 90,55 66,55 95,0"
        fill={c.accent}
      />
    </svg>
  );
};

export default AscendBolt;
