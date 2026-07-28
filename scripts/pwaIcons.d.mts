export interface PwaIconOptions {
  /** Corner radius as a fraction of the output size; 0 gives a full-bleed tile. */
  cornerRadius?: number;
  /** Shrinks the artwork toward the centre, for maskable safe zones. */
  glyphScale?: number;
}

export interface PwaIconSpec {
  fileName: string;
  size: number;
  options: PwaIconOptions;
}

export declare function renderIcon(size: number, options?: PwaIconOptions): Buffer;

export declare const PWA_ICONS: readonly PwaIconSpec[];

export declare function buildPwaIcons(): Array<{ fileName: string; contents: Buffer }>;
