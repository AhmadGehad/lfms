export interface PwaIconSpec {
  fileName: string;
  source: string;
  contentType: string;
  /** Pixel size for square PNG icons; absent for the multi-size .ico and the SVG. */
  size?: number;
}

export declare const PWA_ICONS: readonly PwaIconSpec[];

export declare function buildPwaIcons(): Array<{ fileName: string; contentType: string; contents: Buffer }>;
