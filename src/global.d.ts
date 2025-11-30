export {}

declare global {
  interface Window {
    electron?: {
      onMainMessage: (callback: (message: string) => void) => void
      cropSVG: (args: { svg: string; x: number; y: number; width: number; height: number }) => Promise<string>
      flattenShapes: (args: { svg: string; color: string }) => Promise<string>
      onMenuCommand: (callback: (command: string) => void) => void
      onFileOpened: (callback: (data: { content: string; fileName: string; filePath: string }) => void) => void
      exportMultipleFiles: (args: { files: { name: string; content: string }[]; baseName: string }) => Promise<{ success: boolean; exportDir?: string; savedFiles?: string[]; error?: string }>
    }
  }
}

// Type declaration for simplify-js
declare module 'simplify-js' {
  interface Point {
    x: number
    y: number
  }
  function simplify<T extends Point>(points: T[], tolerance?: number, highQuality?: boolean): T[]
  export default simplify
}
