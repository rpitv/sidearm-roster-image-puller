const parser = require('node-html-parser')
const fs = require('fs-extra')
const fetch = require('node-fetch');
const { spawn } = require("child_process");

function printHelp() {
    console.log("Usage: node main.js [sidearm-roster-url] [output-folder] [options]")
    console.log('Options:')
    console.log('\t-s\t\tSlow mode. Saves CPU usage and memory but may take more time.')
    console.log('\t-a=...\t\tAlpha matting level. Defaults to 50. Lower values will')
    console.log('\t\t\tproduce sharper edges but with more of the background')
    console.log('\t\t\tin the image.')
}

function parseArgs() {
    const result = {
        slow: false,
        alphamatting: 40
    }

    for(let i = 3; i < process.argv.length; i++) {
        const arg = process.argv[i]
        if(arg ==='-s') {
            result.slow = true
        } else if (arg.startsWith('-a=')) {
            const val = arg.split('=', 2)
            result.alphamatting = parseInt(val[1])
            if(isNaN(result.alphamatting)) {
                printHelp()
                process.exit(1)
            }
        }
    }
    return result
}

function clearLine() {
    process.stdout.write('\r' + ' '.repeat(process.stdout.columns) + '\r')
}

function writeProgressBar(currentVal, maxVal, startTime) {
    let totalSeconds = (Date.now() - startTime) / 1000
    let displayMinutes = Math.floor(totalSeconds / 60)
    let displaySeconds = Math.floor(totalSeconds % 60)
    if (!displaySeconds) {
        displaySeconds = 0;
    }
    if (!displayMinutes) {
        displayMinutes = 0;
    }

    const displayMinutesStr = displayMinutes < 10 ? '0' + displayMinutes : '' + displayMinutes;
    const displaySecondsStr = displaySeconds < 10 ? '0' + displaySeconds : '' + displaySeconds;
    
    let trimmedColumnCount = process.stdout.columns * 0.85 - 12
    let completeCharCount = Math.floor(trimmedColumnCount * (currentVal / maxVal))
    if (!completeCharCount) {
        completeCharCount = 0
    }
    let incompleteCharCount = trimmedColumnCount - completeCharCount
    if (!incompleteCharCount) {
        incompleteCharCount = 0
    }

    process.stdout.write('\r' + ' '.repeat(process.stdout.columns) + '\r' + 
    '[ ' + '█'.repeat(completeCharCount) + '░'.repeat(incompleteCharCount) + ' ] (' + displayMinutesStr + ':' + displaySecondsStr + ')')
}

async function removeBackgrounds(inFolder, outFolder, args) {
    const files = await fs.readdir(inFolder);
    let currentFile = 1;
    fs.mkdirs(outFolder);
    const promises = []
    for (const f of files) {
        const stats = await fs.stat(`${inFolder}/${f}`)
        let splitFile = f.split('.')
        const fileType = splitFile[splitFile.length - 1]
        splitFile.pop()
        const fileName = splitFile.join('.')
        if(stats.isDirectory() || !(["png", "jpg", "jpeg", "jfif"].includes(fileType.toLowerCase()))) {
            files.splice(files.indexOf(f), 1)
        }
    }

    let completed = 0;
    const startTime = Date.now()
    writeProgressBar(0, files.length, startTime)
    const timerInterval = setInterval(() => {
        writeProgressBar(completed, files.length, startTime)
    }, 1000)
    for (const f of files) {
        const stats = await fs.stat(`${inFolder}/${f}`)
        let splitFile = f.split('.')
        const fileType = splitFile[splitFile.length - 1]
        splitFile.pop()
        const fileName = splitFile.join('.')

        promises.push(new Promise((resolve, reject) => {
            const localFileName = fileName
            const child = spawn('rembg', ['-a', '-ae', args.alphamatting, '-o' , `${outFolder}/${fileName}.png`, `${inFolder}/${f}`])
            child.on('error', reject)
            child.on('close', (code) => {
                if (code != 0) {
                    console.warn(`[FILE ${localFileName}] WARN: rembg child process returned with code ${code}.`)
                }
                writeProgressBar(++completed, files.length, startTime)
                resolve();
            })
            child.stdout.on('data', (data) => {  
                clearLine()
                console.log(`[FILE ${localFileName}] ${data}`)
                writeProgressBar(completed, files.length, startTime)
            })
            child.stderr.on('data', (data) => {
                clearLine()
                console.error(`[FILE ${localFileName}] ${data}`)
                writeProgressBar(completed, files.length, startTime)
            })
        }))
        if (args.slow) {
            await Promise.all(promises)
        }
        currentFile++;
    }
    await Promise.all(promises)
    clearInterval(timerInterval)
}

async function download(urlText, outputFolder, args) {
    const url = new URL(urlText)

    const htmlText = await (await fetch(urlText)).text()
    const html = parser.parse(htmlText)

    const players = html.querySelectorAll('.sidearm-list-card-item')

    const regex = /background-image:url\('(.*)'\)/

    const promises = []
    let downloaded = 0
    const startTime = Date.now()
    writeProgressBar(0, players.length)
    const timerInterval = setInterval(() => {
        writeProgressBar(downloaded, players.length, startTime)
    }, 1000)
    for (const player of players) {
        const firstName = player.querySelector('.sidearm-roster-player-first-name').text
        const lastName = player.querySelector('.sidearm-roster-player-last-name').text
        const style = player.querySelector('.sidearm-roster-player-image')._attrs.style
        let urlPart = style.match(regex)[1].split('?')[0]
        let fullURL
        if (urlPart.startsWith("http")) {
            fullURL = urlPart
        } else [
            fullURL = url.origin + urlPart
        ]
        const fileExtension = fullURL.split('.')[fullURL.split('.').length - 1]

        let img
        promises.push((async () => {
            try {
                img = await fetch(fullURL)
            } catch (e) {
                console.error(e);
                return
            }
    
            await fs.mkdirs(outputFolder)
            const file = await fs.open(outputFolder + "/" + firstName + lastName + "." + fileExtension, 'w+')
    
            await fs.write(file, await img.buffer(), 0, img.body.length)
    
            await fs.close(file)
        })().then(() => {
            writeProgressBar(++downloaded, players.length, startTime)
        }))
        if (args.slow) {
            await Promise.all(promises)
        }
    }

    await Promise.all(promises)
    clearInterval(timerInterval)
}

(async () => {
    if (process.argv.length < 4) {
        printHelp()
        return
    }
    const args = parseArgs()
    console.log("\x1b[33mBeginning download of roster headshots from " + process.argv[2] + ".\x1b[0m")
    if (args.slow) {
        console.log("\x1b[36mNOTE: Running in slow mode.\x1b[0m")
    }
    await download(process.argv[2], process.argv[3], args);
    clearLine()
    console.log("\x1b[32mDownload complete. Files located in " + process.argv[3] + ".\x1b[0m")
    clearLine()
    console.log("\x1b[33mRemoving backgrounds from downloaded images with alpha matting intensity level " + args.alphamatting + ". This may take a few minutes...\x1b[0m")
    await removeBackgrounds(process.argv[3], process.argv[3] + "/transparent", args);
    clearLine()
    console.log("\x1b[32mImage processing complete. Files located in " + process.argv[3] + "/transparent" + ".\x1b[0m")
})()