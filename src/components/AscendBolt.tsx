import React from 'react';

interface AscendBoltProps {
  size?: number;
  color?: string;
}

const AscendBolt: React.FC<AscendBoltProps> = ({ size = 120, color = '#FF5C00' }) => {
  return (
    <svg
      width={size}
      height={size * 1.4}
      viewBox="0 0 100 140"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block' }}
    >
      <polygon
        points="58,0 30,65 50,65 22,140 90,55 66,55 95,0"
        fill={color}
      />
    </svg>
  );
};

export default AscendBolt;
