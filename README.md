# Sidearm Roster Image Puller
Pulls all the player photos from a Sidearm Stats roster page and automatically removes their background.

## Usage
`node main.js [sidearm-roster-url] [output-folder] [options]`

### Options
|Option|Description|
|----|-----------|
|`-s`|Slow mode. When enabled, all downloads and image processing will happen consecutively. When disabled, all downloads and image processing will happen concurrently. Enabling slow mode will save resources but may take longer.|
|`-a=#`|Alpha filtration level. Higher numbers will result in more of the background being removed from fuzzy edges (e.g. hair), but may result in imperfections. Higher numbers may result in longer processing times.|

## Setup
1. Install [rembg](https://github.com/danielgatis/rembg) and add it to your path.
2. Run `npm install`

## Tested with:
* Python 3.9
* Node 16.10.0


