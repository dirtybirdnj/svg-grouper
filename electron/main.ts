import { app, BrowserWindow, ipcMain } from 'electron'
import { spawn } from 'node:child_process'
import path from 'node:path'

process.env.DIST = path.join(__dirname, '../dist')
process.env.VITE_PUBLIC = app.isPackaged
  ? process.env.DIST
  : path.join(process.env.DIST, '../public')

let win: BrowserWindow | null

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: path.join(process.env.VITE_PUBLIC, 'electron-vite.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // Test active push message to Renderer-process.
  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', new Date().toLocaleString())
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL)
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(process.env.DIST, 'index.html'))
  }
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

// IPC Handler for SVG flattening
ipcMain.handle('flatten-shapes', async (_event, args: { svg: string; color: string }) => {
  return new Promise<string>((resolve, reject) => {
    try {
      const { svg, color } = args

      if (!svg || typeof svg !== 'string') {
        reject(new Error('Invalid SVG input'))
        return
      }

      if (!color || typeof color !== 'string') {
        reject(new Error('Invalid color'))
        return
      }

      console.log(`[flatten-shapes] Processing SVG of size: ${(svg.length / 1024).toFixed(2)} KB`)
      console.log(`[flatten-shapes] Color: ${color}`)

      const scriptPath = app.isPackaged
        ? path.join(process.resourcesPath, 'scripts', 'flatten_shapes.py')
        : path.join(__dirname, '..', 'scripts', 'flatten_shapes.py')

      console.log(`[flatten-shapes] Script path: ${scriptPath}`)

      const python = spawn('python3', [scriptPath, color], {
        maxBuffer: 50 * 1024 * 1024
      })

      let output = ''
      let errorOutput = ''

      python.stdout.on('data', (data) => {
        output += data.toString()
      })

      python.stderr.on('data', (data) => {
        errorOutput += data.toString()
        console.error(`[flatten-shapes] stderr: ${data.toString()}`)
      })

      python.on('close', (code) => {
        console.log(`[flatten-shapes] Process exited with code ${code}`)
        if (code !== 0) {
          reject(new Error(`Flatten failed with code ${code}: ${errorOutput}`))
        } else {
          console.log(`[flatten-shapes] Output size: ${(output.length / 1024).toFixed(2)} KB`)
          resolve(output)
        }
      })

      python.on('error', (err) => {
        console.error(`[flatten-shapes] Process error:`, err)
        reject(new Error(`Failed to start Python: ${err.message}`))
      })

      try {
        python.stdin.write(svg, (err) => {
          if (err) {
            console.error(`[flatten-shapes] Error writing to stdin:`, err)
            reject(new Error(`Failed to write SVG to stdin: ${err.message}`))
          }
        })
        python.stdin.end()
      } catch (writeError) {
        console.error(`[flatten-shapes] Exception writing to stdin:`, writeError)
        reject(new Error(`Exception writing to stdin: ${writeError instanceof Error ? writeError.message : 'Unknown error'}`))
      }
    } catch (err) {
      console.error(`[flatten-shapes] Unexpected error:`, err)
      reject(new Error(`Unexpected error: ${err instanceof Error ? err.message : 'Unknown error'}`))
    }
  })
})

// IPC Handler for SVG cropping
ipcMain.handle('crop-svg', async (_event, args: { svg: string; x: number; y: number; width: number; height: number }) => {
  return new Promise<string>((resolve, reject) => {
    try {
      const { svg, x, y, width, height } = args

      // Validate inputs
      if (!svg || typeof svg !== 'string') {
        reject(new Error('Invalid SVG input'))
        return
      }

      if (typeof x !== 'number' || typeof y !== 'number' || typeof width !== 'number' || typeof height !== 'number') {
        reject(new Error('Invalid crop dimensions'))
        return
      }

      console.log(`[crop-svg] Processing SVG of size: ${(svg.length / 1024).toFixed(2)} KB`)
      console.log(`[crop-svg] Crop bounds: x=${x}, y=${y}, w=${width}, h=${height}`)

      // Path to Python script (in development vs production)
      const scriptPath = app.isPackaged
        ? path.join(process.resourcesPath, 'scripts', 'crop_svg.py')
        : path.join(__dirname, '..', 'scripts', 'crop_svg.py')

      console.log(`[crop-svg] Script path: ${scriptPath}`)

      // Spawn Python process with vpype
      const pythonArgs = [scriptPath, x.toString(), y.toString(), width.toString(), height.toString()]
      const python = spawn('/opt/homebrew/bin/python3', pythonArgs, {
        maxBuffer: 50 * 1024 * 1024  // 50MB buffer for large SVGs
      })

      let output = ''
      let errorOutput = ''

      // Collect stdout
      python.stdout.on('data', (data) => {
        output += data.toString()
      })

      // Collect stderr
      python.stderr.on('data', (data) => {
        errorOutput += data.toString()
        console.error(`[crop-svg] ${data.toString()}`)
      })

      // Handle process completion
      python.on('close', (code) => {
        console.log(`[crop-svg] Process exited with code ${code}`)
        if (code !== 0) {
          reject(new Error(`vpype failed with code ${code}: ${errorOutput}`))
        } else {
          console.log(`[crop-svg] Output size: ${(output.length / 1024).toFixed(2)} KB`)
          resolve(output)
        }
      })

      // Handle process errors
      python.on('error', (err) => {
        console.error(`[crop-svg] Process error:`, err)
        reject(new Error(`Failed to start Python: ${err.message}`))
      })

      // Write SVG to stdin
      try {
        python.stdin.write(svg, (err) => {
          if (err) {
            console.error(`[crop-svg] Error writing to stdin:`, err)
            reject(new Error(`Failed to write SVG to stdin: ${err.message}`))
          }
        })
        python.stdin.end()
      } catch (writeError) {
        console.error(`[crop-svg] Exception writing to stdin:`, writeError)
        reject(new Error(`Exception writing to stdin: ${writeError instanceof Error ? writeError.message : 'Unknown error'}`))
      }
    } catch (err) {
      console.error(`[crop-svg] Unexpected error:`, err)
      reject(new Error(`Unexpected error: ${err instanceof Error ? err.message : 'Unknown error'}`))
    }
  })
})

app.whenReady().then(createWindow)
