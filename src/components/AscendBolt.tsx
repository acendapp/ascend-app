interface Props {
  size?: number
}

export default function AscendBolt({ size = 120 }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 400 400"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="400" height="400" rx={88} fill="#080E1C" />
      <polygon
        points="340,228 304,340 328,340 292,452 388,312 360,312 396,228"
        fill="#4A9EFF"
      />
      <polygon
        points="340,228 322,284 340,284 328,340 332,340 362,248"
        fill="#8DCFFF"
        opacity="0.3"
      />
    </svg>
  )
}
