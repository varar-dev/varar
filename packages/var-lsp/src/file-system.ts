export interface FileSystem {
  list(globs: readonly string[]): Promise<string[]>
  read(path: string): Promise<string>
  write(path: string, content: string): Promise<void>
}
