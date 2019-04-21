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

<p align="center">
  <img width="500" height="100" src=".\src\test-images\test-extractions\8170e28d-ba4a-4918-8246-0a6c7840a330.jpg" alt="Logo Image">
</p>

### Type Extraction

Extracted Text: `E Artifact Creature —- Angel`

Cleaned Extracted Text: `EArtifactCreatureAngel`

<p align="center">
  <img width="500" height="100" src=".\src\test-images\test-extractions\2312b662-a0e7-4589-bba9-62d990a6726f.jpg" alt="Logo Image">
</p>


More examples are available [here](https://github.com/dills122/mtg-card-analyzer/tree/master/src/test-images)

## Road Map

### Version 0.1.0

* RDS database setup for tracking collection
* OCR for card name working
* MTG Api integration (will be less accurate without set matching)
* Basic UI for viewing records
* Basic Admin functionality (strech goal)


### Version 0.2.0

* Set recognition (through pixel matching)
* Set recognition (shortlist of sets to match on)
* Gather image collection of all set images
* Improved UI


### Version 0.3.0 ?

* Improved UI Admin/User
* Price scraping or api
* Price tracking cron jobs (seperate app, cloud)