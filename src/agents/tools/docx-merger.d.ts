declare module "docx-merger" {
  interface DocxMergerOptions {
    pageBreak?: boolean;
    style?: "source" | "destination";
  }

  class DocxMerger {
    constructor(options: DocxMergerOptions, files: (string | Buffer | ArrayBuffer)[]);
    save(type: "nodebuffer", callback: (data: Buffer) => void): void;
    save(type: "blob", callback: (data: Blob) => void): void;
  }

  export = DocxMerger;
}
