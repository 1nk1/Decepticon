import type { Command } from "../commands/types.js";

export interface Completion {
  readonly value: string;
  readonly description: string;
  /** Optional argument hint shown next to the description in the menu. */
  readonly hint?: string;
}

export function completions(value: string, commands: readonly Command[]): readonly Completion[] {
  if (!value.startsWith("/") || value.includes("\n")) return [];
  const space = value.indexOf(" ");
  if (space >= 0) {
    const name = value.slice(1, space).toLowerCase();
    const command = commands.find((item) => item.name === name || item.aliases?.includes(name));
    return (command?.complete?.(value.slice(space + 1)) ?? []).map((arg) => ({
      value: `${value.slice(0, space)} ${arg}`, description: command?.description ?? "", hint: command?.argumentHint,
    }));
  }
  return commands.filter((command) => !command.isHidden)
    .flatMap((command) => [command.name, ...(command.aliases ?? [])].map((name) => ({
      value: `/${name}`,
      description: name === command.name ? command.description : `${command.description} (/${command.name})`,
      hint: command.argumentHint,
    })))
    .filter((choice) => choice.value.startsWith(value))
    .sort((left, right) => Number(right.value === value) - Number(left.value === value));
}

export function completedInput(value: string, choices: readonly Completion[], selected: number): string {
  if (value.endsWith(" ")) return value;
  // Literal exact matches win over another command sharing their prefix.
  return choices.some((choice) => choice.value === value) ? value : choices[selected]?.value ?? value;
}
