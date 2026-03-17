// Declaration file for bcrypt module
declare module 'bcrypt' {
  export function hashSync(s: string, salt: number): string;
  export function compareSync(s: string, hash: string): boolean;
  export function hash(s: string, salt: number): Promise<string>;
  export function compare(s: string, hash: string): Promise<boolean>;
}
