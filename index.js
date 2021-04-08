require('dotenv').config({path: __dirname + '/.env'});
const fetch = require('node-fetch');
const {writeFile} = require('fs/promises');
const {createHash} = require('crypto');
const path = require('path');
const {launchBrowserAndLogin, getLatestStatement, logoutAndCloseBrowser} = require('./statement');
const config = require(path.resolve('./', process.argv[2] ?? 'config.json'));

const hash = ({description, id}) => createHash('md5').update(`${description}${id}`).digest('hex');

let state;
try {
  state = require('./state.json');
} catch (err) {
  state = {};
}

const {TG_BOT_NAME, TG_BOT_SECRET} = process.env;
const formatCurrency = num => `₹ \`${Number(num).toLocaleString('en-IN')}\``;

async function notify(transaction, account) {
  const {id, description, date, withdrawal, deposit, closingBalance} = transaction;
  const debit = deposit === 0;

  const message = `*💰${debit ? '🔴 DEBIT' : '🟢 CREDIT'} @ ${account}*

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
  const [browser, page] = (await launchBrowserAndLogin(config)) || [];
  if (!browser || !page) {
    console.log('An error while logging in, try again later or fix the code!');
    return process.exit();
  }
  for (let index = 0; index < config.accounts.length; index++) {
    const account = config.accounts[index];
    console.log('\033[1mRunning on', account, '\033[0m');
    console.log('Getting the latest statement...');
    const {balance, transactions} = await getLatestStatement(config, page, index);
    if (!balance || !transactions) {
      console.log('An error occured somehow, try again later or fix the code!');
      return process.exit();
    };
    console.log('Received statement!');
    const pendingTransactions = [];
    const lastTransactionHash = state[account];
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
      await notify(transaction, account);
    });
    console.log('Updating state file...');
    state[account] = hash(transactions[0]);
    await writeFile(__dirname + '/state.json', JSON.stringify(state));
    console.log('Everything done! Cheers :)');
  }
  await logoutAndCloseBrowser(browser, page);
}

main();
