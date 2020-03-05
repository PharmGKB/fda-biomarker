require('dotenv').config();
const fs = require('fs');
const md5 = require('md5');
const axios = require('axios');
const tabletojson = require('tabletojson');
const {JSDOM} = require("jsdom");

const slackUrl = process.env.SLACK_URL;
const sourceUrl = 'https://www.fda.gov/medical-devices/precision-medicine/table-pharmacogenetic-associations';
const fileName = './fda_pgx_associations_table.json';

const whitespaceRegex = /[ \n\t]{2,}/gm;
const footnoteRegex = /[†*]$/gm;

/**
 * If the SLACK_URL env var is configured, use that webhook to post a message
 * @param text the message to post
 * @returns {Promise<void>} the POST promise
 */
const postSlack = async (text) => {
  slackUrl && await axios.post(slackUrl, {text});
};

axios
  .get(sourceUrl)
  .then((r) => {
    const dom = new JSDOM(r.data);
    const firstTable = tabletojson.convert(dom.window.document.querySelector('#main-content div div.inset-column:nth-of-type(1) table').outerHTML)[0];
    firstTable.forEach((r) => r.table = 'recommendation');
    const secondTable = tabletojson.convert(dom.window.document.querySelector('#main-content div div.inset-column:nth-of-type(2) table').outerHTML)[0];
    secondTable.forEach((r) => r.table = 'impact');
    const thirdTable = tabletojson.convert(dom.window.document.querySelector('#main-content div div.inset-column:nth-of-type(3) table').outerHTML)[0];
    thirdTable.forEach((r) => r.table = 'pk');
    const jsonData = [...firstTable, ...secondTable, ...thirdTable];

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

    const tableHash = md5(JSON.stringify(table, null, 2));

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
        postSlack(':exclamation: Detected changes in the biomarker table');
      } else {
        console.log('No table change detected, no update to file');
        postSlack('Checked the biomarker table, no changes detected.');
      }
    });
  })
  .catch((e) => {
    console.error("There was a problem downloading the FDA list: " + e);
    postSlack('Error running the biomarker checker: ' + e);
  });
