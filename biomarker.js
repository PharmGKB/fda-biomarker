const fs = require('fs');
const md5 = require('md5');
const axios = require('axios');
const tabletojson = require('tabletojson');
const {JSDOM} = require("jsdom");

const sourceUrl = 'https://www.fda.gov/drugs/science-research-drugs/table-pharmacogenomic-biomarkers-drug-labeling';
const fileName = './fda_pgx_biomarker_table.json';

const whitespaceRegex = /[ \n\t]{2,}/gm;
const footnoteRegex = /[†*]$/gm;

axios
  .get(sourceUrl)
  .then((r) => {
    const dom = new JSDOM(r.data);
    const jsonData = tabletojson.convert(dom.window.document.querySelector('#guidance').outerHTML)[0];

    const table = [];
    jsonData.forEach(l => {
      const normalLabel = {};
      for (const key in l) {
        if (l.hasOwnProperty(key)) {
          // normalize both the key and the value of the map, removing unnecessary characters
          normalLabel[key.replace(footnoteRegex, '')] = l[key].replace(whitespaceRegex, ' ');
        }
      }
      table.push(normalLabel);
    });

    const tableHash = md5(table);

    fs.readFile(fileName, (err, data) => {
      // halt if there's a problem reading, but "missing file" (ENOENT) is ok
      if (err && err.code !== 'ENOENT') throw err;

      const previousTable = data && JSON.parse(data);

      if (!previousTable || !previousTable.tableHash || previousTable.tableHash !== tableHash) {
        const prettyJson = JSON.stringify(
          {
            collectedOn: new Date(),
            sourceUrl,
            tableHash,
            table,
          },
          null,
          2
        );
        fs.writeFileSync(fileName, prettyJson);
        console.log(`Successfully wrote table data to ${fileName}`);
      } else {
        console.log('No table change detected, no update to file');
      }
    });
  })
  .catch((e) => {
    console.error("There was a problem downloading the FDA list: " + e);
  });
