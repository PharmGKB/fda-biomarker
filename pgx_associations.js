require('dotenv').config();
const axios = require('axios');
const tabletojson = require('tabletojson').Tabletojson;
const {JSDOM} = require("jsdom");
const db = require('./db');

const slackUrl = process.env.SLACK_URL;
const sourceUrl = 'https://www.fda.gov/medical-devices/precision-medicine/table-pharmacogenetic-associations';
const contentDatePgkbProperty = 'fdaPgxAssocContentDate';

const whitespaceRegex = /[ \n\t]{2,}/gm;
const footnoteRegex = /[†*+]$/gm;

/**
 * If the SLACK_URL env var is configured, use that webhook to post a message
 * @param text the message to post
 * @returns {Promise<void>} the POST promise
 */
const postSlack = async (text) => {
  slackUrl && await axios.post(slackUrl, {text});
};

/**
 * Converts the given DOM Element to a JSON Object. Also, removes elements that we don't want to see translated into
 * the final JSON Object (e.g. superscript elements)
 * @param {Node} el the DOM Element to convert
 * @param {function} el.getElementsByTagName
 * @param {string} el.outerHTML
 * @returns {Object} A filtered JSON Object version of the given Element
 */
const convertElementToObject = (el) => {
  const sups = el.getElementsByTagName('sup');
  for (let sup of sups) {
    sup.remove();
  }
  return tabletojson.convert(el.outerHTML)[0];
};

/**
 * Updates or inserts a PGx association to the database table. Will overwrite existing data if the
 * drugname-genesymbol-sourceid combination already exists, otherwise inserts a new row.
 * @param {object} assoc a single row of the PGx Assoc table as a JSON object
 * @param {string} fdaCurrentDate the current FDA content date
 * @returns {Promise<void>}
 */
const upsertPgxAssociation = async (assoc, fdaCurrentDate) => {
  // noinspection SqlNoDataSourceInspection,SqlResolve
  await db.none(`
      insert into pgkbcomm.fdapgxassociation (
          drugname, drugid, genesymbol, geneid, affectedsubgroup, interactiondescription, sourceid, fdaversiondate, datemodified
      )
      values (
          $1,
          (select pharmgkbaccessionid from preview.pharmgkbobjects where pharmgkbobjtypeid=17 and name=lower($1)),
          $2,
          (select pharmgkbaccessionid from preview.pharmgkbobjects where pharmgkbobjtypeid=1 and symbol=$2),
          $3,
          $4,
          (select fdaPgxAssociationId from PgkbComm.FdaPgxAssociationSource where name=$5),
          $6,
          current_timestamp)
      on conflict(drugname, genesymbol, sourceid) do update
      set drugid=excluded.drugid, geneid=excluded.geneid, affectedsubgroup=excluded.affectedsubgroup, interactiondescription=excluded.interactiondescription, fdaversiondate=excluded.fdaversiondate, datemodified=excluded.datemodified
    `, [assoc['Drug'], assoc['Gene'], assoc['Affected Subgroups'], assoc['Description of Gene-Drug Interaction'], assoc['table'], fdaCurrentDate]);
}

/**
 * Makes an HTTP request to the FDA website to get the PGx Association page then parses the table data out of it.
 * @returns {Promise<{fdaContentCurrentDate: string, table: []}>} an object of table data in an arry of objects and the listed content date
 */
const requestDataFromFda = async () => {
  const r = await axios.get(sourceUrl);
  const dom = new JSDOM(r.data);
  const firstTable = convertElementToObject(dom.window.document.querySelector('#main-content div div.inset-column:nth-of-type(1) table'));
  firstTable.forEach((r) => r.table = 'recommendations');
  const secondTable = convertElementToObject(dom.window.document.querySelector('#main-content div div.inset-column:nth-of-type(2) table'));
  secondTable.forEach((r) => r.table = 'safety_or_response');
  const thirdTable = convertElementToObject(dom.window.document.querySelector('#main-content div div.inset-column:nth-of-type(3) table'));
  thirdTable.forEach((r) => r.table = 'pk');
  const jsonData = [...firstTable, ...secondTable, ...thirdTable];

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
  return {table, fdaContentCurrentDate};
}

/**
 * Query the last known FDA content date from the PgkbProperty table
 * @returns {Promise<string>} the string content date
 */
const lookupPreviousContentDate = async () => {
  // noinspection SqlResolve,SqlNoDataSourceInspection
  const rez = await db.oneOrNone('select value from pgkbcomm.pharmgenproperties where name=$1', [contentDatePgkbProperty]);
  return rez?.value || 'None';
}

const updateContentDate = async (newContentDate) => {
  // noinspection SqlResolve,SqlNoDataSourceInspection
  db.none(
    'insert into pgkbcomm.pharmgenproperties(name,value) values ($1, $2) on conflict(name) do update set value=excluded.value, version=excluded.version+1',
    [contentDatePgkbProperty, newContentDate],
  ).catch((e) => console.error(e));
}

/**
 * The main method
 * @returns {Promise<void>}
 */
const executeUpdate = async () => {
  const {table, fdaContentCurrentDate} = await requestDataFromFda();
  const fdaContentPreviousDate = await lookupPreviousContentDate();

  for (const tableKey in table) {
    if (table.hasOwnProperty(tableKey)) {
      await upsertPgxAssociation(table[tableKey], fdaContentCurrentDate);
    }
  }
  if (fdaContentPreviousDate !== fdaContentCurrentDate) {
    await updateContentDate(fdaContentCurrentDate);
    const message = `Difference detected in FDA PGx Assoc table ${fdaContentPreviousDate} => ${fdaContentCurrentDate}`;
    console.log(message);
    postSlack(':exclamation: ' + message);
  } else {
    console.log('No table change detected, no update to file');
  }
}

try {
  executeUpdate().then(() => console.log('Done writing to DB'));
}
catch(e) {
  console.error("There was a problem downloading the FDA list: " + e);
  console.error(e.stack);
  postSlack('Error running the PGx assocation checker: ' + e);
}
