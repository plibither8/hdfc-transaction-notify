require('dotenv').config({ path: __dirname + '/.env' });
const fetch = require('node-fetch');
const { writeFile } = require('fs/promises');
const { getLatestStatement } = require('./statement');

let lastTransactionId;
try {
  ({ lastTransactionId } = require('./state.json'));
} catch (err) {}

const { TG_BOT_NAME, TG_BOT_SECRET } = process.env;
const formatCurrency = num => `₹ \`${Number(num).toLocaleString('en-IN')}\``;

async function notify(transaction) {
  const { id, description, date, withdrawal, deposit, closingBalance } = transaction;
  const debit = deposit === 0;

  const message = `*💰${debit ? '🔴 DEBIT' : '🟢 CREDIT'}*

*Amount*: ${debit ? `- ${formatCurrency(withdrawal)}` : `+ ${formatCurrency(deposit)}`}
*Description*: \`${description}\`

*Time*: \`${new Date().toTimeString().slice(0, 5)}\`
*Date*: \`${new Date(date).toDateString()}\`
*ID*: \`${id}\`

*Closing balance*: ${formatCurrency(closingBalance)}`;

  await fetch(`https://tg.mihir.ch/${TG_BOT_NAME}`, {
    method: 'POST',
    body: JSON.stringify({ text: message, secret: TG_BOT_SECRET }),
    headers: { 'Content-Type': 'application/json' }
  })
}

async function main() {
  const { balance, transactions } = await getLatestStatement();
  const pendingTransactions = [];
  for (const transaction of transactions) {
    if (lastTransactionId && transaction.id !== lastTransactionId) {
      pendingTransactions.push(transaction);
    }
    else break;
  }
  await writeFile(__dirname + '/state.json', JSON.stringify({
    lastTransactionId: transactions[0].id,
  }));
  for (const transaction of pendingTransactions.reverse()) {
    await notify(transaction);
  }
}

main();
