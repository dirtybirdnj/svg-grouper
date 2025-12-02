import { app, BrowserWindow, ipcMain, Menu, dialog, MenuItemConstructorOptions } from 'electron'
import { spawn } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'
import { registerFillGeneratorIPC } from './fillGenerator'

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

// IPC Handler for SVG normalization (transforms coordinates so viewBox starts at 0,0)
ipcMain.handle('normalize-svg', async (_event, args: { svg: string }) => {
  return new Promise<string>((resolve, reject) => {
    try {
      const { svg } = args

      if (!svg || typeof svg !== 'string') {
        reject(new Error('Invalid SVG input'))
        return
      }

      const scriptPath = app.isPackaged
        ? path.join(process.resourcesPath, 'scripts', 'normalize_svg.py')
        : path.join(__dirname, '..', 'scripts', 'normalize_svg.py')

      const python = spawn('/opt/homebrew/bin/python3', [scriptPath], {
        maxBuffer: 100 * 1024 * 1024  // 100MB buffer for large SVGs
      })

      let output = ''
      let errorOutput = ''

      python.stdout.on('data', (data) => {
        output += data.toString()
      })

      python.stderr.on('data', (data) => {
        errorOutput += data.toString()
      })

      python.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`Normalize failed with code ${code}: ${errorOutput}`))
        } else {
          resolve(output)
        }
      })

      python.on('error', (err) => {
        console.error(`[normalize-svg] Process error:`, err)
        reject(new Error(`Failed to start Python: ${err.message}`))
      })

      try {
        python.stdin.write(svg, (err) => {
          if (err) {
            console.error(`[normalize-svg] Error writing to stdin:`, err)
            reject(new Error(`Failed to write SVG to stdin: ${err.message}`))
          }
        })
        python.stdin.end()
      } catch (writeError) {
        console.error(`[normalize-svg] Exception writing to stdin:`, writeError)
        reject(new Error(`Exception writing to stdin: ${writeError instanceof Error ? writeError.message : 'Unknown error'}`))
      }
    } catch (err) {
      console.error(`[normalize-svg] Unexpected error:`, err)
      reject(new Error(`Unexpected error: ${err instanceof Error ? err.message : 'Unknown error'}`))
    }
  })
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

      const scriptPath = app.isPackaged
        ? path.join(process.resourcesPath, 'scripts', 'flatten_shapes.py')
        : path.join(__dirname, '..', 'scripts', 'flatten_shapes.py')

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
        if (code !== 0) {
          reject(new Error(`Flatten failed with code ${code}: ${errorOutput}`))
        } else {
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

      // Path to Python script (in development vs production)
      const scriptPath = app.isPackaged
        ? path.join(process.resourcesPath, 'scripts', 'crop_svg.py')
        : path.join(__dirname, '..', 'scripts', 'crop_svg.py')

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
      })

      // Handle process completion
      python.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`vpype failed with code ${code}: ${errorOutput}`))
        } else {
          resolve(output)
        }
      })

      // Handle process errors
      python.on('error', (err) => {
        console.error(`[crop-svg] Process spawn error:`, err)
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

// IPC Handler for exporting multiple files to a directory
ipcMain.handle('export-multiple-files', async (_event, args: { files: { name: string; content: string }[]; baseName: string }) => {
  try {
    const { files, baseName } = args

    if (!files || !Array.isArray(files) || files.length === 0) {
      return { success: false, error: 'No files to export' }
    }

    // Show directory picker dialog
    const result = await dialog.showOpenDialog(win!, {
      title: 'Select Export Folder',
      properties: ['openDirectory', 'createDirectory'],
      buttonLabel: 'Export Here'
    })

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, error: 'Export cancelled' }
    }

    const selectedDir = result.filePaths[0]

    // Create a subfolder with the base name
    const exportDir = path.join(selectedDir, baseName)

    // Create the directory if it doesn't exist
    if (!fs.existsSync(exportDir)) {
      fs.mkdirSync(exportDir, { recursive: true })
    }

    // Save each file
    const savedFiles: string[] = []
    for (const file of files) {
      const filePath = path.join(exportDir, file.name)
      fs.writeFileSync(filePath, file.content, 'utf-8')
      savedFiles.push(filePath)
    }

    return { success: true, exportDir, savedFiles }
  } catch (err) {
    console.error(`[export-multiple-files] Error:`, err)
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
})

// Send menu command to renderer
function sendMenuCommand(command: string) {
  if (win) {
    win.webContents.send('menu-command', command)
  }
}

// Create application menu
function createMenu() {
  const isMac = process.platform === 'darwin'

  const template: MenuItemConstructorOptions[] = [
    // App menu (macOS only)
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about' as const },
        { type: 'separator' as const },
        { role: 'services' as const },
        { type: 'separator' as const },
        { role: 'hide' as const },
        { role: 'hideOthers' as const },
        { role: 'unhide' as const },
        { type: 'separator' as const },
        { role: 'quit' as const }
      ]
    }] : []),

    // File menu
    {
      label: 'File',
      submenu: [
        {
          label: 'Open SVG...',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            const result = await dialog.showOpenDialog(win!, {
              properties: ['openFile'],
              filters: [{ name: 'SVG Files', extensions: ['svg'] }]
            })
            if (!result.canceled && result.filePaths.length > 0) {
              const filePath = result.filePaths[0]
              const content = fs.readFileSync(filePath, 'utf-8')
              const fileName = path.basename(filePath)
              win?.webContents.send('file-opened', { content, fileName, filePath })
            }
          }
        },
        { type: 'separator' as const },
        {
          label: 'Export SVG...',
          accelerator: 'CmdOrCtrl+E',
          click: () => sendMenuCommand('export')
        },
        { type: 'separator' as const },
        isMac ? { role: 'close' as const } : { role: 'quit' as const }
      ]
    },

    // Edit menu
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' as const },
        { role: 'redo' as const },
        { type: 'separator' as const },
        { role: 'cut' as const },
        { role: 'copy' as const },
        { role: 'paste' as const },
        { role: 'selectAll' as const }
      ]
    },

    // Arrange menu
    {
      label: 'Arrange',
      submenu: [
        {
          label: 'Move Up',
          accelerator: 'CmdOrCtrl+[',
          click: () => sendMenuCommand('arrange-move-up')
        },
        {
          label: 'Move Down',
          accelerator: 'CmdOrCtrl+]',
          click: () => sendMenuCommand('arrange-move-down')
        },
        { type: 'separator' as const },
        {
          label: 'Bring to Front',
          accelerator: 'CmdOrCtrl+Shift+[',
          click: () => sendMenuCommand('arrange-bring-front')
        },
        {
          label: 'Send to Back',
          accelerator: 'CmdOrCtrl+Shift+]',
          click: () => sendMenuCommand('arrange-send-back')
        },
        { type: 'separator' as const },
        {
          label: 'Group',
          accelerator: 'CmdOrCtrl+G',
          click: () => sendMenuCommand('arrange-group')
        },
        {
          label: 'Ungroup',
          accelerator: 'CmdOrCtrl+Shift+G',
          click: () => sendMenuCommand('arrange-ungroup')
        }
      ]
    },

    // Tools menu
    {
      label: 'Tools',
      submenu: [
        {
          label: 'Flatten Layers',
          accelerator: 'CmdOrCtrl+Shift+F',
          click: () => sendMenuCommand('flatten')
        },
        {
          label: 'Fill Selected',
          accelerator: 'CmdOrCtrl+Shift+H',
          click: () => sendMenuCommand('fill')
        },
        {
          label: 'Optimize Order',
          accelerator: 'CmdOrCtrl+Shift+O',
          click: () => sendMenuCommand('order')
        },
        { type: 'separator' as const },
        {
          label: 'Toggle Crop Overlay',
          accelerator: 'CmdOrCtrl+Shift+C',
          click: () => sendMenuCommand('crop')
        },
        { type: 'separator' as const },
        {
          label: 'Convert to Fills',
          click: () => sendMenuCommand('convert-to-fills')
        },
        {
          label: 'Normalize Colors',
          click: () => sendMenuCommand('normalize-colors')
        },
        { type: 'separator' as const },
        {
          label: 'Separate Compound Paths',
          click: () => sendMenuCommand('separate-compound-paths')
        }
      ]
    },

    // View menu
    {
      label: 'View',
      submenu: [
        {
          label: 'Sort Tab',
          accelerator: 'CmdOrCtrl+1',
          click: () => sendMenuCommand('tab-sort')
        },
        {
          label: 'Fill Tab',
          accelerator: 'CmdOrCtrl+2',
          click: () => sendMenuCommand('tab-fill')
        },
        {
          label: 'Order Tab',
          accelerator: 'CmdOrCtrl+3',
          click: () => sendMenuCommand('tab-order')
        },
        {
          label: 'Export Tab',
          accelerator: 'CmdOrCtrl+4',
          click: () => sendMenuCommand('tab-export')
        },
        { type: 'separator' as const },
        {
          label: 'Zoom In',
          accelerator: 'CmdOrCtrl+Plus',
          click: () => sendMenuCommand('zoom-in')
        },
        {
          label: 'Zoom Out',
          accelerator: 'CmdOrCtrl+-',
          click: () => sendMenuCommand('zoom-out')
        },
        {
          label: 'Fit to Screen',
          accelerator: 'CmdOrCtrl+0',
          click: () => sendMenuCommand('zoom-fit')
        },
        { type: 'separator' as const },
        { role: 'reload' as const },
        { role: 'forceReload' as const },
        { role: 'toggleDevTools' as const },
        { type: 'separator' as const },
        { role: 'togglefullscreen' as const }
      ]
    },

    // Window menu
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' as const },
        { role: 'zoom' as const },
        ...(isMac ? [
          { type: 'separator' as const },
          { role: 'front' as const }
        ] : [
          { role: 'close' as const }
        ])
      ] as MenuItemConstructorOptions[]
    },

    // Help menu
    {
      role: 'help' as const,
      submenu: [
        {
          label: 'SVG Grouper on GitHub',
          click: async () => {
            const { shell } = require('electron')
            await shell.openExternal('https://github.com/dirtybirdnj/svg-grouper')
          }
        },
        { type: 'separator' as const },
        {
          label: 'About SVG Grouper',
          click: () => {
            dialog.showMessageBox(win!, {
              type: 'info',
              title: 'About SVG Grouper',
              message: 'SVG Grouper v1.0.0',
              detail: 'A desktop app for preparing SVG files for pen plotters.\n\nFeatures:\n• Layer management & organization\n• Fill pattern hatching (lines, wiggle, honeycomb, spiral, gyroid)\n• Path optimization for minimal pen travel\n• Export with page setup and margins\n\nBuilt by Mat Gilbert\nLicense: GPL-3.0\n\nhttps://github.com/dirtybirdnj/svg-grouper',
              buttons: ['OK']
            })
          }
        }
      ]
    }
  ]

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}

app.whenReady().then(() => {
  registerFillGeneratorIPC()
  createMenu()
  createWindow()
})
