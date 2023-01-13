const {
    app,
    BrowserWindow,
    desktopCapturer,
    ipcMain,
    Menu,
    shell, dialog
} = require('electron')
const path = require('path')

const cors = require('cors')
const express = require('express');
const expressApp = express();
const { screen } = require('electron')



let availableScreens
let mainWindow
let clientSelectedScreen
let displays

const { createServer } = require('http')
const { Server } = require('socket.io')

expressApp.use(express.static(__dirname));

expressApp.get('/', function (req, res, next) {
    console.log('req path...', req.path)
    res.sendFile(path.join(__dirname, 'index.html'));
});

expressApp.set('port', 4000)
expressApp.use(cors({ origin: '*' }))

expressApp.use(function (req, res, next) {
    // Website you wish to allow to connect
    res.setHeader('Access-Control-Allow-Origin', '*');
    // Request methods you wish to allow
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
    // Request headers you wish to allow
    res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type');
    // Set to true if you need the website to include cookies in the requests sent
    // to the API (e.g. in case you use sessions)
    res.setHeader('Access-Control-Allow-Credentials', true);
    // Pass to next layer of middleware
    next();
})

const httpServer = createServer(expressApp)
httpServer.listen(4000, '0.0.0.0')
httpServer.on('error', e => console.log('error'))
httpServer.on('listening', () => console.log('listening.....'))
const io = new Server(httpServer, {
    origin: '*',
})

const connections = io.of('/remote-ctrl')

connections.on('connection', socket => {
    console.log('connection established')

    socket.on('offer', sdp => {
        console.log('routing offer')
        // send to the electron app
        socket.broadcast.emit('offer', sdp)
    })

    socket.on('answer', sdp => {
        console.log('routing answer')
        // send to the electron app
        socket.broadcast.emit('answer', sdp)
    })

    socket.on('icecandidate', icecandidate => {
        socket.broadcast.emit('icecandidate', icecandidate)
    })

    socket.on('selectedScreen', selectedScreen => {
        clientSelectedScreen = selectedScreen

        socket.broadcast.emit('selectedScreen', clientSelectedScreen)
    })
})






if (process.defaultApp) {
    if (process.argv.length >= 2) {
        app.setAsDefaultProtocolClient('electron-fiddle', process.execPath, [path.resolve(process.argv[1])])
    }
} else {
    app.setAsDefaultProtocolClient('electron-fiddle')
}

const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
    app.quit()
} else {
    app.on('second-instance', (event, commandLine, workingDirectory) => {
        // Someone tried to run a second instance, we should focus our window.
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore()
            mainWindow.focus()
        }
    })

    // Create mainWindow, load the rest of the app, etc...
    app.whenReady().then(() => {
        createWindow()
    })

    app.on('open-url', (event, url) => {
        dialog.showErrorBox('Welcome Back', `You arrived from: ${url}`)
    })
}

const sendSelectedScreen = (item) => {
    // const displaySize = displays.filter(display => `${display.id}` === item.display_id).size

    // mainWindow.webContents.send('SET_SOURCE_ID', {
    //     id: item.id,
    //     displaySize,
    // })
    mainWindow.webContents.send('SET_SOURCE_ID', { id: item.id })


}

const createTray = () => {
    const screensMenu = availableScreens.map(item => {
        return {
            label: item.name,
            click: () => {
                sendSelectedScreen(item)
            }
        }
    })

    const menu = Menu.buildFromTemplate([
        {
            label: app.name,
            submenu: [
                { role: 'quit' }
            ]
        },
        {
            label: 'Screens',
            submenu: screensMenu
        }
    ])

    Menu.setApplicationMenu(menu)
}
const createWindow = () => {
    mainWindow = new BrowserWindow({
        show: false,
        width: 800,
        height: 600,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js')
        }
    })

    ipcMain.on('set-size', (event, size) => {
        const { width, height } = size
        try {
            console.log('electron dim..', width, height)
            // mainWindow.setSize(width, height || 500, true)
            // !isNaN(height) && mainWindow.setSize(width, height, false)
            mainWindow.setSize(width, height, true)

        } catch (e) {
            console.log(e)
        }
    })

    mainWindow.loadURL('https://80d4-2402-9d80-41d-38c9-b589-89e4-6c05-cd91.ap.ngrok.io/')

    mainWindow.once('ready-to-show', () => {
        displays = screen.getAllDisplays()

        mainWindow.show()
        mainWindow.setPosition(0, 0)

        desktopCapturer.getSources({
            types: ['screen', 'window']
            // types: ['window', 'screen']
        }).then(sources => {
            sendSelectedScreen(sources[0])
            availableScreens = sources
            createTray()
            // for (const source of sources) {
            //     console.log(sources)
            //     if (source.name === 'Screen 1') {
            //         mainWindow.webContents.send('SET_SOURCE_ID', source.id)
            //         return
            //     }
            // }
        })
    })

    mainWindow.webContents.openDevTools()
}

app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') app.quit()
})

// Handle window controls via IPC
ipcMain.on('shell:open', () => {
    const pageDirectory = __dirname.replace('app.asar', 'app.asar.unpacked')
    const pagePath = path.join('file://', pageDirectory, 'index.html')
    shell.openExternal(pagePath)
})