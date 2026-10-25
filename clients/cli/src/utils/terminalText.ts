import { stripVTControlCharacters } from "node:util";

/** SGR mouse reports use a private CSI prefix that Node's generic stripper
 * only partially consumes. Remove complete reports before ordinary controls. */
export function terminalText(value: string): string {
  return stripVTControlCharacters(value.replace(/\u001b\[<\d+;\d+;\d+[Mm]/g, ""));
}
