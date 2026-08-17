declare module "screenshot-desktop" {
  interface ScreenshotOptions {
    format?: "png" | "jpg";
    screen?: number | string;
    filename?: string;
  }
  interface Display {
    id: number | string;
    name: string;
  }
  function screenshot(opts?: ScreenshotOptions): Promise<Buffer>;
  namespace screenshot {
    function listDisplays(): Promise<Display[]>;
  }
  export = screenshot;
}
