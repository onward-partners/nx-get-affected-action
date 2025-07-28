import * as exec from '@actions/exec';

export type CommandWrapper = (
  args?: string[],
  options?: exec.ExecOptions,
) => Promise<string[]>

export class CommandBuilder {
  private command = '';
  private args: string[] = [];

  build(): CommandWrapper {
    if (!this.command) {
      throw new Error('No command given to CommandWrapper');
    }

    return async (args?: string[], options?: exec.ExecOptions) => {
      let result = '';
      await exec.exec(
        this.command,
        [...this.args, ...(args ?? [])]
          .filter(arg => arg.length > 0)
          .map(arg => arg.trim()),
        {
          ...options,
          listeners: {
            stdout: data => result += data.toString(),
          },
        },
      );

      return result.split('\n');
    };
  }

  withCommand(command: string): this {
    this.command = command;
    return this;
  }

  withArgs(...args: string[]): this {
    Array.prototype.push.apply(this.args, args);
    return this;
  }
}
