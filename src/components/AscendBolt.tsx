interface Props {
  size?: number
}

export default function AscendBolt({ size = 120 }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 200 280"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <polygon
        points="97,20 20,139 90,139 33,260 174,126 116,126 180,20"
        fill="#4A9EFF"
      />
      <polygon
        points="97,20 59,80 74,80 90,139 93,139 140,57"
        fill="#8DCFFF"
        opacity="0.3"
      />
    </svg>
  )
}
