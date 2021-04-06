require('dotenv').config({path: __dirname + '/.env'});
const fetch = require('node-fetch');
const {writeFile} = require('fs/promises');
const {createHash} = require('crypto');
const {getLatestStatement} = require('./statement');
const config = require('./config.json');

const hash = ({description, id}) => createHash('md5').update(`${description}${id}`).digest('hex');

let lastTransactionHash;
try {
  ({lastTransactionHash} = require('./state.json'));
} catch (err) { }

const {TG_BOT_NAME, TG_BOT_SECRET} = process.env;
const formatCurrency = num => `₹ \`${Number(num).toLocaleString('en-IN')}\``;

async function notify(transaction) {
  const {id, description, date, withdrawal, deposit, closingBalance} = transaction;
  const debit = deposit === 0;

  const message = `*💰${debit ? '🔴 DEBIT' : '🟢 CREDIT'} @ ${config.name}*

*Amount*: ${debit ? `- ${formatCurrency(withdrawal)}` : `+ ${formatCurrency(deposit)}`}
*Description*: \`${description}\`

*Time*: \`${new Date().toTimeString().slice(0, 5)}\`
*Date*: \`${new Date(date).toDateString()}\`
*ID*: \`${id}\`

*Closing balance*: ${formatCurrency(closingBalance)}`;

  await fetch(`https://tg.mihir.ch/${TG_BOT_NAME}`, {
    method: 'POST',
    body: JSON.stringify({text: message, secret: TG_BOT_SECRET}),
    headers: {'Content-Type': 'application/json'}
  })
}

async function main() {
  console.log('Getting the latest statement...');
  const {balance, transactions} = await getLatestStatement();
  if (!balance || !transactions) {
    console.log('An error occured somehow, try again later or fix the code!');
    return process.exit();
  };
  console.log('Received statement!');
  const pendingTransactions = [];
  if (lastTransactionHash) {
    for (const transaction of transactions) {
      if (lastTransactionHash !== hash(transaction)) {
        pendingTransactions.push(transaction);
      }
      else break;
    }
  }
  !pendingTransactions.length && console.log('Nothing to notify');
  pendingTransactions.reverse().forEach(async (transaction, index) => {
    console.log('Notifying...', `[${index + 1} / ${pendingTransactions.length}]`);
    await notify(transaction);
  });
  console.log('Updating state file...');
  await writeFile(__dirname + '/state.json', JSON.stringify({
    lastTransactionHash: hash(transactions[0]),
  }));
  console.log('Everything done! Cheers :)');
}

main();
