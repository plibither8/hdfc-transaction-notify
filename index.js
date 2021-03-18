require('dotenv').config();
const fetch = require('node-fetch');
const { wait, getLatestStatement } = require('./statement');
const { TG_BOT_NAME, TG_BOT_SECRET } = process.env;
const DELAY = 5 * 60 * 1000; // 5 minutes
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
  let lastTransactionId;
  while (true) {
    const { balance, transactions } = await getLatestStatement();
    const pendingTransactions = [];
    for (const transaction of transactions) {
      if (transaction.id !== lastTransactionId) pendingTransactions.push(transaction);
      else break;
    }
    lastTransactionId = transactions[0].id;
    for (const transaction of pendingTransactions.reverse()) {
      await notify(transaction);
    }
    await wait(DELAY);
  }
}

main();
