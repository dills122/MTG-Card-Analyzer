# MTG Card Analyzer

[![Build Status](https://travis-ci.org/dills122/MTG-Card-Analyzer.svg?branch=master)](https://travis-ci.org/dills122/MTG-Card-Analyzer)
[![CodeFactor](https://www.codefactor.io/repository/github/dills122/mtg-card-analyzer/badge)](https://www.codefactor.io/repository/github/dills122/mtg-card-analyzer)

A collectors dream application, that gives you the ability to take pictures of your cards and have them instantly be recognized and added to your collection. This app will scan each image uploaded attempt to grab the name of the card and analyze the set image in an attempt to match it with a given set.

## Example

Here is a test extraction:

### Original Card

<p align="center">
  <img width="500" height="696" src=".\src\test-images\PlatinumAngel.jpg" alt="Logo Image">
</p>

### Name Extraction

Extracted Text: `g Platinum Angel`

Cleaned Extracted Text: `gPlatinumAngel`

#### Before Pre Processing

<p align="center">
  <img width="500" height="100" src=".\src\test-images\test-extractions\8170e28d-ba4a-4918-8246-0a6c7840a330.jpg" alt="Logo Image">
</p>

#### After Pre-Processing

<p align="center">
  <img width="500" height="100" src=".\src\test-images\test-extractions\24b0e728-dd4b-487d-aefa-26e707566130.jpg" alt="Logo Image">
</p>

### Type Extraction

Extracted Text: `E Artifact Creature —- Angel`

Cleaned Extracted Text: `EArtifactCreatureAngel`

#### Before Pre-Processing

<p align="center">
  <img width="500" height="100" src=".\src\test-images\test-extractions\2312b662-a0e7-4589-bba9-62d990a6726f.jpg" alt="Logo Image">
</p>

#### After Pre-Processing

<p align="center">
  <img width="500" height="100" src=".\src\test-images\test-extractions\19c600f5-28ae-4599-81ee-9df8058ce8df.jpg" alt="Logo Image">
</p>


More examples are available [here](https://github.com/dills122/mtg-card-analyzer/tree/master/src/test-images)

## Getting Up And Running

### Getting Started

Clone repo
> `git clone https://github.com/dills122/MTG-Card-Analyzer.git`

Install dependencies
> `npm i`

Navigate to the repo's directory, you will need to setup a few things first

* create a `secure.config.js` to connect to your own RDS instance, or ignore this step
* Run this script to seed your local name dictionary
  * `node .\src\db-local\bulk-insert.js`
* Optional, to setup the test files navigate to `index.js` to edit the test file array

### Current Commands

* `fake` : this is just a test command to run a image listed in the test file array in `index.js`
* `scan <filePath>` : this command scans a single image and outputs the results to the terminal

Test files are provided at `src\test-images`

## Road Map

### Version 0.1.0

* RDS database setup for tracking collection
* OCR for card name working ✔️
* MTG Api integration (will be less accurate without set matching) (Currently only bulk name insert)
* Basic UI for viewing records (moving to separate app)
* Basic Admin functionality (strech goal) 🔼

***Needs improved after 0.1.0***

### Version 0.2.0

* Set recognition (through pixel matching)
* Set recognition (shortlist of sets to match on)
* Gather image collection of all set images
* Improved UI


### Version 0.3.0 ?

* Improved UI Admin/User
* Price scraping or api
* Price tracking cron jobs (seperate app, cloud)