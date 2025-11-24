export {}

declare global {
  interface Window {
    electron: {
      onMainMessage: (callback: (message: string) => void) => void
      cropSVG: (args: { svg: string; x: number; y: number; width: number; height: number }) => Promise<string>
      flattenShapes: (args: { svg: string; color: string }) => Promise<string>
    }
  }
}
