import type { SVGProps } from 'react'

export type IconName =
  | 'new'
  | 'open'
  | 'save'
  | 'download'
  | 'heading'
  | 'bold'
  | 'italic'
  | 'link'
  | 'code'
  | 'math'
  | 'quote'
  | 'list'
  | 'sun'
  | 'focus'
  | 'page'
  | 'spacing'
  | 'settings'
  | 'source'
  | 'minimize'
  | 'maximize'
  | 'close'

const paths: Record<IconName, string> = {
  new: 'M12 5v14M5 12h14',
  open: 'M3.5 7.5h6l2-2h9v13h-17zM3.5 10h17',
  save: 'M5 3.5h12l3 3v14H4v-16zM8 3.5v6h8v-6M8 20v-7h8v7',
  download: 'M12 3v12m-5-5 5 5 5-5M4 20h16',
  heading: 'M5 5v14M15 5v14M5 12h10M19 9v10m-3 0h6',
  bold: 'M7 4h6a4 4 0 0 1 0 8H7zm0 8h7a4 4 0 0 1 0 8H7z',
  italic: 'M10 4h8M6 20h8M14 4 10 20',
  link: 'M9.5 14.5 14.5 9M7 17H5a4 4 0 0 1 0-8h4M17 7h2a4 4 0 0 1 0 8h-4',
  code: 'm8 8-4 4 4 4m8-8 4 4-4 4m-2-11-4 14',
  math: 'M18 5H7l5 7-5 7h11',
  quote: 'M5 7h5v5H6v5H3v-5a5 5 0 0 1 2-5m10 0h5v5h-4v5h-3v-5a5 5 0 0 1 2-5',
  list: 'M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01',
  sun: 'M12 4V2m0 20v-2m8-8h2M2 12h2m13.7-5.7 1.4-1.4M4.9 19.1l1.4-1.4m11.4 0 1.4 1.4M4.9 4.9l1.4 1.4M17 12a5 5 0 1 1-10 0 5 5 0 0 1 10 0',
  focus: 'M8 3H3v5m13-5h5v5M8 21H3v-5m13 5h5v-5',
  page: 'M6 3h9l3 3v15H6zM15 3v4h4',
  spacing: 'M4 7h16M4 17h16M8 4 4 7l4 3m8-6 4 3-4 3m-8 4-4 3 4 3m8-6 4 3-4 3',
  settings: 'M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  source: 'M8 6 3 12l5 6m8-12 5 6-5 6M14 3l-4 18',
  minimize: 'M5 12h14',
  maximize: 'M5 5h14v14H5z',
  close: 'm6 6 12 12M18 6 6 18',
}

export function Icon({
  name,
  ...props
}: SVGProps<SVGSVGElement> & { name: IconName }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d={paths[name]} />
    </svg>
  )
}
