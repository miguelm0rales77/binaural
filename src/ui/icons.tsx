/** Iconos lineales (trazo 1,5 px, esquinas redondeadas), como pide la marca: nada de iconos rellenos ni emojis. */
const Svg = ({ children }: { children: React.ReactNode }) => (
  <svg className="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    {children}
  </svg>
)

export const AlertIcon = () => (
  <Svg>
    <path d="M12 3.5 2.8 19.5h18.4L12 3.5Z" />
    <path d="M12 10v4.5" />
    <path d="M12 17.2v.1" />
  </Svg>
)

export const CloseIcon = () => (
  <Svg>
    <path d="M6 6l12 12M18 6 6 18" />
  </Svg>
)

export const ArrowLeftIcon = () => (
  <Svg>
    <path d="M19 12H5M11 6l-6 6 6 6" />
  </Svg>
)
