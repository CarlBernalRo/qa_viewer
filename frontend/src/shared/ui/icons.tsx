import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

function Svg({ children, ...props }: IconProps) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export const IconSessions = (props: IconProps) => (
  <Svg {...props}>
    <circle cx="10" cy="10" r="7" />
    <circle cx="10" cy="10" r="3" fill="currentColor" stroke="none" />
  </Svg>
);

export const IconPlus = (props: IconProps) => (
  <Svg {...props}>
    <path d="M10 4v12M4 10h12" />
  </Svg>
);

export const IconChevronLeft = (props: IconProps) => (
  <Svg {...props}>
    <path d="M12 4l-6 6 6 6" />
  </Svg>
);

export const IconChevronRight = (props: IconProps) => (
  <Svg {...props}>
    <path d="M8 4l6 6-6 6" />
  </Svg>
);

export const IconTrash = (props: IconProps) => (
  <Svg {...props}>
    <path d="M4 6h12M8 6V4h4v2M6 6l1 10h6l1-10" />
  </Svg>
);

export const IconSearch = (props: IconProps) => (
  <Svg {...props}>
    <circle cx="9" cy="9" r="5.5" />
    <path d="M13 13l4 4" />
  </Svg>
);

export const IconAlert = (props: IconProps) => (
  <Svg {...props}>
    <path d="M10 3l8 14H2L10 3z" />
    <path d="M10 8v4M10 14.5v.5" />
  </Svg>
);

export const IconExpand = (props: IconProps) => (
  <Svg {...props}>
    <path d="M4 8V4h4M16 8V4h-4M4 12v4h4M16 12v4h-4" />
  </Svg>
);

export const IconCopy = (props: IconProps) => (
  <Svg {...props}>
    <rect x="7" y="7" width="9" height="9" rx="1.5" />
    <path d="M13 7V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h2" />
  </Svg>
);

export const IconAgents = (props: IconProps) => (
  <Svg {...props}>
    <circle cx="10" cy="5" r="2.2" />
    <circle cx="4.5" cy="15" r="2.2" />
    <circle cx="15.5" cy="15" r="2.2" />
    <path d="M10 7.2v3.3M10 10.5l-4 2.8M10 10.5l4 2.8" />
  </Svg>
);

export const IconEnvironments = (props: IconProps) => (
  <Svg {...props}>
    <path d="M10 3l7 4-7 4-7-4 7-4z" />
    <path d="M3 11l7 4 7-4" />
  </Svg>
);

export const IconCompare = (props: IconProps) => (
  <Svg {...props}>
    <path d="M4 7h11l-3-3M16 13H5l3 3" />
  </Svg>
);

export const IconSettings = (props: IconProps) => (
  <Svg {...props}>
    <path d="M3 6h14M3 14h14" />
    <circle cx="7" cy="6" r="2" fill="var(--ground, #F1F2EF)" />
    <circle cx="13" cy="14" r="2" fill="var(--ground, #F1F2EF)" />
  </Svg>
);

export const IconProjects = (props: IconProps) => (
  <Svg {...props}>
    <rect x="3" y="7" width="14" height="9" rx="1.5" />
    <path d="M7 7V5.5A1.5 1.5 0 0 1 8.5 4h3A1.5 1.5 0 0 1 13 5.5V7" />
    <path d="M3 11h14" />
  </Svg>
);
