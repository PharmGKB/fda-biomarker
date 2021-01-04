require('dotenv').config();
const fs = require('fs');
const md5 = require('md5');
const axios = require('axios');
const tabletojson = require('tabletojson').Tabletojson;
const {JSDOM} = require("jsdom");

const slackUrl = process.env.SLACK_URL;
const sourceUrl = 'https://www.fda.gov/drugs/science-research-drugs/table-pharmacogenomic-biomarkers-drug-labeling';
const fileName = './fda_pgx_biomarker_table.json';

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
    const jsonData = tabletojson.convert(dom.window.document.querySelector('#guidance').outerHTML)[0];
    const fdaContentCurrentDate = dom.window.document.querySelector('div.node-current-date li div p time').innerHTML;

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

      if (!previousTable || !previousTable.tableHash || previousTable.tableHash !== tableHash || previousTable.fdaContentCurrentDate !== fdaContentCurrentDate) {
        const prettyJson = JSON.stringify(
          {
            collectedOn: new Date(),
            fdaContentCurrentDate,
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
