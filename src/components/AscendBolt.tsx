import React from 'react';

interface AscendBoltProps {
  size?: number;
}

const AscendBolt: React.FC<AscendBoltProps> = ({ size = 120 }) => {
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
        fill="#4A9EFF"
      />
      <polygon
        points="58,0 42,40 58,40 48,65 50,65 72,10"
        fill="#8DCFFF"
        opacity="0.35"
      />
    </svg>
  );
};

export default AscendBolt;
