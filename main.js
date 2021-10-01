const parser = require('node-html-parser')
const fs = require('fs-extra')
const fetch = require('node-fetch');
const { spawnSync } = require("child_process");

/*
@echo off
setlocal ENABLEDELAYEDEXPANSION
mkdir %1\transparent
set count=1
set total=0

for /f %%A in ('dir /A-D %1 ^| find "File(s)"') do set total=%%A
echo File count: %total%

for /f "delims=" %%f in ('dir /b /A-D %1') do (
	echo Processing %%~nf...
	rembg -a -ae 50 -o %1/transparent/"%%~nf.png" %1/"%%f"
	echo File !count! of %total% complete - %%f
	set /a count = !count! + 1
)
*/

async function removeBackgrounds(inFolder, outFolder, alphaFiltrationLevel = 50) {
    const files = await fs.readdir(inFolder);
    let currentFile = 1;
    fs.mkdirs(outFolder);
    for (const f of files) {
        const stats = await fs.stat(`${inFolder}/${f}`)
        let splitFile = f.split('.')
        const fileType = splitFile[splitFile.length - 1]
        splitFile.pop()
        const fileName = splitFile.join('.')
        if(stats.isDirectory() || !(["png", "jpg", "jpeg", "jfif"].includes(fileType))) {
            continue;
        }

        console.log(`Processing file ${currentFile} of ${files.length}...`)
        spawnSync('rembg', ['-a', '-ae', alphaFiltrationLevel, '-o' , `${outFolder}/${fileName}.png`, `${inFolder}/${f}`])
        console.log(`File ${currentFile++} completed.`)
    }
}

async function download(urlText, outputFolder) {
    const url = new URL(urlText)

    const htmlText = await (await fetch(urlText)).text()
    const html = parser.parse(htmlText)

    const players = html.querySelectorAll('.sidearm-list-card-item')

    const regex = /background-image:url\('(.*)'\)/

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

        console.log(firstName, lastName, fullURL)

        let img
        try {
            img = await fetch(fullURL)
        } catch (e) {
            console.error(e);
            continue;
        }

        await fs.mkdirs(outputFolder)
        const file = await fs.open(outputFolder + "/" + firstName + lastName + "." + fileExtension, 'w+')

        await fs.write(file, await img.buffer(), 0, img.body.length)

        await fs.close(file)
    }
}

(async () => {
    if (process.argv.length < 4) {
        console.error("Invalid syntax! <sidearms-roster-url> <output-folder> [alpha-filter=50]")
        return
    }
    console.log("\x1b[33mBeginning download of roster headshots from " + process.argv[2] + ".\x1b[0m")
    await download(process.argv[2], process.argv[3]);
    console.log("\x1b[33mRemoving backgrounds from downloaded images with alpha matting intensity level " + (process.argv[4] ? process.argv[4] : 50) + ".\x1b[0m")
    await removeBackgrounds(process.argv[3], process.argv[3] + "/transparent", process.argv[4]);
    console.log("\x1b[32mComplete. Files located in " + process.argv[3] + "/transparent" + ".\x1b[0m")
})()