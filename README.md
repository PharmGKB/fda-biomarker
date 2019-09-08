# FDA Table of Pharmacogenomic Biomarkers in Drug Labeling

This code scrapes content from the "[Table of Pharmacogenomic Biomarkers in Drug Labeling](https://www.fda.gov/drugs/science-research-drugs/table-pharmacogenomic-biomarkers-drug-labeling)" page on the FDA website. Specifically, this will transform the content of the "Pharmacogenomic Biomarkers in Drug Labeling" table into a JSON file for better computational use.

CAUTION: This data file strips out all footnotes and contextual information about the contents of the Biomarkers table. Go read the [original page](https://www.fda.gov/drugs/science-research-drugs/table-pharmacogenomic-biomarkers-drug-labeling) before attempting to use this data.

The text is copied verbatim from the HTML source with the following exceptions:

1. Footnote glyphs are removed from field titles
2. redundant whitespace (spaces, newlines, tabs) are replaced with a single space in field values

## Setup

Make sure you have [Node.js](https://nodejs.org/en/) and [NPM](https://www.npmjs.com) installed. Download dependencies with the following command:

```shell script
npm i
```


## Running

To run the script:

```shell script
node --harmony biomarker.js
```

This will store a timestamped JSON file with an accompanying MD5 hash of that file to an `out` directory.
 
